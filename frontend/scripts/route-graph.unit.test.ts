import { expect, test } from "@rstest/core";
import { readGeneratedRoutes } from "./route-graph";

test("reads route identity from the installed generator contract without executing route imports", async () => {
  const routes = await readGeneratedRoutes(`
    import { Route as IndexImport } from './routes/index';
    import { Route as WorkbenchImport } from './routes/workbench';
    declare module '@tanstack/react-router' {
      interface FileRoutesByPath {
        '/': { id: '/'; preLoaderRoute: typeof IndexImport; };
        '/query': { id: '/query'; preLoaderRoute: typeof WorkbenchImport; };
      }
    }
  `);
  expect(routes).toEqual([
    { id: "/", source: "src/routes/index.tsx" },
    { id: "/query", source: "src/routes/workbench.tsx" },
  ]);
});

test("rejects absent and unresolvable route graphs instead of reporting no routes", async () => {
  await expect(
    readGeneratedRoutes("export const routeTree = {}; ")
  ).rejects.toThrow("Missing installed generated route graph");
  await expect(
    readGeneratedRoutes(`
    declare module '@tanstack/react-router' {
      interface FileRoutesByPath { '/query': { preLoaderRoute: typeof MissingImport; }; }
    }
  `)
  ).rejects.toThrow("Missing route import: /query");
});
