import { createFileRoute } from "@tanstack/react-router";

import ModGrid from "../components/mods/ModGrid";

export const Route = createFileRoute("/_app/browse")({
  component: ModGrid,
});
