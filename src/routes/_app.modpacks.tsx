import { createFileRoute } from "@tanstack/react-router";

import ModpackBrowser from "../components/mods/ModpackBrowser";

export const Route = createFileRoute("/_app/modpacks")({
  component: ModpackBrowser,
});
