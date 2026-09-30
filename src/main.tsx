import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import React from "react";
import ReactDOM from "react-dom/client";

import { persistOptions, queryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

import "./styles.css";

const router = createRouter({
  routeTree,
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
