import { createFileRoute } from "@tanstack/react-router";

import LogsPage from "../components/logs/LogsPage";
import { latestLogQueryOptions } from "../hooks/use-logs";

export const Route = createFileRoute("/_app/logs")({
  loader: ({ context }) =>
    context.queryClient.query({ ...latestLogQueryOptions, staleTime: "static" }),
  component: LogsPage,
});
