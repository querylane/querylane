import { Funnel, Plus } from "lucide-react";
import { useEffect, useEffectEvent, useReducer } from "react";
import { DataGridPopoverContent } from "@/components/data-grid/table-data-grid/data-grid-popover-content";
import { RulesEditor } from "@/components/data-grid/table-data-grid/filter-popover-rules-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  createFilterRule,
  getInvalidFilterRules,
  isFilterLogic,
  isIncompleteFilterRule,
  MAX_FILTER_RULES,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

const DEFAULT_FILTER_LOGIC: TableFilterLogic = "and";

interface FilterPopoverProps {
  columns: TableResultColumn[];
  logic: TableFilterLogic;
  onChange: (nextRules: TableFilterRule[], nextLogic: TableFilterLogic) => void;
  popoverBoundary?: HTMLElement | null | undefined;
  rules: TableFilterRule[];
  title?: string | undefined;
}

interface FilterPopoverState {
  applyRequested: boolean;
  draftLogic: TableFilterLogic;
  draftRules: TableFilterRule[];
  open: boolean;
}

function mergeFilterPopoverState(
  state: FilterPopoverState,
  patch: Partial<FilterPopoverState>
): FilterPopoverState {
  return { ...state, ...patch };
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
    applyRequested: false,
    draftLogic: DEFAULT_FILTER_LOGIC,
    draftRules: rules,
    open: false,
  });
  const { applyRequested, draftLogic, draftRules, open } = state;
  const selectedLogic = isFilterLogic(logic) ? logic : DEFAULT_FILTER_LOGIC;
  const canAdd = columns.length > 0 && draftRules.length < MAX_FILTER_RULES;
  // Validated live against the committed drafts (which trail typing by the
  // row debounce) so guidance appears as values settle, not per keystroke.
  const invalidMessages = new Map(
    getInvalidFilterRules(draftRules, columns).map((rule) => [
      rule.id,
      rule.message,
    ])
  );

  function resetDraftsFromCommitted() {
    const firstColumn = columns[0]?.columnName;
    updateState({
      draftLogic: selectedLogic,
      draftRules:
        rules.length > 0 || !firstColumn
          ? rules
          : [createFilterRule(firstColumn)],
      open: true,
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
    updateState({ draftRules: next });
  }

  function removeAt(index: number) {
    const next = draftRules.slice();
    next.splice(index, 1);
    updateState({ draftRules: next });
  }

  function addRule() {
    const firstColumn = columns[0]?.columnName;
    if (!firstColumn) {
      return;
    }
    updateState({
      draftRules: [...draftRules, createFilterRule(firstColumn)],
    });
  }

  function clearFilters() {
    const firstColumn = columns[0]?.columnName;
    updateState({
      draftLogic: DEFAULT_FILTER_LOGIC,
      draftRules: firstColumn ? [createFilterRule(firstColumn)] : [],
    });
    onChange([], DEFAULT_FILTER_LOGIC);
  }

  function applyRules() {
    // Freshly added rows that never got a value are dropped, but a committed
    // rule whose value was emptied mid-edit is kept (it contributes no
    // predicate until refilled) instead of being silently deleted.
    const committedIds = new Set(rules.map((rule) => rule.id));
    const nextRules = draftRules.filter(
      (rule) => !isIncompleteFilterRule(rule) || committedIds.has(rule.id)
    );
    // Inline row messages already explain the problem; keep the popover open
    // until every complete rule parses.
    if (getInvalidFilterRules(nextRules, columns).length > 0) {
      return;
    }
    onChange(nextRules, draftLogic);
    updateState({ open: false });
  }

  // Apply runs one render after it is requested so that row value drafts
  // committed in the same event (Enter in a value input) are visible here.
  const runRequestedApply = useEffectEvent(applyRules);
  useEffect(
    function applyAfterDraftCommit() {
      if (!applyRequested) {
        return;
      }
      updateState({ applyRequested: false });
      runRequestedApply();
    },
    [applyRequested]
  );

  function requestApply() {
    updateState({ applyRequested: true });
  }

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
        className="w-[min(36rem,var(--available-width))] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        collisionBoundary={popoverBoundary ?? undefined}
      >
        <div className="p-2">
          <RulesEditor
            columns={columns}
            invalidMessages={invalidMessages}
            logic={draftLogic}
            onApplyRequest={requestApply}
            onLogicChange={(next) => updateState({ draftLogic: next })}
            onRemoveRule={removeAt}
            onUpdateRule={updateAt}
            rules={draftRules}
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
          <Button
            aria-label="Add filter"
            disabled={!canAdd}
            onClick={addRule}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus data-icon="inline-start" />
            Add rule
          </Button>
          <div className="flex items-center gap-1.5">
            {rules.length > 0 ? (
              <Button
                onClick={clearFilters}
                size="sm"
                type="button"
                variant="ghost"
              >
                Clear
              </Button>
            ) : null}
            <Button onClick={requestApply} size="sm" type="button">
              Apply
            </Button>
          </div>
        </div>
      </DataGridPopoverContent>
    </Popover>
  );
}

export { FilterPopover };
