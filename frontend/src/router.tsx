import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { AdminApp } from "./pages/AdminApp";
import { PlayView } from "./pages/PlayView";
import { PuzzleList } from "./pages/PuzzleList";
import { PuzzleListAdmin } from "./pages/PuzzleListAdmin";
import { PuzzleBuilder } from "./pages/PuzzleBuilder";
import { FromArticle } from "./pages/FromArticle";
import { PuzzleDetail } from "./pages/PuzzleDetail";

const rootRoute = createRootRoute({ component: () => <Outlet /> });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => { throw redirect({ to: "/list" }); },
});

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list",
  component: PuzzleList,
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
const adminFromArticleRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "fromarticle",
  component: FromArticle,
});
const adminDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "puzzles/$puzzleId",
  component: PuzzleDetail,
});

const adminTree = adminRoute.addChildren([
  adminIndexRoute,
  adminCreateRoute,
  adminFromArticleRoute,
  adminDetailRoute,
]);

const routeTree = rootRoute.addChildren([
  indexRoute,
  listRoute,
  playRoute,
  adminTree,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
