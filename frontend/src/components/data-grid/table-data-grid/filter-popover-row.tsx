import { X } from "lucide-react";
import { useEffect, useEffectEvent, useId, useState } from "react";
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
  invalidMessage?: string | undefined;
  onApplyRequest: () => void;
  onChange: (patch: Partial<TableFilterRule>) => void;
  onRemove: () => void;
  rule: TableFilterRule;
}

// Matches the sidebar search debounce so value edits commit one rule change
// (one server query + one history entry) per typing pause, not per keystroke.
const FILTER_VALUE_DEBOUNCE_MS = 200;

const DATA_TYPE_PLACEHOLDERS: Partial<Record<DataType, string>> = {
  [DataType.DATE]: "2026-05-01",
  [DataType.FLOAT]: "100",
  [DataType.INTEGER]: "100",
  [DataType.JSON]: '{"tier":"enterprise"}',
  [DataType.TIME]: "13:30:00",
  [DataType.TIMESTAMP]: "2026-05-01 13:30",
  [DataType.UUID]: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
};

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
  if (rule.operator === "match" || rule.operator === "imatch") {
    return "^support@";
  }
  if (rule.operator === "jsonContains") {
    return '{"tier":"enterprise"}';
  }
  const typePlaceholder = column
    ? DATA_TYPE_PLACEHOLDERS[column.dataType]
    : undefined;
  return typePlaceholder ?? "Value";
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

function BooleanValueSelect({
  onChange,
  value,
}: {
  onChange: (next: string) => void;
  value: string;
}) {
  return (
    <Select
      onValueChange={(next) => {
        if (next) {
          onChange(next);
        }
      }}
      value={value}
    >
      <SelectTrigger
        aria-label="Filter value"
        className="@lg/filter-popover:col-start-auto col-start-1 w-full"
        size="sm"
      >
        <SelectValue placeholder="Select value" />
      </SelectTrigger>
      <SelectContent>
        {["true", "false"].map((candidate) => (
          <SelectItem key={candidate} label={candidate} value={candidate}>
            <span className="font-mono text-xs">{candidate}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterRow({
  columns,
  invalidMessage,
  onApplyRequest,
  onChange,
  onRemove,
  rule,
}: FilterRowProps) {
  const messageId = useId();
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
  const invalidInputProps = invalidMessage
    ? ({ "aria-describedby": messageId, "aria-invalid": true } as const)
    : {};

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

  function commitValueDraft() {
    if (draftValue !== rule.value) {
      onChange({ value: draftValue });
    }
  }

  function commitValue2Draft() {
    if (draftValue2 !== (rule.value2 ?? "")) {
      onChange({ value2: draftValue2 });
    }
  }

  function applyOnEnter(
    event: React.KeyboardEvent<HTMLInputElement>,
    commitDraft: () => void
  ) {
    if (event.key !== "Enter") {
      return;
    }
    // Commit the local draft ahead of the debounce so the apply that follows
    // sees the freshly typed value instead of the last committed one.
    commitDraft();
    onApplyRequest();
  }

  function renderValueEditor() {
    if (operatorMeta.valueCount === 0) {
      return (
        <div className="@lg/filter-popover:col-start-auto col-start-1 flex h-8 items-center rounded-md border border-dashed px-2 text-muted-foreground text-xs">
          No value needed
        </div>
      );
    }
    if (
      column?.dataType === DataType.BOOLEAN &&
      operatorMeta.valueCount === 1
    ) {
      return (
        <BooleanValueSelect
          onChange={(next) => onChange({ value: next })}
          value={rule.value}
        />
      );
    }
    return (
      <div
        className="@lg/filter-popover:col-start-auto col-start-1 grid min-w-0 grid-cols-1 gap-1.5 data-[range=true]:grid-cols-2"
        data-range={operatorMeta.valueCount === 2}
      >
        <Input
          aria-label="Filter value"
          className="h-8 min-w-0 font-mono"
          onBlur={commitValueDraft}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => applyOnEnter(event, commitValueDraft)}
          placeholder={getValuePlaceholder(rule, column)}
          value={draftValue}
          {...invalidInputProps}
        />
        {operatorMeta.valueCount === 2 ? (
          <Input
            aria-label="Filter end value"
            className="h-8 min-w-0 font-mono"
            onBlur={commitValue2Draft}
            onChange={(event) => setDraftValue2(event.target.value)}
            onKeyDown={(event) => applyOnEnter(event, commitValue2Draft)}
            placeholder="And"
            value={draftValue2}
            {...invalidInputProps}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="grid @lg/filter-popover:grid-cols-[minmax(9rem,1.3fr)_10rem_minmax(7.5rem,1fr)_2rem] grid-cols-[minmax(0,1fr)_2rem] items-center gap-1.5">
        <Select onValueChange={changeColumn} value={rule.column}>
          <SelectTrigger
            aria-label="Filter column"
            className="@lg/filter-popover:col-span-1 col-span-2 w-full font-mono"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="min-w-72">
            {columns.map((candidate) => (
              <SelectItem
                key={candidate.columnName}
                label={candidate.columnName}
                value={candidate.columnName}
              >
                <span className="flex w-full min-w-0 items-center justify-between gap-3">
                  <span
                    className="min-w-0 truncate font-mono text-xs"
                    title={candidate.columnName}
                  >
                    {candidate.columnName}
                  </span>
                  <span className="max-w-[45%] shrink-0 truncate font-mono text-muted-foreground text-xs uppercase">
                    {candidate.rawType}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="@lg/filter-popover:col-span-1 col-span-2 flex min-w-0 items-center gap-1">
          <Button
            aria-label="Negate filter"
            aria-pressed={rule.negated ?? false}
            className="h-8 px-2 text-xs"
            onClick={() => onChange({ negated: !rule.negated })}
            type="button"
            variant={rule.negated ? "secondary" : "outline"}
          >
            Not
          </Button>
          <Select
            items={operatorItems}
            onValueChange={changeOperator}
            value={rule.operator}
          >
            <SelectTrigger
              aria-label="Filter operator"
              className="min-w-0 flex-1"
              size="sm"
            >
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
        </div>

        {renderValueEditor()}

        <Button
          aria-label="Remove filter"
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      {invalidMessage ? (
        <p className="pl-1 text-destructive text-xs" id={messageId}>
          {invalidMessage}
        </p>
      ) : null}
    </div>
  );
}

export { FilterRow };
