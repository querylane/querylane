import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  CONSOLE_CONFIG_STATIC_QUERY_OPTIONS,
  useConfigManagedInstancesStatus,
  useConsoleConfigStatus,
  useGetConsoleConfigQuery,
  useIsConfigManagedInstances,
} from "@/hooks/api/console";
import { InstanceManagementMode } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { getConsoleConfig } from "@/protogen/querylane/console/v1alpha1/console-ConsoleService_connectquery";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("@connectrpc/connect-query", () => ({
  useQuery: useQueryMock,
}));

describe("console config query options", () => {
  test("does not poll or refetch static console config", () => {
    expect(CONSOLE_CONFIG_STATIC_QUERY_OPTIONS).not.toHaveProperty(
      "refetchInterval"
    );
    expect(CONSOLE_CONFIG_STATIC_QUERY_OPTIONS.refetchOnMount).toBe(false);
    expect(CONSOLE_CONFIG_STATIC_QUERY_OPTIONS.refetchOnReconnect).toBe(false);
    expect(CONSOLE_CONFIG_STATIC_QUERY_OPTIONS.refetchOnWindowFocus).toBe(
      false
    );
    expect(CONSOLE_CONFIG_STATIC_QUERY_OPTIONS.staleTime).toBe(
      Number.POSITIVE_INFINITY
    );
  });
});

describe("console config hooks", () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  test("passes through generated getConsoleConfig queries", () => {
    const options = { enabled: false };

    useGetConsoleConfigQuery(undefined, options);

    expect(useQueryMock).toHaveBeenCalledWith(
      getConsoleConfig,
      undefined,
      options
    );
  });

  test("reports config-managed instances once config mode loads", () => {
    useQueryMock.mockReturnValue({
      data: {
        configFilePath: "/etc/querylane/config.yaml",
        instanceManagementMode: InstanceManagementMode.CONFIG,
      },
      isFetching: false,
    });

    expect(useConsoleConfigStatus()).toEqual({
      configFilePath: "/etc/querylane/config.yaml",
      isConfigManaged: true,
      isLoaded: true,
      mode: InstanceManagementMode.CONFIG,
    });
    expect(useConfigManagedInstancesStatus()).toEqual({
      isConfigManaged: true,
      isLoaded: true,
    });
    expect(useIsConfigManagedInstances()).toBe(true);
  });

  test("treats missing loaded config as API-managed unspecified mode", () => {
    useQueryMock.mockReturnValue({ data: undefined, isFetching: false });

    expect(useConsoleConfigStatus()).toEqual({
      configFilePath: "",
      isConfigManaged: false,
      isLoaded: true,
      mode: InstanceManagementMode.UNSPECIFIED,
    });
  });

  test("keeps loading state while query fetches", () => {
    useQueryMock.mockReturnValue({ data: undefined, isFetching: true });

    expect(useConsoleConfigStatus()).toMatchObject({ isLoaded: false });
    expect(useConfigManagedInstancesStatus()).toEqual({
      isConfigManaged: false,
      isLoaded: false,
    });
  });
});
