// Shared by the blocking emitted-module contract and the route-byte report.
export function routeComponentPath(modulePath: string) {
  const [path = "", query] = modulePath.replaceAll("\\", "/").split("?");
  const targets = new URLSearchParams(query).get("tsr-split")?.split("---");
  return targets?.includes("component") === true ? path : "";
}
