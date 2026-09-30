import { createFileRoute } from "@tanstack/react-router";

import CompatibilityPage from "../components/compatibility/CompatibilityPage";
import { compatibilityQueryOptions } from "../hooks/use-compatibility";
import { useProfiles } from "../hooks/use-profiles";

export const Route = createFileRoute("/_app/compatibility")({
  loader: ({ context }) =>
    context.queryClient.query({ ...compatibilityQueryOptions, staleTime: "static" }),
  component: CompatibilityRoute,
});

function CompatibilityRoute() {
  const { data } = useProfiles();
  return <CompatibilityPage key={data?.activeProfile ?? "Default"} />;
}
