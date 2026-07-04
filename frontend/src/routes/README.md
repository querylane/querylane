# Route modules

TanStack Router file routes in this directory should stay thin. Use this map when adding or moving route code:

- `*.tsx` route files define routing wiring: path params, search schemas, loaders, redirects, pending/error/not-found components, and the final route export.
- `*-page.tsx` page modules hold page rendering for a route when the screen is more than a small wrapper.
- Domain workflow, query, validation, and state logic belongs outside route files in feature, hook, lib, or store modules.
- `frontend/src/routeTree.gen.ts` is generated. Do not edit it directly.

Small route-only screens can remain inline. If a route grows enough that unrelated rendering or workflow logic obscures the routing contract, split the page or domain behavior into a named sibling/module before adding more code.
