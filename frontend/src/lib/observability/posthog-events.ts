import { capturePostHogEvent } from "@/lib/observability/posthog";

interface RouteAnalyticsContext {
  hash: string;
  pathname: string;
  routeFullPath?: string;
  routeId?: string;
  search: string;
}

function extractRouteParamKeys(routeFullPath?: string): string[] {
  if (!routeFullPath) {
    return [];
  }

  const matches = routeFullPath.matchAll(/\$([A-Za-z0-9_]+)/g);
  return Array.from(matches, (match) => match[1]).filter((key): key is string =>
    Boolean(key)
  );
}

function buildRouteAnalyticsProperties(route: RouteAnalyticsContext) {
  return {
    router_mode: "file-based",
    router_name: "tanstack-router",
    tanstack_param_keys: extractRouteParamKeys(route.routeFullPath),
    tanstack_route_full_path: route.routeFullPath ?? "unknown-route",
    tanstack_route_id: route.routeId ?? "unknown-route",
    url_hash: route.hash,
    url_path: route.pathname,
    url_search: route.search,
  };
}

interface PostHogEventsDependencies {
  captureEvent: (
    eventName: string,
    properties?: Record<string, unknown>
  ) => void;
}

const defaultPostHogEventsDependencies: PostHogEventsDependencies = {
  captureEvent: capturePostHogEvent,
};

function createPostHogEventsApi(
  dependencies: PostHogEventsDependencies = defaultPostHogEventsDependencies
) {
  function capturePostHogRouteEvent(
    eventName: string,
    route: RouteAnalyticsContext,
    properties?: Record<string, unknown>
  ) {
    dependencies.captureEvent(eventName, {
      ...buildRouteAnalyticsProperties(route),
      ...properties,
    });
  }

  return {
    trackDatabaseConfigSaveConnectClicked(route: RouteAnalyticsContext) {
      capturePostHogRouteEvent("db_config_save_connect_clicked", route);
    },
    trackDatabaseConfigTestConnectionClicked(route: RouteAnalyticsContext) {
      capturePostHogRouteEvent("db_config_test_connection_clicked", route);
    },
    trackPostHogPageview(route: RouteAnalyticsContext) {
      capturePostHogRouteEvent("$pageview", route);
    },
    trackSetupCheckAgainClicked(route: RouteAnalyticsContext) {
      capturePostHogRouteEvent("setup_check_again_clicked", route);
    },
    trackSetupOptionSelected(
      option: "config_file" | "configure_ui",
      route: RouteAnalyticsContext
    ) {
      capturePostHogRouteEvent("setup_option_selected", route, {
        option,
      });
    },
    trackSidebarNavClicked(destination: string, route: RouteAnalyticsContext) {
      capturePostHogRouteEvent("sidebar_nav_clicked", route, {
        destination,
      });
    },
  };
}

const runtimePostHogEvents = createPostHogEventsApi();

const trackPostHogPageview = runtimePostHogEvents.trackPostHogPageview;

export {
  buildRouteAnalyticsProperties,
  createPostHogEventsApi,
  trackPostHogPageview,
};
