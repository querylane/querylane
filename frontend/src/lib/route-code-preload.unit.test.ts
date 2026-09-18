import { expect, rs, test } from "@rstest/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { preloadRouteCode } from "@/lib/route-code-preload";

test("code-only preloading never runs loaders, including active parents", async () => {
  const parentLoader = rs.fn();
  const childLoader = rs.fn();
  const beforeLoad = rs.fn();
  const preload = rs.fn(async () => undefined);
  const root = createRootRoute();
  const parent = createRoute({
    getParentRoute: () => root,
    loader: parentLoader,
    path: "/parent",
  });
  const target = createRoute({
    beforeLoad,
    component: Object.assign(() => null, { preload }),
    getParentRoute: () => parent,
    loader: childLoader,
    path: "/target",
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routeTree: root.addChildren([parent.addChildren([target])]),
  });
  const loadRouteChunk = rs.spyOn(router, "loadRouteChunk");
  await preloadRouteCode(router, target);
  expect(loadRouteChunk).toHaveBeenCalledWith(target);
  expect(preload).toHaveBeenCalledTimes(1);
  expect(beforeLoad).not.toHaveBeenCalled();
  expect(parentLoader).not.toHaveBeenCalled();
  expect(childLoader).not.toHaveBeenCalled();

  await router.navigate({ href: "/parent/target" });
  parentLoader.mockClear();
  childLoader.mockClear();
  beforeLoad.mockClear();
  await preloadRouteCode(router, target);
  expect(parentLoader).not.toHaveBeenCalled();
  expect(childLoader).not.toHaveBeenCalled();
  expect(beforeLoad).not.toHaveBeenCalled();
});
