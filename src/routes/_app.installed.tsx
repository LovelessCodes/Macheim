import { createFileRoute } from "@tanstack/react-router";

import InstalledModList from "../components/mods/InstalledModList";
import { useProfiles } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/installed")({
  component: InstalledModsPage,
});

function InstalledModsPage() {
  const { data } = useProfiles();
  return <InstalledModList key={data?.activeProfile ?? "Default"} />;
}
