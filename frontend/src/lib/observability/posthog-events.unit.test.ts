import { describe, expect, it } from "vitest";

import {
  buildRouteAnalyticsProperties,
  createPostHogEventsApi,
} from "@/lib/observability/posthog-events";

const baseRoute = {
  hash: "",
  pathname: "/instances/prod-analytics",
  routeFullPath: "/instances/$instanceId",
  routeId: "/instances/$instanceId",
  search: "",
} as const;
const EXPECTED_CAPTURE_CALL_COUNT = 5;

describe("route analytics props", () => {
  it("maps dynamic TanStack file routes to analytics metadata", () => {
    const properties = buildRouteAnalyticsProperties(baseRoute);

    expect(properties.router_name).toBe("tanstack-router");
    expect(properties.router_mode).toBe("file-based");
    expect(properties.tanstack_route_full_path).toBe("/instances/$instanceId");
    expect(properties.tanstack_route_id).toBe("/instances/$instanceId");
    expect(properties.tanstack_param_keys).toEqual(["instanceId"]);
    expect(properties.url_path).toBe("/instances/prod-analytics");
  });
});

describe("posthog events api", () => {
  it("captures key click events with route metadata", () => {
    const calls: Array<{
      eventName: string;
      properties: Record<string, unknown> | undefined;
    }> = [];
    const api = createPostHogEventsApi({
      captureEvent: (eventName, properties) => {
        calls.push({ eventName, properties });
      },
    });

    api.trackSidebarNavClicked("/instances/prod-analytics/roles", baseRoute);
    api.trackSetupOptionSelected("configure_ui", baseRoute);
    api.trackSetupCheckAgainClicked(baseRoute);
    api.trackDatabaseConfigTestConnectionClicked(baseRoute);
    api.trackDatabaseConfigSaveConnectClicked(baseRoute);

    expect(calls).toHaveLength(EXPECTED_CAPTURE_CALL_COUNT);
    expect(calls[0]?.eventName).toBe("sidebar_nav_clicked");
    expect(calls[0]?.properties?.["destination"]).toBe(
      "/instances/prod-analytics/roles"
    );
    expect(calls[1]?.eventName).toBe("setup_option_selected");
    expect(calls[1]?.properties?.["option"]).toBe("configure_ui");
    expect(calls[4]?.eventName).toBe("db_config_save_connect_clicked");
    expect(calls[0]?.properties?.["tanstack_route_full_path"]).toBe(
      "/instances/$instanceId"
    );
  });
});

it("uses unknown route metadata and captures page views", () => {
  const calls: Array<{
    eventName: string;
    properties?: Record<string, unknown>;
  }> = [];
  const route = { hash: "#top", pathname: "/setup", search: "" };
  const api = createPostHogEventsApi({
    captureEvent: (eventName, properties) =>
      calls.push(
        properties === undefined ? { eventName } : { eventName, properties }
      ),
  });

  api.trackPostHogPageview(route);

  expect(buildRouteAnalyticsProperties(route)).toMatchObject({
    tanstack_param_keys: [],
    tanstack_route_full_path: "unknown-route",
    tanstack_route_id: "unknown-route",
  });
  expect(calls).toEqual([
    {
      eventName: "$pageview",
      properties: expect.objectContaining({ url_hash: "#top" }),
    },
  ]);
});
