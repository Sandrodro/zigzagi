import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { AdminApp } from "./pages/AdminApp";
import { PlayView } from "./pages/PlayView";
import { PuzzleListAdmin } from "./pages/PuzzleListAdmin";
import { PuzzleBuilder } from "./pages/PuzzleBuilder";
import { WordPool } from "./pages/WordPool";
import { PuzzleDetail } from "./pages/PuzzleDetail";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <PlayView />,
});

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/play",
  validateSearch: (
    s: Record<string, unknown>,
  ): { id?: string; date?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
    date: typeof s.date === "string" ? s.date : undefined,
  }),
  component: function PlayRoute() {
    const { id, date } = playRoute.useSearch();
    return <PlayView id={id} date={date} />;
  },
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminApp,
});
const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  component: PuzzleListAdmin,
});
const adminCreateRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "create",
  component: PuzzleBuilder,
});
const adminWordpoolRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "wordpool",
  component: WordPool,
});
const adminDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "puzzles/$puzzleId",
  component: PuzzleDetail,
});

const adminTree = adminRoute.addChildren([
  adminIndexRoute,
  adminCreateRoute,
  adminWordpoolRoute,
  adminDetailRoute,
]);

const routeTree = rootRoute.addChildren([
  indexRoute,
  playRoute,
  adminTree,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
