import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminApp } from "./components/AdminApp";
import { PlayView } from "./components/PlayView";

const queryClient = new QueryClient();
// ponytail: pathname switch instead of a router dependency; add react-router when routes multiply.
const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isAdmin ? <AdminApp /> : <PlayView />}
    </QueryClientProvider>
  </StrictMode>,
);
