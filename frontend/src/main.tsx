import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminApp } from "./components/AdminApp";
import { PlayView } from "./components/PlayView";
import { PuzzleList } from "./components/PuzzleList";

const queryClient = new QueryClient();
// ponytail: pathname switch instead of a router dependency; add react-router when routes multiply.
const path = window.location.pathname;
const date = new URLSearchParams(window.location.search).get("date") ?? undefined;

const view = path.startsWith("/admin") ? (
  <AdminApp />
) : path.startsWith("/list") ? (
  <PuzzleList />
) : (
  <PlayView date={date} />
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>{view}</QueryClientProvider>
  </StrictMode>,
);
