import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";

import { AdminApp } from "./components/AdminApp";
import { PlayView } from "./components/PlayView";
import { PuzzleList } from "./components/PuzzleList";

const queryClient = new QueryClient();

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <PlayView /> });

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/play",
  validateSearch: (s: Record<string, unknown>): { date?: string } => ({
    date: typeof s.date === "string" ? s.date : undefined,
  }),
  component: function PlayRoute() {
    const { date } = playRoute.useSearch();
    return <PlayView date={date} />;
  },
});

const listRoute = createRoute({ getParentRoute: () => rootRoute, path: "/list", component: () => <PuzzleList /> });

const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: () => <AdminApp /> });

const routeTree = rootRoute.addChildren([indexRoute, playRoute, listRoute, adminRoute]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
