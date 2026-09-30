import { createFileRoute } from "@tanstack/react-router";

import ConfigEditor from "../components/config/ConfigEditor";
import { useProfiles } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/config")({
  component: ConfigPage,
});

function ConfigPage() {
  const { data } = useProfiles();
  return <ConfigEditor key={data?.activeProfile ?? "Default"} />;
}
