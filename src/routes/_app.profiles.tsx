import { createFileRoute } from "@tanstack/react-router";

import ProfileManager from "../components/profiles/ProfileManager";
import { profilesQueryOptions } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/profiles")({
  loader: ({ context }) =>
    context.queryClient.query({ ...profilesQueryOptions, staleTime: "static" }),
  component: ProfileManager,
});
