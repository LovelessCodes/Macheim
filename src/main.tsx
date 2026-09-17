import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { persistOptions, queryClient } from "./lib/query-client";

import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
