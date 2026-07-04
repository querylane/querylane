import { Funnel, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DataGridPopoverContent } from "@/components/data-grid/table-data-grid/data-grid-popover-content";
import { SelectValue } from "@/components/select-extensions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  buildFilterLabel,
  createFilterRule,
  FILTER_OPERATOR_META,
  getOperatorsForColumn,
  isFilterLogic,
  isFilterOperator,
  MAX_FILTER_RULES,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

const DEFAULT_FILTER_LOGIC: TableFilterLogic = "and";

interface FilterPopoverProps {
  columns: TableResultColumn[];
  logic: TableFilterLogic;
  onChange: (next: TableFilterRule[]) => void;
  onLogicChange: (next: TableFilterLogic) => void;
  popoverBoundary?: HTMLElement | null | undefined;
  rules: TableFilterRule[];
}

function FilterPopover({
  columns,
  logic,
  onChange,
  onLogicChange,
  popoverBoundary,
  rules,
}: FilterPopoverProps) {
  const canAdd = columns.length > 0 && rules.length < MAX_FILTER_RULES;
  const selectedLogic = isFilterLogic(logic) ? logic : DEFAULT_FILTER_LOGIC;

  function updateAt(index: number, patch: Partial<TableFilterRule>) {
    const next = rules.slice();
    const current = next[index];
    if (!current) {
      return;
    }
    next[index] = { ...current, ...patch };
    onChange(next);
  }

  function removeAt(index: number) {
    const next = rules.slice();
    next.splice(index, 1);
    onChange(next);
  }

  function addRule() {
    const firstColumn = columns[0]?.columnName;
    if (!firstColumn) {
      return;
    }
    onChange([...rules, createFilterRule(firstColumn)]);
  }

  return (
    <Popover>
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
        className="w-[min(32.5rem,var(--available-width))] max-w-[calc(100vw-2rem)] p-2.5"
        collisionBoundary={popoverBoundary ?? undefined}
      >
        <div className="flex items-center justify-between gap-3 border-b pb-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-medium">Filter rows</span>
            {rules.length > 0 ? (
              <Badge
                className="h-4 px-1 font-mono text-[10px]"
                variant="secondary"
              >
                {rules.length}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span>Match</span>
            <Select
              onValueChange={(next) => {
                if (next && isFilterLogic(next)) {
                  onLogicChange(next);
                }
              }}
              value={selectedLogic}
            >
              <SelectTrigger
                aria-label="Match filter logic"
                className="h-7 w-[84px]"
              >
                <span className="flex flex-1 text-left">
                  {selectedLogic === "or" ? "any" : "all"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem label="all" value="and">
                  all
                </SelectItem>
                <SelectItem label="any" value="or">
                  any
                </SelectItem>
              </SelectContent>
            </Select>
            <span>filters</span>
            {rules.length > 0 ? (
              <Button
                className="h-6 px-2 text-[11px]"
                onClick={() => onChange([])}
                size="xs"
                type="button"
                variant="ghost"
              >
                Clear all
              </Button>
            ) : null}
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="pt-2">
            <FilterHelp />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 pt-2">
            <div
              aria-hidden="true"
              className="grid grid-cols-[minmax(8rem,1.05fr)_112px_minmax(10rem,1.35fr)_1.75rem] gap-1.5 px-1 text-[10px] text-muted-foreground"
            >
              <span>Column</span>
              <span>Condition</span>
              <span>Value</span>
              <span />
            </div>
            <ul className="flex max-h-[min(48vh,22rem)] flex-col gap-1 overflow-auto">
              {rules.map((rule, index) => (
                <FilterRow
                  columns={columns}
                  key={rule.id}
                  onChange={(patch) => updateAt(index, patch)}
                  onRemove={() => removeAt(index)}
                  rule={rule}
                />
              ))}
            </ul>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
          <Button
            className="h-7 px-2"
            disabled={!canAdd}
            onClick={addRule}
            size="xs"
            type="button"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add filter
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {rules.length.toLocaleString()} of{" "}
            {MAX_FILTER_RULES.toLocaleString()}
          </span>
        </div>
      </DataGridPopoverContent>
    </Popover>
  );
}

function FilterHelp() {
  return (
    <p className="text-muted-foreground text-xs">
      Pick a column, choose an operator, then enter a value. Use
      <span className="px-1 font-medium text-foreground">any</span> to match
      alternatives, or
      <span className="px-1 font-medium text-foreground">all</span> to narrow
      results.
    </p>
  );
}

function getValuePlaceholder(
  rule: TableFilterRule,
  column: TableResultColumn | undefined
): string {
  if (FILTER_OPERATOR_META[rule.operator].valueCount === "list") {
    return "pending, failed";
  }
  if (rule.operator === "like" || rule.operator === "ilike") {
    return "%@acme.com";
  }
  if (rule.operator === "jsonContains" || column?.dataType === DataType.JSON) {
    return '{"tier":"enterprise"}';
  }
  if (column?.dataType === DataType.BOOLEAN) {
    return "true";
  }
  if (
    column?.dataType === DataType.DATE ||
    column?.dataType === DataType.TIME ||
    column?.dataType === DataType.TIMESTAMP
  ) {
    return "2026-05-01";
  }
  if (
    column?.dataType === DataType.FLOAT ||
    column?.dataType === DataType.INTEGER
  ) {
    return "100";
  }
  return "Value";
}

interface FilterRowProps {
  columns: TableResultColumn[];
  onChange: (patch: Partial<TableFilterRule>) => void;
  onRemove: () => void;
  rule: TableFilterRule;
}

// Matches the sidebar search debounce so value edits commit one rule change
// (one server query + one history entry) per typing pause, not per keystroke.
const FILTER_VALUE_DEBOUNCE_MS = 200;

function useDebouncedRuleValue(
  committedValue: string,
  commit: (next: string) => void,
  resetKey: string
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(committedValue);
  const [previousState, setPreviousState] = useState(() => ({
    committedValue,
    resetKey,
  }));
  if (
    previousState.committedValue !== committedValue ||
    previousState.resetKey !== resetKey
  ) {
    // Adjust during render: external rule updates (operator reset, chip
    // removal, URL normalization) replace the local draft. resetKey covers
    // branch changes where the committed value stays empty.
    setPreviousState({ committedValue, resetKey });
    setDraft(committedValue);
  }

  useEffect(
    function commitDraftAfterTypingPause() {
      if (draft === committedValue) {
        return;
      }
      const timeoutId = window.setTimeout(() => {
        commit(draft);
      }, FILTER_VALUE_DEBOUNCE_MS);
      return () => window.clearTimeout(timeoutId);
    },
    [commit, committedValue, draft]
  );

  return [draft, setDraft];
}

function FilterRow({ columns, onChange, onRemove, rule }: FilterRowProps) {
  const column = columns.find(
    (candidate) => candidate.columnName === rule.column
  );
  const operatorMeta = FILTER_OPERATOR_META[rule.operator];
  const operators = getOperatorsForColumn(column);
  // Base UI's <Select.Value> only renders the item label (e.g. "!=") when the
  // root is given an `items` map; otherwise it falls back to the raw value
  // (e.g. "ne"). The SelectItem `label` prop only drives keyboard typeahead.
  const operatorItems = operators.map((operator) => ({
    label: FILTER_OPERATOR_META[operator].label,
    value: operator,
  }));
  const valueResetKey = `${rule.column}\u0000${rule.operator}\u0000value`;
  const value2ResetKey = `${rule.column}\u0000${rule.operator}\u0000value2`;
  const [draftValue, setDraftValue] = useDebouncedRuleValue(
    rule.value,
    (next) => onChange({ value: next }),
    valueResetKey
  );
  const [draftValue2, setDraftValue2] = useDebouncedRuleValue(
    rule.value2 ?? "",
    (next) => onChange({ value2: next }),
    value2ResetKey
  );

  function changeColumn(nextColumn: string | null) {
    if (!nextColumn) {
      return;
    }
    const nextMeta = columns.find(
      (candidate) => candidate.columnName === nextColumn
    );
    const nextOperators = getOperatorsForColumn(nextMeta);
    const operator = nextOperators.includes(rule.operator)
      ? rule.operator
      : (nextOperators[0] ?? "eq");
    onChange({ column: nextColumn, operator, value: "", value2: undefined });
  }

  function changeOperator(nextOperator: string | null) {
    if (!(nextOperator && isFilterOperator(nextOperator))) {
      return;
    }
    onChange({
      operator: nextOperator,
      value: "",
      value2: undefined,
    });
  }

  return (
    <li className="grid grid-cols-[minmax(8rem,1.05fr)_112px_minmax(10rem,1.35fr)_1.75rem] items-center gap-1.5">
      <Select onValueChange={changeColumn} value={rule.column}>
        <SelectTrigger aria-label="Filter column" className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map((candidate) => (
            <SelectItem
              key={candidate.columnName}
              label={candidate.columnName}
              value={candidate.columnName}
            >
              <span className="font-mono text-xs">{candidate.columnName}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={operatorItems}
        onValueChange={changeOperator}
        value={rule.operator}
      >
        <SelectTrigger aria-label="Filter operator" className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((operator) => (
            <SelectItem
              key={operator}
              label={FILTER_OPERATOR_META[operator].label}
              value={operator}
            >
              {FILTER_OPERATOR_META[operator].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {operatorMeta.valueCount === 0 ? (
        <div className="flex h-8 items-center rounded-md border border-dashed px-2 text-muted-foreground text-xs">
          No value needed
        </div>
      ) : (
        <div
          className="grid min-w-0 grid-cols-1 gap-1.5 data-[range=true]:grid-cols-2"
          data-range={operatorMeta.valueCount === 2}
        >
          <Input
            aria-label="Filter value"
            className="h-8 min-w-0 font-mono text-xs"
            onChange={(event) => setDraftValue(event.target.value)}
            placeholder={getValuePlaceholder(rule, column)}
            value={draftValue}
          />
          {operatorMeta.valueCount === 2 ? (
            <Input
              aria-label="Filter end value"
              className="h-8 min-w-0 font-mono text-xs"
              onChange={(event) => setDraftValue2(event.target.value)}
              placeholder="And"
              value={draftValue2}
            />
          ) : null}
        </div>
      )}

      <Button
        aria-label="Remove filter"
        className="size-7 p-0"
        onClick={onRemove}
        size="sm"
        type="button"
        variant="ghost"
      >
        <X />
      </Button>
    </li>
  );
}

function FilterChips({
  logic,
  onChange,
  rules,
}: Pick<FilterPopoverProps, "logic" | "onChange" | "rules">) {
  if (rules.length === 0) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {rules.length > 1 ? (
        <Badge className="font-mono text-[10px]" variant="outline">
          {logic === "or" ? "any" : "all"}
        </Badge>
      ) : null}
      {rules.map((rule) => (
        <Badge
          className="gap-1 truncate font-mono text-[10px]"
          key={rule.id}
          variant="secondary"
        >
          <span className="truncate">{buildFilterLabel(rule)}</span>
          <Button
            aria-label={`Remove filter ${buildFilterLabel(rule)}`}
            className="size-4 p-0 text-muted-foreground hover:text-foreground"
            onClick={() =>
              onChange(rules.filter((candidate) => candidate.id !== rule.id))
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="size-3" />
          </Button>
        </Badge>
      ))}
      <Button
        className="h-5 px-1.5 text-[10px]"
        onClick={() => onChange([])}
        size="sm"
        type="button"
        variant="ghost"
      >
        Clear
      </Button>
    </div>
  );
}

export { FilterChips, FilterPopover, FilterRow };
