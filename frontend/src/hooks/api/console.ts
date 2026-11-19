import type { MessageInitShape } from "@bufbuild/protobuf";
import { type UseQueryOptions, useQuery } from "@connectrpc/connect-query";
import type { SkipToken } from "@connectrpc/connect-query-core";
import { STATIC_QUERY_OPTIONS } from "@/lib/query-policy";
import { InstanceManagementMode } from "@/protogen/querylane/console/v1alpha1/console_pb";
import { getConsoleConfig } from "@/protogen/querylane/console/v1alpha1/console-ConsoleService_connectquery";

const CONSOLE_CONFIG_STATIC_QUERY_OPTIONS = STATIC_QUERY_OPTIONS;

function useGetConsoleConfigQuery(
  input?: MessageInitShape<(typeof getConsoleConfig)["input"]> | SkipToken,
  options?: UseQueryOptions<(typeof getConsoleConfig)["output"]>
) {
  return useQuery(getConsoleConfig, input, options);
}

function useConsoleConfigStatus() {
  const { data, isFetching } = useGetConsoleConfigQuery(
    undefined,
    CONSOLE_CONFIG_STATIC_QUERY_OPTIONS
  );
  const mode =
    data?.instanceManagementMode ?? InstanceManagementMode.UNSPECIFIED;
  return {
    configFilePath: data?.configFilePath ?? "",
    isConfigManaged: mode === InstanceManagementMode.CONFIG,
    isLoaded: data !== undefined || (!isFetching && data === undefined),
    mode,
  } satisfies {
    configFilePath: string;
    isConfigManaged: boolean;
    isLoaded: boolean;
    mode: InstanceManagementMode;
  };
}

/**
 * Returns true when instances are defined in the server configuration file
 * and cannot be created, updated, or deleted via the API.
 * Returns false while the console config is still loading.
 */
function useConfigManagedInstancesStatus() {
  const { isConfigManaged, isLoaded } = useConsoleConfigStatus();
  return { isConfigManaged, isLoaded } satisfies {
    isConfigManaged: boolean;
    isLoaded: boolean;
  };
}

function useIsConfigManagedInstances() {
  return useConfigManagedInstancesStatus().isConfigManaged;
}

export {
  CONSOLE_CONFIG_STATIC_QUERY_OPTIONS,
  useConfigManagedInstancesStatus,
  useConsoleConfigStatus,
  useGetConsoleConfigQuery,
  useIsConfigManagedInstances,
};
