import { createFileRoute } from "@tanstack/react-router";

import CompatibilityPage from "../components/compatibility/CompatibilityPage";
import { useProfiles } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/compatibility")({
  component: CompatibilityRoute,
});

function CompatibilityRoute() {
  const { data } = useProfiles();
  return <CompatibilityPage key={data?.activeProfile ?? "Default"} />;
}
