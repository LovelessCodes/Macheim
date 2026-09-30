import { createFileRoute } from "@tanstack/react-router";

import ProfileManager from "../components/profiles/ProfileManager";

export const Route = createFileRoute("/_app/profiles")({
  component: ProfileManager,
});
