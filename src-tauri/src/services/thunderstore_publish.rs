use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Experimental API used for profile codes as well as uploads and submission.
pub const API_BASE: &str = "https://thunderstore.io/api/experimental";
const COMMUNITY: &str = "valheim";
const MODPACK_CATEGORY: &str = "modpacks";
const KEYRING_SERVICE: &str = "com.macheim";
const KEYRING_ACCOUNT: &str = "thunderstore-token";

// ── Token storage (macOS Keychain) ──────────────────────────────

/// The saved service-account token, or `None` when the user has not signed in.
pub fn stored_token() -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| AppError::Thunderstore(format!("Could not open the Keychain: {}", e)))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Thunderstore(format!(
            "Could not read the saved token: {}",
            e
        ))),
    }
}

pub fn store_token(token: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| AppError::Thunderstore(format!("Could not open the Keychain: {}", e)))?;
    entry
        .set_password(token)
        .map_err(|e| AppError::Thunderstore(format!("Could not save the token: {}", e)))
}

pub fn clear_token() -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|e| AppError::Thunderstore(format!("Could not open the Keychain: {}", e)))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Thunderstore(format!(
            "Could not remove the saved token: {}",
            e
        ))),
    }
}

// ── Account status ──────────────────────────────────────────────

/// A community category a modpack can be published under.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub name: String,
    pub slug: String,
}

#[derive(Debug, Deserialize)]
struct CategoryPage {
    results: Vec<Category>,
}

/// The Valheim community's categories, used by the publish dialog.
pub async fn fetch_valheim_categories() -> AppResult<Vec<Category>> {
    fetch_valheim_categories_at(API_BASE).await
}

async fn fetch_valheim_categories_at(base: &str) -> AppResult<Vec<Category>> {
    let response = reqwest::Client::new()
        .get(format!("{}/community/{}/category/", base, COMMUNITY))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }
    Ok(response.json::<CategoryPage>().await?.results)
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthStatus {
    pub signed_in: bool,
    pub username: Option<String>,
    pub teams: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CurrentUser {
    #[serde(default)]
    pub username: Option<String>,
    #[serde(default)]
    pub teams: Vec<String>,
}

/// Validate a token and return the account it belongs to. `Ok(None)` means
/// Thunderstore rejected the token; `Err` means the request itself failed.
pub async fn validate_token(token: &str) -> AppResult<Option<CurrentUser>> {
    validate_token_at(API_BASE, token).await
}

async fn validate_token_at(base: &str, token: &str) -> AppResult<Option<CurrentUser>> {
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{}/current-user/", base))
        .bearer_auth(token)
        .send()
        .await?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }

    Ok(Some(response.json::<CurrentUser>().await?))
}

// ── Publishing ──────────────────────────────────────────────────

/// Progress for one publish, emitted to the UI while it runs.
#[derive(Debug, Clone, Serialize)]
pub struct PublishProgress {
    pub stage: String,
    pub current: usize,
    pub total: usize,
    pub bytes_uploaded: u64,
    pub bytes_total: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PublishOutcome {
    pub full_name: String,
    pub version_number: String,
    pub package_url: String,
}

#[derive(Debug, Deserialize)]
struct InitiateUploadResponse {
    user_media: UserMedia,
    upload_urls: Vec<UploadPartUrl>,
}

#[derive(Debug, Deserialize)]
struct UserMedia {
    uuid: String,
}

#[derive(Debug, Deserialize)]
struct UploadPartUrl {
    part_number: i32,
    url: String,
    offset: u64,
    length: u64,
}

/// S3 wants the ETag exactly as its part response returned it, quotes included.
#[derive(Debug, Serialize)]
struct CompletedPart {
    #[serde(rename = "ETag")]
    etag: String,
    #[serde(rename = "PartNumber")]
    part_number: i32,
}

#[derive(Debug, Serialize)]
struct FinishUploadRequest<'a> {
    parts: &'a [CompletedPart],
}

#[derive(Debug, Serialize)]
struct SubmitRequest<'a> {
    upload_uuid: &'a str,
    author_name: &'a str,
    communities: [&'a str; 1],
    categories: Vec<&'a str>,
    has_nsfw_content: bool,
    community_categories: BTreeMap<&'a str, Vec<&'a str>>,
}

#[derive(Debug, Deserialize)]
struct SubmitResponse {
    package_version: SubmittedVersion,
}

#[derive(Debug, Deserialize)]
struct SubmittedVersion {
    #[serde(default)]
    namespace: Option<String>,
    name: String,
    version_number: String,
    #[serde(default)]
    full_name: Option<String>,
}

/// Upload and publish a modpack zip under `team`. The modpacks category is
/// always included; `categories` adds further community categories.
pub async fn publish(
    token: &str,
    zip: &[u8],
    filename: &str,
    team: &str,
    categories: &[String],
    has_nsfw_content: bool,
    progress: &(dyn Fn(PublishProgress) + Send + Sync),
) -> AppResult<PublishOutcome> {
    publish_at(
        API_BASE,
        token,
        zip,
        filename,
        team,
        categories,
        has_nsfw_content,
        progress,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn publish_at(
    base: &str,
    token: &str,
    zip: &[u8],
    filename: &str,
    team: &str,
    categories: &[String],
    has_nsfw_content: bool,
    progress: &(dyn Fn(PublishProgress) + Send + Sync),
) -> AppResult<PublishOutcome> {
    let client = reqwest::Client::new();

    // 1. Reserve an upload and learn where the parts go.
    let response = client
        .post(format!("{}/usermedia/initiate-upload/", base))
        .bearer_auth(token)
        .json(&serde_json::json!({
            "filename": filename,
            "file_size_bytes": zip.len(),
        }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }
    let upload: InitiateUploadResponse = response.json().await?;

    // 2. Upload each part to its pre-signed URL, collecting the ETags.
    let total_parts = upload.upload_urls.len();
    let mut completed = Vec::with_capacity(total_parts);
    let mut uploaded: u64 = 0;

    for (index, part) in upload.upload_urls.iter().enumerate() {
        let start = part.offset as usize;
        let end = start
            .checked_add(part.length as usize)
            .ok_or_else(|| AppError::Thunderstore("Invalid upload range".to_string()))?;
        let chunk = zip.get(start..end).ok_or_else(|| {
            AppError::Thunderstore("The upload range falls outside the package".to_string())
        })?;

        let response = client.put(&part.url).body(chunk.to_vec()).send().await?;
        if !response.status().is_success() {
            return Err(api_error(response).await);
        }
        let etag = response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string)
            .ok_or_else(|| {
                AppError::Thunderstore("An upload part came back without an ETag".to_string())
            })?;

        completed.push(CompletedPart {
            etag,
            part_number: part.part_number,
        });
        uploaded += part.length;

        progress(PublishProgress {
            stage: "uploading".to_string(),
            current: index + 1,
            total: total_parts,
            bytes_uploaded: uploaded,
            bytes_total: zip.len() as u64,
            message: format!("Uploading part {}/{}", index + 1, total_parts),
        });
    }

    // 3. Close the multipart upload.
    progress(PublishProgress {
        stage: "finalizing".to_string(),
        current: total_parts,
        total: total_parts,
        bytes_uploaded: zip.len() as u64,
        bytes_total: zip.len() as u64,
        message: "Finishing the upload...".to_string(),
    });
    let response = client
        .post(format!(
            "{}/usermedia/{}/finish-upload/",
            base, upload.user_media.uuid
        ))
        .bearer_auth(token)
        .json(&FinishUploadRequest { parts: &completed })
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }

    // 4. Submit the uploaded package for the Valheim community.
    progress(PublishProgress {
        stage: "submitting".to_string(),
        current: total_parts,
        total: total_parts,
        bytes_uploaded: zip.len() as u64,
        bytes_total: zip.len() as u64,
        message: "Publishing...".to_string(),
    });
    let mut community_categories = BTreeMap::new();
    community_categories.insert(COMMUNITY, category_slugs(categories));
    let response = client
        .post(format!("{}/submission/submit/", base))
        .bearer_auth(token)
        .json(&SubmitRequest {
            upload_uuid: &upload.user_media.uuid,
            author_name: team,
            communities: [COMMUNITY],
            categories: Vec::new(),
            has_nsfw_content,
            community_categories,
        })
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(api_error(response).await);
    }
    let result: SubmitResponse = response.json().await?;

    let namespace = result
        .package_version
        .namespace
        .unwrap_or_else(|| team.to_string());
    let full_name = result
        .package_version
        .full_name
        .unwrap_or_else(|| format!("{}-{}", namespace, result.package_version.name));

    Ok(PublishOutcome {
        full_name,
        version_number: result.package_version.version_number,
        package_url: format!(
            "https://thunderstore.io/c/{}/p/{}/{}/",
            COMMUNITY, namespace, result.package_version.name
        ),
    })
}

/// The modpacks category is what lists the package as a modpack, so it always
/// leads; the publisher's extra categories follow, deduplicated.
fn category_slugs(categories: &[String]) -> Vec<&str> {
    let mut slugs = vec![MODPACK_CATEGORY];
    for category in categories {
        let slug = category.as_str();
        if !slug.is_empty() && !slugs.contains(&slug) {
            slugs.push(slug);
        }
    }
    slugs
}

/// Turn a failed API response into a readable error, preferring the API's own
/// message so duplicate versions and validation problems surface clearly.
async fn api_error(response: reqwest::Response) -> AppError {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    let detail = serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| {
            value
                .get("detail")
                .and_then(|detail| detail.as_str())
                .map(str::to_string)
                .or_else(|| {
                    value
                        .get("non_field_errors")
                        .and_then(|errors| errors.as_array())
                        .and_then(|errors| errors.first())
                        .and_then(|first| first.as_str())
                        .map(str::to_string)
                })
        })
        .unwrap_or_else(|| body.chars().take(300).collect());

    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        AppError::Thunderstore(format!("Thunderstore rejected the token: {}", detail))
    } else {
        AppError::Thunderstore(format!(
            "Thunderstore returned {}: {}",
            status.as_u16(),
            detail
        ))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use serde_json::json;
    use wiremock::matchers::{body_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    use super::*;

    fn collector() -> (
        Arc<Mutex<Vec<PublishProgress>>>,
        impl Fn(PublishProgress) + Send + Sync,
    ) {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let handle = Arc::clone(&seen);
        (seen, move |progress| handle.lock().unwrap().push(progress))
    }

    fn zip_bytes() -> Vec<u8> {
        (0..10u8).collect()
    }

    #[tokio::test]
    async fn uploads_parts_and_submits_the_package() {
        let server = MockServer::start().await;

        Mock::given(method("POST"))
            .and(path("/usermedia/initiate-upload/"))
            .and(header("authorization", "Bearer tss_test"))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "user_media": { "uuid": "11111111-1111-1111-1111-111111111111", "filename": "pack.zip", "size": 10 },
                "upload_urls": [
                    { "part_number": 1, "url": format!("{}/part-1", server.uri()), "offset": 0, "length": 6 },
                    { "part_number": 2, "url": format!("{}/part-2", server.uri()), "offset": 6, "length": 4 }
                ]
            })))
            .mount(&server)
            .await;

        Mock::given(method("PUT"))
            .and(path("/part-1"))
            .and(wiremock::matchers::body_bytes(vec![0, 1, 2, 3, 4, 5]))
            .respond_with(ResponseTemplate::new(200).insert_header("ETag", "\"etag-one\""))
            .mount(&server)
            .await;

        Mock::given(method("PUT"))
            .and(path("/part-2"))
            .and(wiremock::matchers::body_bytes(vec![6, 7, 8, 9]))
            .respond_with(ResponseTemplate::new(200).insert_header("ETag", "\"etag-two\""))
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path(
                "/usermedia/11111111-1111-1111-1111-111111111111/finish-upload/",
            ))
            .and(body_json(json!({
                "parts": [
                    { "ETag": "\"etag-one\"", "PartNumber": 1 },
                    { "ETag": "\"etag-two\"", "PartNumber": 2 }
                ]
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "uuid": "11111111-1111-1111-1111-111111111111",
                "filename": "pack.zip",
                "size": 10
            })))
            .mount(&server)
            .await;

        Mock::given(method("POST"))
            .and(path("/submission/submit/"))
            .and(body_json(json!({
                "upload_uuid": "11111111-1111-1111-1111-111111111111",
                "author_name": "MyTeam",
                "communities": ["valheim"],
                "categories": [],
                "has_nsfw_content": false,
                "community_categories": { "valheim": ["modpacks", "client-side"] }
            })))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "package_version": {
                    "namespace": "MyTeam",
                    "name": "MyPack",
                    "version_number": "1.0.0",
                    "full_name": "MyTeam-MyPack"
                },
                "available_communities": []
            })))
            .mount(&server)
            .await;

        let (seen, progress) = collector();
        let outcome = publish_at(
            &server.uri(),
            "tss_test",
            &zip_bytes(),
            "MyPack-1.0.0.zip",
            "MyTeam",
            &["client-side".to_string(), "modpacks".to_string()],
            false,
            &progress,
        )
        .await
        .unwrap();

        assert_eq!(outcome.full_name, "MyTeam-MyPack");
        assert_eq!(outcome.version_number, "1.0.0");
        assert_eq!(
            outcome.package_url,
            "https://thunderstore.io/c/valheim/p/MyTeam/MyPack/"
        );

        let stages: Vec<String> = seen
            .lock()
            .unwrap()
            .iter()
            .map(|progress| progress.stage.clone())
            .collect();
        assert_eq!(
            stages,
            vec!["uploading", "uploading", "finalizing", "submitting"]
        );
    }

    #[tokio::test]
    async fn a_rejected_token_is_named_in_the_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/usermedia/initiate-upload/"))
            .respond_with(
                ResponseTemplate::new(401).set_body_json(json!({ "detail": "Invalid token" })),
            )
            .mount(&server)
            .await;

        let (_, progress) = collector();
        let error = publish_at(
            &server.uri(),
            "tss_bad",
            &zip_bytes(),
            "pack.zip",
            "MyTeam",
            &[],
            false,
            &progress,
        )
        .await
        .unwrap_err();

        let message = error.to_string();
        assert!(message.contains("rejected the token"), "{}", message);
        assert!(message.contains("Invalid token"), "{}", message);
    }

    #[tokio::test]
    async fn a_duplicate_version_surfaces_the_api_message() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/usermedia/initiate-upload/"))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({
                "user_media": { "uuid": "22222222-2222-2222-2222-222222222222", "filename": "pack.zip", "size": 10 },
                "upload_urls": [
                    { "part_number": 1, "url": format!("{}/part", server.uri()), "offset": 0, "length": 10 }
                ]
            })))
            .mount(&server)
            .await;
        Mock::given(method("PUT"))
            .and(path("/part"))
            .respond_with(ResponseTemplate::new(200).insert_header("ETag", "\"etag\""))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path(
                "/usermedia/22222222-2222-2222-2222-222222222222/finish-upload/",
            ))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "uuid": "22222222-2222-2222-2222-222222222222",
                "filename": "pack.zip",
                "size": 10
            })))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/submission/submit/"))
            .respond_with(ResponseTemplate::new(400).set_body_json(json!({
                "detail": "Package version already exists"
            })))
            .mount(&server)
            .await;

        let (_, progress) = collector();
        let error = publish_at(
            &server.uri(),
            "tss_test",
            &zip_bytes(),
            "pack.zip",
            "MyTeam",
            &[],
            false,
            &progress,
        )
        .await
        .unwrap_err();

        let message = error.to_string();
        assert!(message.contains("400"), "{}", message);
        assert!(message.contains("already exists"), "{}", message);
    }

    #[tokio::test]
    async fn current_user_reports_teams() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/current-user/"))
            .and(header("authorization", "Bearer tss_test"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "username": "someone",
                "capabilities": ["package.submit"],
                "teams": ["MyTeam", "OtherTeam"]
            })))
            .mount(&server)
            .await;

        let user = validate_token_at(&server.uri(), "tss_test")
            .await
            .unwrap()
            .unwrap();

        assert_eq!(user.username.as_deref(), Some("someone"));
        assert_eq!(user.teams, vec!["MyTeam", "OtherTeam"]);
    }

    #[tokio::test]
    async fn a_rejected_token_validates_as_none() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/current-user/"))
            .respond_with(
                ResponseTemplate::new(401).set_body_json(json!({ "detail": "Invalid token" })),
            )
            .mount(&server)
            .await;

        assert!(validate_token_at(&server.uri(), "tss_bad")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn valheim_categories_are_listed() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/community/valheim/category/"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "pagination": { "next_link": null, "previous_link": null },
                "results": [
                    { "name": "Modpacks", "slug": "modpacks" },
                    { "name": "Client-side", "slug": "client-side" }
                ]
            })))
            .mount(&server)
            .await;

        let categories = fetch_valheim_categories_at(&server.uri()).await.unwrap();

        assert_eq!(categories.len(), 2);
        assert_eq!(categories[0].slug, "modpacks");
        assert_eq!(categories[1].name, "Client-side");
    }
}
