import { createFileRoute } from "@tanstack/react-router";

import ConfigEditor from "../components/config/ConfigEditor";
import { configFilesQueryOptions } from "../hooks/use-config";
import { useProfiles } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/config")({
  loader: ({ context }) =>
    context.queryClient.query({ ...configFilesQueryOptions, staleTime: "static" }),
  component: ConfigPage,
});

function ConfigPage() {
  const { data } = useProfiles();
  return <ConfigEditor key={data?.activeProfile ?? "Default"} />;
}
