"use client";

import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, Lock, Monitor, Plus } from "lucide-react";
import React from "react";
import { RoleKindBadge } from "@/components/console-pages/role-kind-badge";
import { SidebarTrigger } from "@/components/querylane-ui/sidebar";
import { SearchEmptyState } from "@/components/search-empty-state";
import { ThemeModeMenu } from "@/components/theme-mode-menu";
import { buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { env } from "@/env";
import { useConfigManagedInstancesStatus } from "@/hooks/api/console";
import { useGithubRepoStarsQuery } from "@/hooks/api/github";
import {
  rolesForInstanceQueryInput,
  useListAllRolesQuery,
} from "@/hooks/api/role";
import { useDb } from "@/lib/db-context";
import { handleNavigationError } from "@/lib/navigation-errors";
import { resolveBreadcrumbTail } from "@/lib/page-breadcrumb";
import { roleIdOf } from "@/lib/role-display";
import { useCurrentRouteIds } from "@/lib/route-ids";
import { cn } from "@/lib/utils";
import { useTheme } from "@/theme-provider";

type ConnectionStatus = "connected" | "disconnected" | "error";

function getConnectionStatusClass(status: ConnectionStatus): string {
  if (status === "connected") {
    return "bg-success";
  }
  if (status === "error") {
    return "bg-destructive";
  }
  return "bg-muted-foreground/50";
}
function getDisabledReason(status?: ConnectionStatus): string | null {
  if (status === "connected") {
    return null;
  }
  if (status === "error") {
    return "Connection error";
  }
  return "Instance is offline";
}
function getBreadcrumbQueryState(
  queryState: ReturnType<typeof useDb>["queryStates"]["instances"]
) {
  return {
    loading: !queryState.hasResolved,
    refreshing: queryState.isFetching && queryState.hasResolved,
  };
}
function getConnectionStatusLabel(status: ConnectionStatus): string {
  if (status === "connected") {
    return "Connected";
  }
  if (status === "error") {
    return "Connection error";
  }
  return "Disconnected";
}
function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={`size-2 shrink-0 rounded-full ${getConnectionStatusClass(status)}`}
      data-status={status}
    />
  );
}
function HeaderStatusDot({ status }: { status: ConnectionStatus }) {
  const label = getConnectionStatusLabel(status);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div className="inline-flex" data-status={status}>
            <StatusDot status={status} />
          </div>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function OverflowAwareText({
  children,
  className,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return <span className={className}>{children}</span>;
  }
  return <OverflowTooltip className={className}>{children}</OverflowTooltip>;
}

type BreadcrumbDropdownChildren = (close: () => void) => React.ReactNode;

function BreadcrumbDropdownList({
  children,
  close,
  emptyContent,
  emptyResourceName,
  label,
  loading,
  loadingMessage,
  showRefreshingState,
}: {
  children: BreadcrumbDropdownChildren;
  close: () => void;
  emptyContent: React.ReactNode;
  emptyResourceName: string;
  label: string;
  loading: boolean;
  loadingMessage: string | undefined;
  showRefreshingState: boolean;
}) {
  if (loading) {
    return (
      <output
        aria-live="polite"
        className="flex items-center gap-2 p-3 text-muted-foreground text-sm"
      >
        <Spinner className="size-4" />
        <span>{loadingMessage ?? `Loading ${label.toLowerCase()}…`}</span>
      </output>
    );
  }

  return (
    <>
      {showRefreshingState ? (
        <output
          aria-live="polite"
          className="flex items-center gap-2 px-3 py-2 text-muted-foreground text-xs"
        >
          <Spinner className="size-3.5" />
          <span>{`Refreshing ${label.toLowerCase()}...`}</span>
        </output>
      ) : null}
      <CommandEmpty className="p-0">
        {emptyContent ?? (
          <SearchEmptyState
            className="min-h-24 py-6"
            resourceName={emptyResourceName}
          />
        )}
      </CommandEmpty>
      <CommandGroup>{children(close)}</CommandGroup>
    </>
  );
}

function shouldShowBreadcrumbSpinner(
  loading: boolean,
  refreshing: boolean
): boolean {
  return loading || refreshing;
}

function breadcrumbTriggerAriaLabel(
  label: string,
  value: string | null
): string {
  return value === null
    ? `Select ${label.toLowerCase()}`
    : `${label}: ${value}`;
}

// Single-row breadcrumb chip content: status dot + value + chevron. The label
// lives in the trigger's accessible name rather than a stacked eyebrow, keeping
// the topbar to one slim row.
function BreadcrumbTriggerBody({
  disabled,
  hasValue,
  loading,
  refreshing,
  triggerValue,
  valuePrefix,
}: {
  disabled: boolean;
  hasValue: boolean;
  loading: boolean;
  refreshing: boolean;
  triggerValue: string;
  valuePrefix?: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {hasValue ? valuePrefix : null}
      <OverflowAwareText
        className={`min-w-0 truncate font-medium text-sm ${hasValue ? "text-foreground" : "text-muted-foreground"}`}
        disabled={disabled}
      >
        {triggerValue}
      </OverflowAwareText>
      {shouldShowBreadcrumbSpinner(loading, refreshing) ? (
        <Spinner className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
      <ChevronsUpDown
        aria-hidden="true"
        className="size-3 shrink-0 text-muted-foreground"
      />
    </span>
  );
}

function BreadcrumbDropdown({
  children,
  contentWidth,
  disabledReason,
  emptyContent,
  emptyResourceName,
  label,
  loading = false,
  loadingMessage,
  refreshing = false,
  triggerClassName,
  value,
  valuePrefix,
  placeholder,
}: {
  children: BreadcrumbDropdownChildren;
  contentWidth: string;
  disabledReason?: string | null;
  emptyContent?: React.ReactNode;
  emptyResourceName: string;
  label: string;
  loading?: boolean;
  loadingMessage?: string;
  refreshing?: boolean;
  triggerClassName?: string;
  value: string | null;
  valuePrefix?: React.ReactNode;
  placeholder: string;
}) {
  const [open, setOpen] = React.useState(false);
  const hasValue = value !== null;
  const disabled = Boolean(disabledReason);
  const showLoadingState = loading && !hasValue;
  const showRefreshingState = refreshing || (loading && hasValue);
  const triggerValue = showLoadingState
    ? (loadingMessage ?? `Loading ${label.toLowerCase()}…`)
    : (value ?? placeholder);
  const triggerBody = (
    <BreadcrumbTriggerBody
      disabled={disabled}
      hasValue={hasValue}
      loading={loading}
      refreshing={refreshing}
      triggerValue={triggerValue}
      valuePrefix={valuePrefix}
    />
  );
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={cn(
                "flex min-w-0 cursor-not-allowed items-center gap-1.5 rounded-md px-2 py-1.5 opacity-50",
                triggerClassName
              )}
            />
          }
        >
          {triggerBody}
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    );
  }
  const close = () => setOpen(false);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label={breadcrumbTriggerAriaLabel(label, value)}
        className={cn(
          "flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName
        )}
      >
        {triggerBody}
      </PopoverTrigger>
      <PopoverContent align="start" className={`${contentWidth} gap-0 p-0`}>
        <Command
          filter={(optionValue, search) =>
            optionValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList className="pt-1">
            <BreadcrumbDropdownList
              close={close}
              emptyContent={emptyContent}
              emptyResourceName={emptyResourceName}
              label={label}
              loading={loading}
              loadingMessage={loadingMessage}
              showRefreshingState={showRefreshingState}
            >
              {children}
            </BreadcrumbDropdownList>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
function InstanceSelectorEmptyState({
  canCreateInstance,
}: {
  canCreateInstance: boolean;
}) {
  return (
    <Empty className="min-h-44 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Monitor aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle aria-level={3} role="heading">
          No instances found
        </EmptyTitle>
        <EmptyDescription>
          Create an instance to connect Querylane.
        </EmptyDescription>
      </EmptyHeader>
      {canCreateInstance ? (
        <EmptyContent>
          <Link
            className={cn(buttonVariants({ size: "sm" }), "w-fit")}
            to="/new-instance"
          >
            <Plus data-icon="inline-start" />
            Create instance
          </Link>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

type DbInstance = ReturnType<typeof useDb>["instances"][number];

function InstanceCommandItem({
  close,
  instance,
  navigateToInstance,
  selected,
}: {
  close: () => void;
  instance: DbInstance;
  navigateToInstance: ReturnType<typeof useDb>["navigateToInstance"];
  selected: boolean;
}) {
  const navigate = useNavigate();
  const handleSelect = () => {
    if (instance.credentialsUnreadable) {
      navigate({
        params: { instanceId: instance.id },
        to: "/instances/$instanceId/configuration",
      }).catch((error: unknown) =>
        handleNavigationError(error, {
          area: "admin-header.recover-instance-credentials",
        })
      );
      close();
      return;
    }
    navigateToInstance(instance);
    close();
  };
  const statusClassName =
    instance.status === "error" ? "text-destructive" : "text-muted-foreground";
  return (
    <CommandItem
      data-checked={selected}
      onSelect={handleSelect}
      value={`${instance.name} ${instance.host}${instance.credentialsUnreadable ? " credentials need attention review credentials" : ""}`}
    >
      <StatusDot status={instance.status} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OverflowAwareText className="min-w-0 truncate text-sm">
          {instance.name}
        </OverflowAwareText>
        <OverflowAwareText className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {instance.host}:{instance.port}
        </OverflowAwareText>
        {instance.credentialsUnreadable ? (
          <>
            <span className="truncate text-[11px] text-destructive">
              Credentials need attention
            </span>
            <span className="truncate text-[11px] text-destructive underline underline-offset-2">
              Review credentials
            </span>
          </>
        ) : null}
        {!instance.credentialsUnreadable && instance.status !== "connected" ? (
          <span className={cn("truncate text-[11px]", statusClassName)}>
            {getConnectionStatusLabel(instance.status)}
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
}

function RegisterInstanceCommand({
  close,
  hasInstances,
  isConfigManaged,
  isModeLoaded,
}: {
  close: () => void;
  hasInstances: boolean;
  isConfigManaged: boolean;
  isModeLoaded: boolean;
}) {
  const navigate = useNavigate();
  if (!hasInstances) {
    return isModeLoaded ? null : (
      <CommandItem
        aria-disabled={true}
        className="cursor-wait opacity-60"
        value="register new instance loading"
      >
        <Spinner className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground text-sm">
          Checking instance management
        </span>
      </CommandItem>
    );
  }
  if (!isModeLoaded) {
    return null;
  }
  if (isConfigManaged) {
    return (
      <Tooltip>
        <TooltipTrigger render={<div className="cursor-not-allowed" />}>
          <CommandItem
            className="opacity-60"
            disabled={true}
            value="register new instance config managed"
          >
            <Lock className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
              Register instance
            </span>
          </CommandItem>
        </TooltipTrigger>
        <TooltipContent side="right">
          Instances are managed via the server configuration file. Add them to
          your config and restart the server.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <CommandItem
      onSelect={() => {
        navigate({ to: "/new-instance" }).catch((error: unknown) =>
          handleNavigationError(error, {
            area: "admin-header.register-instance",
          })
        );
        close();
      }}
      value="register new instance"
    >
      <Plus className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground text-sm">Register instance</span>
    </CommandItem>
  );
}

function InstanceSelector({
  instances,
  navigateToInstance,
  queryState,
  selectedInstance,
}: {
  instances: ReturnType<typeof useDb>["instances"];
  navigateToInstance: ReturnType<typeof useDb>["navigateToInstance"];
  queryState: ReturnType<typeof useDb>["queryStates"]["instances"];
  selectedInstance: ReturnType<typeof useDb>["selectedInstance"];
}) {
  const { isConfigManaged, isLoaded: isModeLoaded } =
    useConfigManagedInstancesStatus();
  const breadcrumbState = getBreadcrumbQueryState(queryState);
  const hasInstances = instances.length > 0;
  return (
    <BreadcrumbDropdown
      contentWidth="w-72"
      emptyContent={
        <InstanceSelectorEmptyState
          canCreateInstance={isModeLoaded && !isConfigManaged}
        />
      }
      emptyResourceName="instances"
      label="Instance"
      loading={breadcrumbState.loading}
      loadingMessage="Loading instances..."
      placeholder="Select instance"
      refreshing={breadcrumbState.refreshing}
      triggerClassName="max-w-[11rem] sm:max-w-[14rem]"
      value={selectedInstance?.name ?? null}
      valuePrefix={
        selectedInstance ? (
          <HeaderStatusDot status={selectedInstance.status} />
        ) : null
      }
    >
      {(close) => (
        <>
          {instances.map((instance) => (
            <InstanceCommandItem
              close={close}
              instance={instance}
              key={instance.id}
              navigateToInstance={navigateToInstance}
              selected={selectedInstance?.id === instance.id}
            />
          ))}
          {hasInstances ? <CommandSeparator className="my-1" /> : null}
          <RegisterInstanceCommand
            close={close}
            hasInstances={hasInstances}
            isConfigManaged={isConfigManaged}
            isModeLoaded={isModeLoaded}
          />
        </>
      )}
    </BreadcrumbDropdown>
  );
}
function DatabaseSelector({
  databases,
  hideLeadingSeparatorOnMobile = false,
  navigateToDatabase,
  queryState,
  selectedDatabase,
  selectedInstance,
}: {
  databases: ReturnType<typeof useDb>["databases"];
  hideLeadingSeparatorOnMobile?: boolean;
  navigateToDatabase: ReturnType<typeof useDb>["navigateToDatabase"];
  queryState: ReturnType<typeof useDb>["queryStates"]["databases"];
  selectedDatabase: ReturnType<typeof useDb>["selectedDatabase"];
  selectedInstance: ReturnType<typeof useDb>["selectedInstance"];
}) {
  const { databaseId } = useCurrentRouteIds();
  // The database selector is only part of the path inside database scope.
  // Instance-scoped pages (overview, roles, configuration) have no database in
  // their route, so it would otherwise show a misleading "Select database".
  if (!(selectedInstance && databaseId)) {
    return null;
  }
  const breadcrumbState = getBreadcrumbQueryState(queryState);
  return (
    <>
      <PathSeparator
        className={hideLeadingSeparatorOnMobile ? "hidden lg:flex" : undefined}
      />
      <BreadcrumbDropdown
        contentWidth="w-64"
        disabledReason={getDisabledReason(selectedInstance.status)}
        emptyResourceName="databases"
        label="Database"
        loading={breadcrumbState.loading}
        loadingMessage="Loading databases..."
        placeholder="Select database"
        refreshing={breadcrumbState.refreshing}
        triggerClassName="max-w-[12rem] sm:max-w-[14rem]"
        value={selectedDatabase?.name ?? null}
        valuePrefix={
          <span className="shrink-0 font-medium text-muted-foreground text-sm">
            DB:
          </span>
        }
      >
        {(close) =>
          databases.map((database) => (
            <CommandItem
              data-checked={selectedDatabase?.id === database.id}
              key={database.id}
              onSelect={() => {
                navigateToDatabase(database);
                close();
              }}
              value={database.name}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <OverflowAwareText className="min-w-0 truncate text-sm">
                  {database.name}
                </OverflowAwareText>
                {database.owner ? (
                  <OverflowAwareText className="min-w-0 truncate text-[11px] text-muted-foreground">
                    owner {database.owner}
                  </OverflowAwareText>
                ) : null}
              </div>
            </CommandItem>
          ))
        }
      </BreadcrumbDropdown>
    </>
  );
}

function PathSeparator({ className }: { className?: string | undefined }) {
  return (
    <span
      className={cn(
        "flex select-none items-center font-light text-lg text-muted-foreground/40",
        className
      )}
    >
      /
    </span>
  );
}

// Role detail breadcrumb tail: a "Roles" link back to the list, a separator,
// then the current role name + kind badge — all on one line to match the slim
// single-row breadcrumb. No dropdown; the role isn't a switchable selection.
function RoleBreadcrumbSegment({
  instanceId,
  roleId,
}: {
  instanceId: string;
  roleId: string;
}) {
  const rolesQuery = useListAllRolesQuery(
    rolesForInstanceQueryInput(instanceId)
  );
  const role = rolesQuery.data?.roles.find(
    (candidate) => roleIdOf(candidate) === roleId
  );
  return (
    <span className="hidden min-w-0 items-center gap-1.5 lg:flex">
      <Link
        className="rounded-sm px-1 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        params={{ instanceId }}
        to="/instances/$instanceId/roles"
      >
        Roles
      </Link>
      <PathSeparator />
      <span
        aria-current="page"
        className="flex min-w-0 items-center gap-1.5 px-1"
      >
        <OverflowAwareText className="min-w-0 truncate font-medium font-mono text-foreground text-sm">
          {role?.roleName ?? roleId}
        </OverflowAwareText>
        {role ? <RoleKindBadge role={role} /> : null}
      </span>
    </span>
  );
}

// Page-location tail of the header breadcrumb, appended after the instance and
// (when present) database selectors. See resolveBreadcrumbTail.
function PageBreadcrumb() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const tail = resolveBreadcrumbTail(pathname);

  if (tail.kind === "none") {
    return null;
  }

  if (tail.kind === "page") {
    return (
      <>
        <PathSeparator className="hidden lg:flex" />
        <span
          aria-current="page"
          className="hidden min-w-0 truncate px-2 py-1 font-medium text-foreground text-sm lg:block"
        >
          {tail.label}
        </span>
      </>
    );
  }

  return (
    <>
      <PathSeparator className="hidden lg:flex" />
      <RoleBreadcrumbSegment
        instanceId={tail.instanceId}
        roleId={tail.roleId}
      />
    </>
  );
}

function AdminHeaderActions({
  githubUrl,
  resolvedTheme,
  stars,
  setTheme,
}: {
  githubUrl: string;
  resolvedTheme: ReturnType<typeof useTheme>["resolvedTheme"];
  stars: string | null;
  setTheme: ReturnType<typeof useTheme>["setTheme"];
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-2">
      <a
        className={cn(
          buttonVariants({
            size: "sm",
            variant: "ghost",
          }),
          "hidden h-8 shadow-none lg:inline-flex"
        )}
        href={githubUrl}
        rel="noreferrer"
        target="_blank"
      >
        <svg className="size-4" viewBox="0 0 438.549 438.549">
          <title>GitHub</title>
          <path
            d="M409.132 114.573c-19.608-33.596-46.205-60.194-79.798-79.8-33.598-19.607-70.277-29.408-110.063-29.408-39.781 0-76.472 9.804-110.063 29.408-33.596 19.605-60.194 46.204-79.8 79.8C9.803 148.168 0 184.854 0 224.63c0 47.78 13.94 90.745 41.827 128.906 27.884 38.164 63.906 64.572 108.063 79.227 5.14.954 8.945.283 11.419-1.996 2.475-2.282 3.711-5.14 3.711-8.562 0-.571-.049-5.708-.144-15.417a2549.81 2549.81 0 01-.144-25.406l-6.567 1.136c-4.187.767-9.469 1.092-15.846 1-6.374-.089-12.991-.757-19.842-1.999-6.854-1.231-13.229-4.086-19.13-8.559-5.898-4.473-10.085-10.328-12.56-17.556l-2.855-6.57c-1.903-4.374-4.899-9.233-8.992-14.559-4.093-5.331-8.232-8.945-12.419-10.848l-1.999-1.431c-1.332-.951-2.568-2.098-3.711-3.429-1.142-1.331-1.997-2.663-2.568-3.997-.572-1.335-.098-2.43 1.427-3.289 1.525-.859 4.281-1.276 8.28-1.276l5.708.853c3.807.763 8.516 3.042 14.133 6.851 5.614 3.806 10.229 8.754 13.846 14.842 4.38 7.806 9.657 13.754 15.846 17.847 6.184 4.093 12.419 6.136 18.699 6.136 6.28 0 11.704-.476 16.274-1.423 4.565-.952 8.848-2.383 12.847-4.285 1.713-12.758 6.377-22.559 13.988-29.41-10.848-1.14-20.601-2.857-29.264-5.14-8.658-2.286-17.605-5.996-26.835-11.14-9.235-5.137-16.896-11.516-22.985-19.126-6.09-7.614-11.088-17.61-14.987-29.979-3.901-12.374-5.852-26.648-5.852-42.826 0-23.035 7.52-42.637 22.557-58.817-7.044-17.318-6.379-36.732 1.997-58.24 5.52-1.715 13.706-.428 24.554 3.853 10.85 4.283 18.794 7.952 23.84 10.994 5.046 3.041 9.089 5.618 12.135 7.708 17.705-4.947 35.976-7.421 54.818-7.421s37.117 2.474 54.823 7.421l10.849-6.849c7.419-4.57 16.18-8.758 26.262-12.565 10.088-3.805 17.802-4.853 23.134-3.138 8.562 21.509 9.325 40.922 2.279 58.24 15.036 16.18 22.559 35.787 22.559 58.817 0 16.178-1.958 30.497-5.853 42.966-3.9 12.471-8.941 22.457-15.125 29.979-6.191 7.521-13.901 13.85-23.131 18.986-9.232 5.14-18.182 8.85-26.84 11.136-8.662 2.286-18.415 4.004-29.263 5.146 9.894 8.562 14.842 22.077 14.842 40.539v60.237c0 3.422 1.19 6.279 3.572 8.562 2.379 2.279 6.136 2.95 11.276 1.995 44.163-14.653 80.185-41.062 108.068-79.226 27.88-38.161 41.825-81.126 41.825-128.906-.01-39.771-9.818-76.454-29.414-110.049z"
            fill="currentColor"
          />
        </svg>
        {stars !== null && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {stars}
          </span>
        )}
      </a>
      <ThemeModeMenu resolvedTheme={resolvedTheme} setTheme={setTheme} />
    </div>
  );
}
export function AdminHeader() {
  const {
    instances,
    selectedInstance,
    databases,
    selectedDatabase,
    queryStates,
    navigateToInstance,
    navigateToDatabase,
  } = useDb();
  const { resolvedTheme, setTheme } = useTheme();
  const githubRepo = env.PUBLIC_GITHUB_REPO?.trim();
  const { data: starsResult } = useGithubRepoStarsQuery(githubRepo);
  const stars = starsResult ?? null;
  const githubUrl = githubRepo
    ? `https://github.com/${githubRepo}`
    : "https://github.com/querylane/querylane";
  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-1 overflow-hidden border-border border-b bg-background px-2 sm:gap-2 sm:px-3 lg:gap-3 lg:px-4">
      <SidebarTrigger
        aria-label="Open navigation menu"
        className="shrink-0 lg:hidden"
      />

      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden sm:gap-2"
      >
        <div
          className={cn("min-w-0", selectedDatabase ? "hidden lg:block" : "")}
        >
          <InstanceSelector
            instances={instances}
            navigateToInstance={navigateToInstance}
            queryState={queryStates.instances}
            selectedInstance={selectedInstance}
          />
        </div>
        {/* On lg+ the sidebar's database switcher replaces this breadcrumb;
            on smaller screens the rail is an off-canvas drawer, so the topbar
            keeps the only always-visible database selector. */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2 lg:hidden">
          <DatabaseSelector
            databases={databases}
            hideLeadingSeparatorOnMobile={Boolean(selectedDatabase)}
            navigateToDatabase={navigateToDatabase}
            queryState={queryStates.databases}
            selectedDatabase={selectedDatabase}
            selectedInstance={selectedInstance}
          />
        </div>
        <PageBreadcrumb />
      </nav>

      <AdminHeaderActions
        githubUrl={githubUrl}
        resolvedTheme={resolvedTheme}
        setTheme={setTheme}
        stars={stars}
      />
    </header>
  );
}
