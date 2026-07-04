import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useEffect } from "react";
import { z } from "zod";

import { AppErrorView } from "@/components/app-error-view";
import { AppShellFrame } from "@/components/app-shell-frame";
import { BrandedLoadingState } from "@/components/branded-loading-state";
import { ConfigManagedEmptyState } from "@/components/config-managed-empty-state";
import { useConsoleConfigStatus } from "@/hooks/api/console";
import { useDb } from "@/lib/db-context";
import { handleNavigationError } from "@/lib/navigation-errors";
import { normalizeAppUiError } from "@/lib/ui-error";

const homeSearchSchema = z.object({
  instanceId: z.string().min(1).optional(),
});

function resolveHomeInstanceId({
  instances,
  requestedInstanceId,
}: {
  instances: ReturnType<typeof useDb>["instances"];
  requestedInstanceId?: string | undefined;
}): string | null {
  if (instances.length === 0) {
    return null;
  }

  if (requestedInstanceId) {
    const requestedInstance = instances.find(
      (instance) => instance.id === requestedInstanceId
    );
    if (requestedInstance) {
      return requestedInstance.id;
    }
  }

  return instances[0]?.id ?? null;
}

function HomeRedirectPage() {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const { instances, queryStates, retryInstanceCatalog } = useDb();
  const instancesState = queryStates.instances;
  const {
    configFilePath,
    isConfigManaged,
    isLoaded: isModeLoaded,
  } = useConsoleConfigStatus();
  const targetInstanceId = resolveHomeInstanceId({
    instances,
    requestedInstanceId: search.instanceId,
  });
  const noInstances =
    instancesState.hasResolved &&
    !instancesState.error &&
    instances.length === 0;
  // Only redirect to /new-instance once we know the management mode.
  // Without this gate, a config-managed empty deployment would redirect
  // before GetConsoleConfig resolves.
  const shouldRedirectToNewInstance =
    noInstances && isModeLoaded && !isConfigManaged;

  // allow-useEffect: redirect to default instance
  useEffect(() => {
    if (!targetInstanceId) {
      if (!shouldRedirectToNewInstance) {
        return;
      }

      navigate({
        replace: true,
        to: "/new-instance",
      }).catch((error: unknown) =>
        handleNavigationError(error, { area: "home.new-instance-redirect" })
      );

      return;
    }

    navigate({
      params: {
        instanceId: targetInstanceId,
      },
      replace: true,
      to: "/instances/$instanceId",
    }).catch((error: unknown) =>
      handleNavigationError(error, { area: "home.instance-redirect" })
    );
  }, [navigate, shouldRedirectToNewInstance, targetInstanceId]);

  if (targetInstanceId) {
    return (
      <BrandedLoadingState
        description="Opening the first available instance."
        title="Loading Querylane"
        variant="fullscreen"
      />
    );
  }

  if (noInstances && isConfigManaged) {
    return (
      <ConfigManagedEmptyState
        configFilePath={configFilePath || undefined}
        variant="fullscreen"
      />
    );
  }

  if (shouldRedirectToNewInstance) {
    return (
      <BrandedLoadingState
        description="Opening instance registration."
        title="Loading Querylane"
        variant="fullscreen"
      />
    );
  }

  if (instancesState.error) {
    return (
      <AppShellFrame>
        <AppErrorView
          error={normalizeAppUiError(instancesState.error, {
            area: "home-route",
            source: "query",
            surface: "route",
          })}
          onRetry={retryInstanceCatalog}
          variant="page"
        />
      </AppShellFrame>
    );
  }

  return (
    <BrandedLoadingState
      description="Looking up available instances."
      title="Loading Querylane"
      variant="fullscreen"
    />
  );
}

export const Route = createFileRoute("/")({
  component: HomeRedirectPage,
  validateSearch: homeSearchSchema,
});
