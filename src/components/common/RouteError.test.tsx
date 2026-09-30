import { afterEach, expect, test } from "bun:test";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen } from "@testing-library/react";

import RouteError from "./RouteError";
import RouteNotFound from "./RouteNotFound";

function Boom(): never {
  throw new Error("packages failed to load");
}

function makeRouter(initialPath: string) {
  const rootRoute = createRootRoute({
    errorComponent: RouteError,
    notFoundComponent: RouteNotFound,
  });
  const browseRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/browse",
    component: () => <div>Browse mods</div>,
  });
  const boomRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: Boom,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([browseRoute, boomRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

afterEach(cleanup);

test("a route error renders the error page with a retry", async () => {
  const router = makeRouter("/");
  render(<RouterProvider router={router} />);

  expect(await screen.findByText("Something went wrong")).toBeTruthy();
  expect(screen.getByText("packages failed to load")).toBeTruthy();
  expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
  expect(screen.getByRole("link", { name: /back to browse/i })).toBeTruthy();
});

test("an unknown path renders the not found page", async () => {
  const router = makeRouter("/missing");
  render(<RouterProvider router={router} />);

  expect(await screen.findByText("Page not found")).toBeTruthy();
  expect(screen.getByRole("link", { name: /back to browse/i })).toBeTruthy();
});
