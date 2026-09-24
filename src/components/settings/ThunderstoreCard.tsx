import { openUrl } from "@tauri-apps/plugin-opener";
import { CloudUpload, ExternalLink, Loader2, LogOut } from "lucide-react";
import { useState } from "react";

import {
  useThunderstoreAuth,
  useThunderstoreSignIn,
  useThunderstoreSignOut,
} from "../../hooks/use-thunderstore";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";

const TOKEN_PAGE = "https://thunderstore.io/settings/account/";

/**
 * Sign-in for publishing: a service-account token kept in the macOS Keychain.
 */
export default function ThunderstoreCard() {
  const { data: auth, isPending } = useThunderstoreAuth();
  const signIn = useThunderstoreSignIn();
  const signOut = useThunderstoreSignOut();
  const [token, setToken] = useState("");

  const handleSignIn = () => {
    const value = token.trim();
    if (!value) return;
    signIn.mutate(value, { onSuccess: () => setToken("") });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="size-4" />
          Thunderstore
        </CardTitle>
        <CardDescription>
          Publish modpacks under your team. Uses a service-account token kept in the macOS Keychain;
          the token is never shown again after sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isPending ? (
          <p className="text-muted-foreground text-sm">Checking sign-in...</p>
        ) : auth?.signed_in ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="text-foreground font-medium">
                {auth.username ?? "service account"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Teams</span>
              <span className="flex flex-wrap justify-end gap-1">
                {auth.teams.length === 0 ? (
                  <span className="text-muted-foreground">None</span>
                ) : (
                  auth.teams.map((team) => (
                    <Badge key={team} variant="outline">
                      {team}
                    </Badge>
                  ))
                )}
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
              >
                {signOut.isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <Input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="tss_..."
              aria-label="Thunderstore service-account token"
            />
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => void openUrl(TOKEN_PAGE)}>
                <ExternalLink />
                Create a token…
              </Button>
              <Button
                variant="accent-primary"
                size="sm"
                onClick={handleSignIn}
                disabled={!token.trim() || signIn.isPending}
              >
                {signIn.isPending ? <Loader2 className="animate-spin" /> : null}
                Sign in
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
