import { describe, expect, it, vi } from "vitest";

import { parseRouteIdsFromPathname, useCurrentRouteIds } from "@/lib/route-ids";

const { useLocationMock } = vi.hoisted(() => ({
  useLocationMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: useLocationMock,
}));

describe("parseRouteIdsFromPathname", () => {
  it("parses instance route", () => {
    expect(parseRouteIdsFromPathname("/instances/prod-us-east")).toEqual({
      instanceId: "prod-us-east",
    });
  });

  it("parses database route", () => {
    expect(
      parseRouteIdsFromPathname("/instances/prod-us-east/databases/app_main")
    ).toEqual({
      databaseId: "app_main",
      instanceId: "prod-us-east",
    });
  });

  it("parses explorer route, stopping at database id", () => {
    expect(
      parseRouteIdsFromPathname(
        "/instances/prod-us-east/databases/app_main/explorer"
      )
    ).toEqual({
      databaseId: "app_main",
      instanceId: "prod-us-east",
    });
  });

  it("returns empty IDs for unknown top-level routes", () => {
    expect(parseRouteIdsFromPathname("/unknown")).toEqual({});
  });

  it("returns instance only when databaseId is missing", () => {
    expect(
      parseRouteIdsFromPathname("/instances/prod-us-east/databases")
    ).toEqual({
      instanceId: "prod-us-east",
    });
  });

  it("decodes encoded IDs and tolerates malformed percent escapes", () => {
    expect(
      parseRouteIdsFromPathname("/instances/prod%20east/databases/app%2Fdb")
    ).toEqual({
      databaseId: "app/db",
      instanceId: "prod east",
    });
    expect(parseRouteIdsFromPathname("/instances/bad%zz/databases/db")).toEqual(
      {
        databaseId: "db",
        instanceId: "bad%zz",
      }
    );
  });

  it("returns empty ids when the instance segment is missing", () => {
    expect(parseRouteIdsFromPathname("/instances")).toEqual({});
  });
});

describe("useCurrentRouteIds", () => {
  it("derives route IDs from the current router pathname", () => {
    useLocationMock.mockImplementation(({ select }) =>
      select({ pathname: "/instances/prod/databases/app" })
    );

    expect(useCurrentRouteIds()).toEqual({
      databaseId: "app",
      instanceId: "prod",
    });
    expect(useLocationMock).toHaveBeenCalledWith({
      select: expect.any(Function),
    });
  });
});
