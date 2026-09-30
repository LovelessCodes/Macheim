import { createFileRoute } from "@tanstack/react-router";

import SavesPage from "../components/saves/SavesPage";

export const Route = createFileRoute("/_app/saves")({
  component: SavesPage,
});
