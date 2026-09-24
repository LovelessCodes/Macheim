import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, CloudUpload, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  usePublishModpack,
  useThunderstoreAuth,
  useThunderstoreSignIn,
} from "../../hooks/use-thunderstore";
import type { ModpackMetadata, ModpackPublishResult, PublishProgressEvent } from "../../lib/types";
import ProgressBar from "../common/ProgressBar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Switch } from "../ui/switch";

interface PublishModpackSheetProps {
  profileName: string;
  metadata: ModpackMetadata;
  iconPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Publishes the modpack built from the export form's metadata: team choice,
 * NSFW flag, upload progress and a link to the published page.
 */
export default function PublishModpackSheet({
  profileName,
  metadata,
  iconPath,
  open,
  onOpenChange,
}: PublishModpackSheetProps) {
  const { data: auth, isPending: authPending } = useThunderstoreAuth();
  const signIn = useThunderstoreSignIn();
  const publish = usePublishModpack();

  const [token, setToken] = useState("");
  const [team, setTeam] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [progress, setProgress] = useState<PublishProgressEvent | null>(null);
  const [result, setResult] = useState<ModpackPublishResult | null>(null);

  const teams = auth?.teams ?? [];
  // Default to the account's first team until the user picks one.
  const selectedTeam = team || teams[0] || "";

  useEffect(() => {
    if (!publish.isPending) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<PublishProgressEvent>("modpack-publish", (event) => {
      setProgress(event.payload);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [publish.isPending]);

  const handlePublish = () => {
    setProgress(null);
    publish.mutate(
      { profileName, metadata, iconPath, team: selectedTeam, hasNsfwContent: nsfw },
      { onSuccess: (published) => setResult(published) },
    );
  };

  const handleSignIn = () => {
    const value = token.trim();
    if (!value) return;
    signIn.mutate(value, { onSuccess: () => setToken("") });
  };

  const percentage =
    progress && progress.bytes_total > 0
      ? Math.round((progress.bytes_uploaded / progress.bytes_total) * 100)
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Publish to Thunderstore</SheetTitle>
          <SheetDescription>
            Uploads “{metadata.name}” v{metadata.version} under a team you belong to.
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 overflow-y-auto p-4">
          {result ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-[var(--color-success)]" />
                <span className="text-sm font-medium">
                  Published {result.full_name} v{result.version_number}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => void openUrl(result.package_url)}>
                <ExternalLink />
                Open on Thunderstore
              </Button>
            </div>
          ) : authPending ? (
            <p className="text-muted-foreground text-sm">Checking sign-in...</p>
          ) : !auth?.signed_in ? (
            <>
              <p className="text-muted-foreground text-sm">
                Sign in with a Thunderstore service-account token to publish.
              </p>
              <Input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="tss_..."
                aria-label="Thunderstore service-account token"
              />
              <Button
                variant="accent-primary"
                size="sm"
                onClick={handleSignIn}
                disabled={!token.trim() || signIn.isPending}
              >
                {signIn.isPending ? <Loader2 className="animate-spin" /> : null}
                Sign in
              </Button>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <span className="text-xs font-medium">Team</span>
                <Select
                  items={teams.map((name) => ({ label: name, value: name }))}
                  value={selectedTeam}
                  onValueChange={(value) => setTeam(value ?? "")}
                >
                  <SelectTrigger className="w-full" aria-label="Publishing team">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teams.length === 0 && (
                  <p className="text-muted-foreground text-xs">
                    This token has no teams; ask for publish rights on one first.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Switch
                  checked={nsfw}
                  onCheckedChange={setNsfw}
                  aria-label="Contains NSFW content"
                />
                <span className="text-muted-foreground">Contains NSFW content</span>
              </div>

              {publish.isPending && (
                <div className="grid gap-2">
                  <ProgressBar
                    value={progress?.bytes_uploaded ?? 0}
                    max={progress?.bytes_total ?? 1}
                    label={progress?.message ?? "Preparing the upload..."}
                    indeterminate={percentage === null}
                  />
                </div>
              )}

              {publish.isError && (
                <p className="text-destructive text-xs">
                  {publish.error instanceof Error ? publish.error.message : String(publish.error)}
                </p>
              )}
            </>
          )}
        </div>

        <SheetFooter className="border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              variant="accent-primary"
              onClick={handlePublish}
              disabled={!auth?.signed_in || !selectedTeam || publish.isPending}
            >
              {publish.isPending ? <Loader2 className="animate-spin" /> : <CloudUpload />}
              {publish.isPending ? "Publishing..." : "Publish"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
