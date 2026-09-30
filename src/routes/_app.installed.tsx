import { createFileRoute } from "@tanstack/react-router";

import InstalledModList from "../components/mods/InstalledModList";
import { installedModsQueryOptions } from "../hooks/use-installed-mods";
import { modConflictsQueryOptions } from "../hooks/use-mod-conflicts";
import { useProfiles } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/installed")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...installedModsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...modConflictsQueryOptions, staleTime: "static" }),
    ]),
  component: InstalledModsPage,
});

function InstalledModsPage() {
  const { data } = useProfiles();
  return <InstalledModList key={data?.activeProfile ?? "Default"} />;
}
