import { createFileRoute } from "@tanstack/react-router";

import SavesPage from "../components/saves/SavesPage";
import { savesQueryOptions } from "../hooks/use-saves";

export const Route = createFileRoute("/_app/saves")({
  loader: ({ context }) => context.queryClient.query({ ...savesQueryOptions, staleTime: "static" }),
  component: SavesPage,
});
