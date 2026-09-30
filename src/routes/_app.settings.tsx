import { createFileRoute } from "@tanstack/react-router";

import SettingsPage from "../components/layout/SettingsPage";
import { appSettingsQueryOptions } from "../hooks/use-app-settings";

export const Route = createFileRoute("/_app/settings")({
  loader: ({ context }) =>
    context.queryClient.query({ ...appSettingsQueryOptions, staleTime: "static" }),
  component: SettingsPage,
});
