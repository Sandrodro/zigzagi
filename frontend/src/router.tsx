import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { AdminApp } from "./pages/AdminApp";
import { PlayView } from "./pages/PlayView";
import { PuzzleList } from "./pages/PuzzleList";

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

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
