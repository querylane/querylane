import { Funnel } from "lucide-react";
import { useReducer } from "react";
import { DataGridPopoverContent } from "@/components/data-grid/table-data-grid/data-grid-popover-content";
import { FilterErrors } from "@/components/data-grid/table-data-grid/filter-popover-errors";
import { RulesEditor } from "@/components/data-grid/table-data-grid/filter-popover-rules-editor";
import { SqlWhereEditor } from "@/components/data-grid/table-data-grid/filter-popover-sql-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createFilterRule,
  getInvalidFilterRules,
  isFilterLogic,
  isIncompleteFilterRule,
  MAX_FILTER_RULES,
  parseSqlWhereFilter,
  serializeSqlWhereFilterRules,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const DEFAULT_FILTER_LOGIC: TableFilterLogic = "and";

type FilterPopoverMode = "rules" | "sql";

const UNSUPPORTED_SQL_RULES_MESSAGE =
  "Current rules cannot be represented in SQL WHERE. Enter a new SQL WHERE clause or return to Rules.";

interface FilterPopoverProps {
  columns: TableResultColumn[];
  logic: TableFilterLogic;
  onChange: (nextRules: TableFilterRule[], nextLogic: TableFilterLogic) => void;
  popoverBoundary?: HTMLElement | null | undefined;
  rules: TableFilterRule[];
  title?: string | undefined;
}

interface FilterPopoverState {
  draftLogic: TableFilterLogic;
  draftMode: FilterPopoverMode;
  draftRules: TableFilterRule[];
  errors: Array<{ id: string; message: string }>;
  hasUnsupportedSqlRules: boolean;
  open: boolean;
  sqlWhere: string;
}

function mergeFilterPopoverState(
  state: FilterPopoverState,
  patch: Partial<FilterPopoverState>
): FilterPopoverState {
  return { ...state, ...patch };
}

function isFilterPopoverMode(value: string): value is FilterPopoverMode {
  return value === "rules" || value === "sql";
}

function FilterPopover({
  columns,
  logic,
  onChange,
  popoverBoundary,
  rules,
  title = "Filter rows",
}: FilterPopoverProps) {
  const [state, updateState] = useReducer(mergeFilterPopoverState, {
    draftLogic: DEFAULT_FILTER_LOGIC,
    draftMode: "rules",
    draftRules: rules,
    errors: [],
    hasUnsupportedSqlRules: false,
    open: false,
    sqlWhere: "",
  });
  const {
    draftLogic,
    draftMode,
    draftRules,
    errors,
    hasUnsupportedSqlRules,
    open,
    sqlWhere,
  } = state;
  const selectedLogic = isFilterLogic(logic) ? logic : DEFAULT_FILTER_LOGIC;
  const canAdd = columns.length > 0 && draftRules.length < MAX_FILTER_RULES;

  function resetDraftsFromCommitted() {
    const serializedSqlWhere = serializeSqlWhereFilterRules(rules);
    const firstColumn = columns[0]?.columnName;
    updateState({
      draftLogic: selectedLogic,
      draftRules:
        rules.length > 0 || !firstColumn
          ? rules
          : [createFilterRule(firstColumn)],
      errors: [],
      hasUnsupportedSqlRules:
        serializedSqlWhere === undefined && rules.length > 0,
      open: true,
      sqlWhere: serializedSqlWhere ?? "",
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetDraftsFromCommitted();
      return;
    }
    updateState({ open: false });
  }

  function updateAt(index: number, patch: Partial<TableFilterRule>) {
    const next = draftRules.slice();
    const current = next[index];
    if (!current) {
      return;
    }
    next[index] = { ...current, ...patch };
    updateState({ draftRules: next, errors: [] });
  }

  function removeAt(index: number) {
    const next = draftRules.slice();
    next.splice(index, 1);
    updateState({ draftRules: next, errors: [] });
  }

  function addRule() {
    const firstColumn = columns[0]?.columnName;
    if (!firstColumn) {
      return;
    }
    updateState({
      draftRules: [...draftRules, createFilterRule(firstColumn)],
      errors: [],
    });
  }

  function commitFilterState(next: {
    logic: TableFilterLogic;
    rules: TableFilterRule[];
  }) {
    onChange(next.rules, next.logic);
  }

  function clearFilters() {
    const firstColumn = columns[0]?.columnName;
    updateState({
      draftLogic: DEFAULT_FILTER_LOGIC,
      draftRules: firstColumn ? [createFilterRule(firstColumn)] : [],
      errors: [],
      hasUnsupportedSqlRules: false,
      sqlWhere: "",
    });
    commitFilterState({ logic: DEFAULT_FILTER_LOGIC, rules: [] });
  }

  function ruleValidationErrors(
    nextRules: TableFilterRule[]
  ): Array<{ id: string; message: string }> {
    return getInvalidFilterRules(nextRules, columns).map((rule) => ({
      id: rule.id,
      message: rule.message,
    }));
  }

  function applyRules() {
    const completeRules = draftRules.filter(
      (rule) => !isIncompleteFilterRule(rule)
    );
    const nextErrors = ruleValidationErrors(completeRules);
    if (nextErrors.length > 0) {
      updateState({ errors: nextErrors });
      return;
    }
    commitFilterState({ logic: draftLogic, rules: completeRules });
    updateState({ open: false });
  }

  function applySqlWhere() {
    const parsed = parseSqlWhereFilter(sqlWhere);
    if (!parsed.ok) {
      updateState({
        errors: [{ id: "sql-where-parse", message: parsed.error }],
      });
      return;
    }
    const nextErrors = ruleValidationErrors(parsed.rules);
    if (nextErrors.length > 0) {
      updateState({ errors: nextErrors });
      return;
    }
    updateState({
      draftLogic: DEFAULT_FILTER_LOGIC,
      draftRules: parsed.rules,
      open: false,
    });
    commitFilterState({ logic: DEFAULT_FILTER_LOGIC, rules: parsed.rules });
  }

  function applyCurrentDraft() {
    if (draftMode === "sql") {
      applySqlWhere();
      return;
    }
    applyRules();
  }

  const invalidDraftRuleIds = new Set(
    getInvalidFilterRules(draftRules, columns).map((rule) => rule.id)
  );
  const draftConditionCount = draftRules.filter(
    (rule) =>
      !(isIncompleteFilterRule(rule) || invalidDraftRuleIds.has(rule.id))
  ).length;

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <Funnel data-icon="inline-start" />
            Filter
            {rules.length > 0 ? (
              <Badge
                className="ml-0.5 h-4 px-1 font-mono text-[10px]"
                variant="secondary"
              >
                {rules.length}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DataGridPopoverContent
        align="start"
        aria-label={title}
        className="w-[min(38.75rem,var(--available-width))] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border-border bg-popover p-0 shadow-lg"
        collisionBoundary={popoverBoundary ?? undefined}
      >
        <Tabs
          className="gap-0"
          onValueChange={(next) => {
            if (isFilterPopoverMode(next)) {
              updateState({
                draftMode: next,
                errors:
                  next === "sql" && hasUnsupportedSqlRules
                    ? [
                        {
                          id: "unsupported-sql-rules",
                          message: UNSUPPORTED_SQL_RULES_MESSAGE,
                        },
                      ]
                    : [],
              });
            }
          }}
          value={draftMode}
        >
          <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5">
            <span className="min-w-0 truncate font-semibold text-xs">
              {title}
            </span>
            <TabsList className="h-8 rounded-lg bg-muted p-0.5">
              <TabsTrigger className="px-2.5 text-xs" value="rules">
                Rules
              </TabsTrigger>
              <TabsTrigger className="px-2.5 text-xs" value="sql">
                SQL WHERE
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="m-0 p-3.5" value="rules">
            <RulesEditor
              canAdd={canAdd}
              columns={columns}
              logic={draftLogic}
              onAddRule={addRule}
              onLogicChange={(next) => updateState({ draftLogic: next })}
              onRemoveRule={removeAt}
              onUpdateRule={updateAt}
              rules={draftRules}
            />
          </TabsContent>
          <TabsContent className="m-0 p-3.5" value="sql">
            <SqlWhereEditor
              onChange={(next) => {
                updateState({
                  errors: [],
                  hasUnsupportedSqlRules: false,
                  sqlWhere: next,
                });
              }}
              value={sqlWhere}
            />
          </TabsContent>

          <FilterErrors errors={errors} />

          <div className="flex items-center justify-between gap-4 border-t px-3.5 py-2.5">
            <span className="text-[11px] text-muted-foreground">
              {draftConditionCount === 0
                ? "No conditions yet"
                : `${draftConditionCount.toLocaleString()} ${draftConditionCount === 1 ? "condition" : "conditions"}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                onClick={clearFilters}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
              <Button
                disabled={draftMode === "sql" && hasUnsupportedSqlRules}
                onClick={applyCurrentDraft}
                size="sm"
                type="button"
              >
                Apply
              </Button>
            </div>
          </div>
        </Tabs>
      </DataGridPopoverContent>
    </Popover>
  );
}

export { FilterPopover };
