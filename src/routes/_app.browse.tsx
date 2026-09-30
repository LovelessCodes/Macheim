import { createFileRoute } from "@tanstack/react-router";

import ModGrid from "../components/mods/ModGrid";
import { packagesQueryOptions } from "../hooks/use-packages";

export const Route = createFileRoute("/_app/browse")({
  loader: ({ context }) =>
    context.queryClient.query({ ...packagesQueryOptions, staleTime: "static" }),
  component: ModGrid,
});
