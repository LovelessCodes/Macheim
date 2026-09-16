import { QueryCache, QueryClient } from "@tanstack/react-query";

import { toast } from "../components/ui/toast";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const title = query.meta?.errorTitle as string | undefined;
      if (title) toast.add({ type: "error", title: `${title}: ${error}` });
    },
  }),
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
