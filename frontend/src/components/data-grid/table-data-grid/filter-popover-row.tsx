import { X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { SelectValue } from "@/components/select-extensions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  FILTER_OPERATOR_META,
  getOperatorsForColumn,
  isFilterOperator,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";
import { DataType } from "@/protogen/querylane/console/v1alpha1/table_pb";

interface FilterRowProps {
  columns: TableResultColumn[];
  onChange: (patch: Partial<TableFilterRule>) => void;
  onRemove: () => void;
  rule: TableFilterRule;
}

// Matches the sidebar search debounce so value edits commit one rule change
// (one server query + one history entry) per typing pause, not per keystroke.
const FILTER_VALUE_DEBOUNCE_MS = 200;

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

function useDebouncedRuleValue(
  committedValue: string,
  commit: (next: string) => void,
  resetKey: string
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(committedValue);
  const commitDraft = useEffectEvent(commit);
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
        commitDraft(draft);
      }, FILTER_VALUE_DEBOUNCE_MS);
      return () => window.clearTimeout(timeoutId);
    },
    [committedValue, draft]
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
    <div className="grid grid-cols-[minmax(8rem,1.05fr)_112px_minmax(10rem,1.35fr)_1.75rem] items-center gap-1.5">
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
    </div>
  );
}

export { FilterRow };
