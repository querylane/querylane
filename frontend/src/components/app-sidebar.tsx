"use client";

import { Link, useLocation } from "@tanstack/react-router";
import { AlertTriangle, InfoIcon, PanelLeftIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { AppInlineError } from "@/components/app-error-view";
import { Logo } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/querylane-ui/sidebar";
import {
  buildNavLinkProps,
  getNavForScope,
  getNextStepHint,
  type NavLinkProps,
} from "@/components/sidebar-navigation";
import {
  buildNavActiveState,
  buildSidebarPaths,
  type NavActiveState,
  type NavigationIds,
  type NavKey,
  type NavSection,
  type SidebarPaths,
} from "@/components/sidebar-paths";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CONSOLE_CONFIG_STATIC_QUERY_OPTIONS,
  useGetConsoleConfigQuery,
} from "@/hooks/api/console";
import {
  type AdminPageId,
  type InstanceLayoutSearch,
  resolveCurrentAdminPage,
  resolveRequestedAdminPageForScope,
} from "@/lib/admin-page";
import {
  type QuerylaneAboutMetadata,
  resolveQuerylaneAboutMetadata,
} from "@/lib/app-metadata";
import { useDb } from "@/lib/db-context";
import type { ScopeLevel } from "@/lib/db-navigation";
import { normalizeAppUiError } from "@/lib/ui-error";
import type { AppUiError } from "@/lib/ui-error-types";
import packageJson from "../../package.json" with { type: "json" };

const FRONTEND_PACKAGE_VERSION = packageJson.version;
function useSidebarFooterState() {
  const {
    data: consoleConfig,
    error: consoleConfigError,
    refetch: refetchConsoleConfig,
  } = useGetConsoleConfigQuery(undefined, {
    ...CONSOLE_CONFIG_STATIC_QUERY_OPTIONS,
    meta: {
      appErrorSurface: "inline",
    },
  });
  const aboutMetadata = resolveQuerylaneAboutMetadata(
    consoleConfig?.buildInfo,
    FRONTEND_PACKAGE_VERSION
  );
  const footerError = consoleConfigError
    ? normalizeAppUiError(consoleConfigError, {
        area: "sidebar-footer",
        source: "query",
      })
    : null;
  return {
    aboutMetadata,
    footerError,
    retryFooter: () => refetchConsoleConfig(),
  };
}
function resolveActivePage(
  search: InstanceLayoutSearch,
  pathname: string,
  paths: SidebarPaths,
  viewLevel: ScopeLevel
): NavActiveState {
  const pageParam = resolveRequestedAdminPageForScope(search.page, viewLevel);
  if (pageParam) {
    const blank: NavActiveState = {
      databaseExplorer: false,
      databaseExtensions: false,
      databaseOverview: false,
      instanceConfiguration: false,
      instanceOverview: false,
      instanceRoles: false,
    };
    const activeKeyMap: Record<AdminPageId, keyof NavActiveState> = {
      "database.explorer": "databaseExplorer",
      "database.extensions": "databaseExtensions",
      "database.overview": "databaseOverview",
      "instance.configuration": "instanceConfiguration",
      "instance.overview": "instanceOverview",
      "instance.roles": "instanceRoles",
    };
    const key = activeKeyMap[pageParam];
    if (key) {
      blank[key] = true;
    }
    return blank;
  }
  return buildNavActiveState({
    pathname,
    paths,
  });
}
function AboutMetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-xs">
        <OverflowTooltip className="block truncate">{value}</OverflowTooltip>
      </dd>
    </>
  );
}
function SidebarFooterContent({
  aboutMetadata,
  footerError,
  isCollapsed,
  isTemporaryReveal,
  onRetryFooter,
}: {
  aboutMetadata: QuerylaneAboutMetadata;
  footerError: AppUiError | null;
  isCollapsed: boolean;
  isTemporaryReveal: boolean;
  onRetryFooter: () => Promise<unknown>;
}) {
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const { toggleSidebar } = useSidebar();
  if (!isCollapsed) {
    return (
      <div className="flex w-full flex-col gap-2">
        {footerError ? (
          <AppInlineError
            className="mx-2"
            error={footerError}
            onRetry={onRetryFooter}
          />
        ) : null}

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label={isTemporaryReveal ? "Pin menu open" : "Collapse menu"}
              onClick={toggleSidebar}
            >
              <PanelLeftIcon className="size-4" />
              <span>
                {isTemporaryReveal ? "Pin menu open" : "Collapse menu"}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <OverflowTooltip className="block truncate px-2 text-left font-mono text-[11px] text-muted-foreground">
          {`Querylane ${aboutMetadata.version}`}
        </OverflowTooltip>
      </div>
    );
  }
  return (
    <Dialog onOpenChange={setIsAboutDialogOpen} open={isAboutDialogOpen}>
      <div className="flex w-full flex-col items-center gap-2">
        {footerError ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Build metadata error"
                  className="text-amber-600 hover:text-amber-700"
                  onClick={toggleSidebar}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <AlertTriangle className="size-4" />
              <span className="sr-only">Build metadata error</span>
            </TooltipTrigger>
            <TooltipContent align="center" side="right">
              Expand menu to inspect build metadata error
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger render={<div className="flex" />}>
            <SidebarTrigger
              aria-label="Expand menu"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            />
          </TooltipTrigger>
          <TooltipContent align="center" side="right">
            Expand menu
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="About Querylane"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setIsAboutDialogOpen(true)}
                size="icon-sm"
                variant="ghost"
              />
            }
          >
            <InfoIcon className="size-4" />
            <span className="sr-only">About Querylane</span>
          </TooltipTrigger>
          <TooltipContent align="center" side="right">
            About Querylane
          </TooltipContent>
        </Tooltip>
      </div>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About Querylane</DialogTitle>
          <DialogDescription>
            Version and build metadata for this Querylane instance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Logo className="size-10 shrink-0 rounded-md" />
            <p className="font-medium text-base">Querylane</p>
          </div>

          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2">
            <AboutMetadataRow label="Version" value={aboutMetadata.version} />
            <AboutMetadataRow
              label="Git commit"
              value={aboutMetadata.gitCommit}
            />
            <AboutMetadataRow
              label="Git branch"
              value={aboutMetadata.gitBranch}
            />
            <AboutMetadataRow label="Built at" value={aboutMetadata.builtAt} />
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function SidebarNavigationContent({
  linkProps,
  nextStepHint,
  sections,
}: {
  linkProps: Partial<Record<NavKey, NavLinkProps>>;
  nextStepHint: string | null;
  sections: NavSection[];
}) {
  return (
    <SidebarContent>
      {sections.length === 0 && (
        <div className="flex flex-1 items-center justify-center px-4 group-data-[collapsible=icon]:hidden">
          <p className="text-center text-muted-foreground text-sm leading-relaxed">
            Select an instance to get started
          </p>
        </div>
      )}

      {sections.map((section, sectionIndex) => (
        <Fragment key={section.title}>
          {sectionIndex > 0 && (
            <SidebarSeparator className="hidden group-data-[collapsible=icon]:block" />
          )}
          <SidebarGroup>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const itemLinkProps = item.isDisabled
                    ? undefined
                    : linkProps[item.key];

                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        disabled={item.isDisabled || !itemLinkProps}
                        {...(item.isActive === undefined
                          ? {}
                          : { isActive: item.isActive })}
                        {...(itemLinkProps
                          ? { render: <Link {...itemLinkProps} /> }
                          : {})}
                        tooltip={`${section.title} ${item.label}`}
                      >
                        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                          <item.icon className="size-4 shrink-0" />
                          <OverflowTooltip className="block truncate">
                            {item.label}
                          </OverflowTooltip>
                        </span>
                      </SidebarMenuButton>
                      {item.badge !== undefined && (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </Fragment>
      ))}

      {nextStepHint && sections.length > 0 && (
        <div className="px-5 py-3 group-data-[collapsible=icon]:hidden">
          <p className="text-muted-foreground/70 text-xs leading-relaxed">
            {nextStepHint}
          </p>
        </div>
      )}
    </SidebarContent>
  );
}
export function AppSidebar() {
  const location = useLocation({
    select: (loc) => ({
      pathname: loc.pathname,
      search: loc.search,
    }),
  });
  const { hoverRevealOpen, isMobile, state } = useSidebar();
  const { navigationIds, scopeLevel, viewLevel } = useDb();
  const ids: NavigationIds = navigationIds;
  const paths = buildSidebarPaths(ids);
  const active = resolveActivePage(
    location.search,
    location.pathname,
    paths,
    viewLevel
  );
  const currentPage = resolveCurrentAdminPage({
    pathname: location.pathname,
    scope: viewLevel,
    value: location.search.page,
  });
  const linkProps = buildNavLinkProps({ currentPage, ids });
  const { aboutMetadata, footerError, retryFooter } = useSidebarFooterState();
  const isCollapsed = state === "collapsed" && !isMobile && !hoverRevealOpen;
  const sections = getNavForScope({
    active,
    paths,
    scopeLevel,
  });
  const nextStepHint = getNextStepHint(scopeLevel);
  return (
    <Sidebar
      className="top-14 h-[calc(100svh-3.5rem)] overflow-hidden"
      collapsible="offcanvas"
    >
      <SidebarNavigationContent
        linkProps={linkProps}
        nextStepHint={nextStepHint}
        sections={sections}
      />

      <SidebarFooter>
        <SidebarFooterContent
          aboutMetadata={aboutMetadata}
          footerError={footerError}
          isCollapsed={isCollapsed}
          isTemporaryReveal={hoverRevealOpen}
          onRetryFooter={retryFooter}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
