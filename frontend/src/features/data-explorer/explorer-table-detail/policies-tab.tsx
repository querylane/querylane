import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { SearchEmptyState } from "@/components/search-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTableFilter } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SqlCodeBlock } from "@/components/ui/sql-code-block";
import { deriveMetadataToolbar } from "@/features/data-explorer/explorer-table-detail/metadata";
import { presentPolicyModeOptions } from "@/features/data-explorer/explorer-table-detail/options";
import {
  collectPolicyRoles,
  deriveRlsPreview,
  formatPolicyRoles,
  isPolicyPageSize,
  POLICY_PAGE_SIZE_OPTIONS,
  type PolicyPageSize,
  policyModeBadgeClassName,
  policyModeLabel,
} from "@/features/data-explorer/explorer-table-detail/policies-model";
import {
  FacetFilterBar,
  TabError,
  TableResourceEmptyState,
  TabSkeleton,
} from "@/features/data-explorer/explorer-table-detail/shared-ui";
import { filterPoliciesByMode } from "@/features/data-explorer/explorer-table-detail-filters";
import type { useListTablePoliciesQuery } from "@/hooks/api/table";
import {
  DEFAULT_PAGE_SIZE,
  pageIndexForPageSizeChange,
} from "@/lib/pagination";
import { formatPolicyCommand } from "@/lib/protobuf-enums";
import { cn } from "@/lib/utils";
import type { TablePolicy } from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  PolicyCommand,
  type PolicyMode,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

const PREVIEW_POLICY_COMMANDS: PolicyCommand[] = [
  PolicyCommand.SELECT,
  PolicyCommand.INSERT,
  PolicyCommand.UPDATE,
  PolicyCommand.DELETE,
];

function PolicyExpression({ expression }: { expression: string }) {
  return (
    <SqlCodeBlock
      className="mt-1"
      copyable={false}
      sql={expression}
      variant="compact"
    />
  );
}

function PolicyCard({ policy }: { policy: TablePolicy }) {
  return (
    <article className="rounded-lg border bg-card p-3 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono font-semibold text-sm">{policy.policyName}</h2>
        <Badge className="h-[18px] font-mono text-[10px]" variant="outline">
          FOR {formatPolicyCommand(policy.command)}
        </Badge>
        <Badge
          className={cn(
            "h-[18px] font-mono text-[10px]",
            policyModeBadgeClassName(policy.mode)
          )}
          variant="secondary"
        >
          {policyModeLabel(policy.mode)}
        </Badge>
        <span className="ml-auto font-mono text-muted-foreground text-xs">
          TO {formatPolicyRoles(policy)}
        </span>
      </div>
      {policy.usingExpression ? (
        <div className="mt-3">
          <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
            USING
          </div>
          <PolicyExpression expression={policy.usingExpression} />
        </div>
      ) : null}
      {policy.checkExpression ? (
        <div className="mt-2">
          <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
            WITH CHECK
          </div>
          <PolicyExpression expression={policy.checkExpression} />
        </div>
      ) : null}
    </article>
  );
}

function RlsCombinationGuide() {
  return (
    <section className="rounded-lg border bg-card p-4 shadow-xs">
      <h2 className="font-semibold text-sm">How the server combines these</h2>
      <ol className="mt-3 flex list-none flex-col gap-2 pl-0 text-muted-foreground text-sm leading-relaxed">
        <li>
          <span className="font-medium text-foreground">1 · Grants first.</span>{" "}
          A role with no SELECT grant sees nothing; RLS never even runs.
        </li>
        <li>
          <span className="font-medium text-foreground">
            2 · PERMISSIVE policies OR together.
          </span>{" "}
          A row is visible if any one matches.
        </li>
        <li>
          <span className="font-medium text-foreground">
            3 · RESTRICTIVE policies AND on top.
          </span>{" "}
          Every one must also pass.
        </li>
        <li>
          <span className="font-medium text-foreground">
            4 · No matching policy = zero rows.
          </span>{" "}
          RLS is default-deny, not default-allow.
        </li>
        <li>
          <span className="font-medium text-foreground">
            5 · Owner and BYPASSRLS skip it
          </span>{" "}
          unless FORCE ROW LEVEL SECURITY is set.
        </li>
      </ol>
    </section>
  );
}

function RlsPreview({ policies }: { policies: TablePolicy[] }) {
  const roleOptions = collectPolicyRoles(policies);
  const [selectedRole, setSelectedRole] = useState(roleOptions[0] ?? "public");
  const [selectedCommand, setSelectedCommand] = useState(PolicyCommand.SELECT);
  const activeRole = roleOptions.includes(selectedRole)
    ? selectedRole
    : (roleOptions[0] ?? "public");
  const previewCommand = PREVIEW_POLICY_COMMANDS.includes(selectedCommand)
    ? selectedCommand
    : PolicyCommand.SELECT;
  const preview = deriveRlsPreview({
    command: previewCommand,
    policies,
    role: activeRole,
  });
  function handleRoleChange(value: string | null) {
    if (value) {
      setSelectedRole(value);
    }
  }
  function handleCommandChange(value: string | null) {
    if (value) {
      setSelectedCommand(Number(value) as PolicyCommand);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-sm">Preview visibility as</h2>
        <Select onValueChange={handleRoleChange} value={activeRole}>
          <SelectTrigger
            aria-label="Policy role"
            className="h-8 min-w-44 font-mono"
            size="sm"
          >
            <SelectValue>{activeRole}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {roleOptions.map((role) => (
              <SelectItem key={role} label={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">running</span>
        <Select
          onValueChange={handleCommandChange}
          value={String(previewCommand)}
        >
          <SelectTrigger
            aria-label="Policy command"
            className="h-8 min-w-32 font-mono"
            size="sm"
          >
            <SelectValue>{formatPolicyCommand(previewCommand)}</SelectValue>
          </SelectTrigger>
          <SelectContent align="start">
            {PREVIEW_POLICY_COMMANDS.map((command) => (
              <SelectItem
                key={command}
                label={formatPolicyCommand(command)}
                value={String(command)}
              >
                {formatPolicyCommand(command)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div aria-atomic="true" aria-live="polite">
        <div
          className={cn(
            "mt-4 flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm leading-relaxed",
            preview.hasRows
              ? "bg-emerald-500/10 text-foreground"
              : "bg-amber-500/10 text-foreground"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              preview.hasRows ? "bg-emerald-500" : "bg-amber-500"
            )}
          />
          <span>{preview.verdict}</span>
        </div>

        {preview.hasRows ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                Applied
              </span>
              {preview.appliedPolicies.map((policy) => (
                <Badge
                  className="h-5 font-mono text-[10px]"
                  key={policy.policyName}
                  variant="secondary"
                >
                  {policy.policyName}
                </Badge>
              ))}
            </div>
            <PolicyExpression expression={preview.predicate} />
          </>
        ) : null}
      </div>
    </section>
  );
}

function PoliciesTab({
  query,
}: {
  query: ReturnType<typeof useListTablePoliciesQuery>;
}) {
  const [policySearch, setPolicySearch] = useState("");
  const [modeFilters, setModeFilters] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<PolicyPageSize>(DEFAULT_PAGE_SIZE);
  const toolbar = deriveMetadataToolbar([query]);
  if (query.error) {
    return (
      <TabError
        errors={[
          {
            endpoint: "ListTablePolicies",
            error: query.error,
            label: "Policies",
          },
        ]}
        onRetry={toolbar.handleRetry}
        tab="policies"
      />
    );
  }
  if (!query.data || query.isLoading) {
    return <TabSkeleton />;
  }
  const { policies } = query.data;
  if (policies.length === 0) {
    return <TableResourceEmptyState category="policies" toolbar={toolbar} />;
  }
  const normalizedSearch = policySearch.trim().toLocaleLowerCase();
  const visiblePolicies = filterPoliciesByMode(
    policies,
    modeFilters.map(Number) as PolicyMode[]
  ).filter((policy) =>
    policy.policyName.toLocaleLowerCase().includes(normalizedSearch)
  );
  const pageCount = Math.max(1, Math.ceil(visiblePolicies.length / pageSize));
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pagePolicies = visiblePolicies.slice(
    currentPageIndex * pageSize,
    (currentPageIndex + 1) * pageSize
  );
  const firstPolicy = currentPageIndex * pageSize + 1;
  const lastPolicy = Math.min(
    (currentPageIndex + 1) * pageSize,
    visiblePolicies.length
  );

  function handlePolicySearchChange(nextSearch: string) {
    setPageIndex(0);
    setPolicySearch(nextSearch);
  }

  function handlePolicyModeFiltersChange(nextModeFilters: string[]) {
    setPageIndex(0);
    setModeFilters(nextModeFilters);
  }

  return (
    <div className="flex flex-col gap-3" data-slot="policies-tab">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-xs">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-emerald-500"
        />
        <p className="font-medium text-sm">
          This table defines row-level security policies; table owners and
          BYPASSRLS roles may bypass them
        </p>
        <span
          aria-live="polite"
          className="ml-auto text-muted-foreground text-xs"
        >
          {toolbar.lastFetchedLabel}
        </span>
      </div>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <DataTableFilter
          onChange={handlePolicySearchChange}
          placeholder="Search policies…"
          value={policySearch}
        />
        <FacetFilterBar
          filters={[
            {
              handleSelectedValuesChange: handlePolicyModeFiltersChange,
              label: "Mode",
              options: presentPolicyModeOptions(policies),
              selectedValues: modeFilters,
            },
          ]}
        />
      </div>
      {pagePolicies.length > 0 ? (
        <div className="flex flex-col gap-3">
          {pagePolicies.map((policy) => (
            <PolicyCard key={policy.policyName} policy={policy} />
          ))}
        </div>
      ) : null}
      {pagePolicies.length === 0 ? (
        <SearchEmptyState className="border" resourceName="policies" />
      ) : null}
      <fieldset
        aria-label="Policies pagination"
        className="m-0 flex min-h-8 min-w-0 flex-wrap items-center gap-2 border-0 p-0 text-muted-foreground text-xs"
      >
        <span className="text-[11px]">Rows per page</span>
        <Select
          onValueChange={(nextValue) => {
            if (typeof nextValue !== "string") {
              return;
            }
            const nextPageSize = Number(nextValue);
            if (isPolicyPageSize(nextPageSize)) {
              setPageIndex(
                pageIndexForPageSizeChange({
                  nextPageSize,
                  pageIndex: currentPageIndex,
                  pageSize,
                })
              );
              setPageSize(nextPageSize);
            }
          }}
          value={String(pageSize)}
        >
          <SelectTrigger
            aria-label="Rows per page"
            className="h-7 w-16"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POLICY_PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} label={String(size)} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {visiblePolicies.length > 0 ? (
          <>
            <span className="tabular-nums">
              Showing {firstPolicy}–{lastPolicy} of {visiblePolicies.length}{" "}
              policies
            </span>
            <span
              aria-atomic="true"
              aria-live="polite"
              className="sr-only"
              role="status"
            >
              Showing {firstPolicy}–{lastPolicy} of {visiblePolicies.length}{" "}
              policies. Page {currentPageIndex + 1} of {pageCount}.
            </span>
          </>
        ) : null}
        <nav
          aria-label="Policy pages"
          className="ml-auto flex items-center gap-2"
        >
          <Button
            aria-label="Previous policies page"
            className="size-7 p-0"
            disabled={currentPageIndex === 0}
            onClick={() => {
              setPageIndex(Math.max(0, currentPageIndex - 1));
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronLeft className="size-3" />
          </Button>
          <span className="font-mono text-xs">
            Page {currentPageIndex + 1} of {pageCount}
          </span>
          <Button
            aria-label="Next policies page"
            className="size-7 p-0"
            disabled={currentPageIndex >= pageCount - 1}
            onClick={() => {
              setPageIndex(Math.min(pageCount - 1, currentPageIndex + 1));
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <ChevronRight className="size-3" />
          </Button>
        </nav>
      </fieldset>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <RlsCombinationGuide />
        <RlsPreview policies={policies} />
      </div>
    </div>
  );
}

export { PoliciesTab };
