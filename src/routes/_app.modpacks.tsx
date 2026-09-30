import { createFileRoute } from "@tanstack/react-router";

import ModpackBrowser from "../components/mods/ModpackBrowser";
import { packagesQueryOptions } from "../hooks/use-packages";

export const Route = createFileRoute("/_app/modpacks")({
  loader: ({ context }) =>
    context.queryClient.query({ ...packagesQueryOptions, staleTime: "static" }),
  component: ModpackBrowser,
});
