import { createFileRoute, redirect } from "@tanstack/react-router";

import { PAGE_PATHS } from "../lib/routes";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: PAGE_PATHS.browse });
  },
});
