import { FilterRow } from "@/components/data-grid/table-data-grid/filter-popover-row";
import { Button } from "@/components/ui/button";
import type {
  TableFilterLogic,
  TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface RulesEditorProps {
  columns: TableResultColumn[];
  invalidMessages: ReadonlyMap<string, string>;
  logic: TableFilterLogic;
  onApplyRequest: () => void;
  onLogicChange: (next: TableFilterLogic) => void;
  onRemoveRule: (index: number) => void;
  onUpdateRule: (index: number, patch: Partial<TableFilterRule>) => void;
  rules: TableFilterRule[];
}

function RulesEditor({
  columns,
  invalidMessages,
  logic,
  onApplyRequest,
  onLogicChange,
  onRemoveRule,
  onUpdateRule,
  rules,
}: RulesEditorProps) {
  if (rules.length === 0) {
    return (
      <p className="px-1 py-0.5 text-muted-foreground text-xs">
        No columns are available to filter.
      </p>
    );
  }
  return (
    // The negative margin + matching padding keep the 3px focus rings of the
    // row controls visible inside this scroll container instead of clipping.
    <ul className="-m-1 flex max-h-[min(48vh,22rem)] flex-col gap-1.5 overflow-auto p-1">
      {rules.map((rule, index) => (
        <li
          className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-1.5"
          key={rule.id}
        >
          {index === 0 ? (
            <span className="pt-2 pr-1 text-right text-muted-foreground text-xs">
              where
            </span>
          ) : (
            <Button
              aria-label="Toggle filter logic"
              className="mt-1 h-6 w-full px-0 font-mono text-[10px]"
              onClick={() => onLogicChange(logic === "and" ? "or" : "and")}
              size="xs"
              type="button"
              variant="outline"
            >
              {logic.toUpperCase()}
            </Button>
          )}
          <FilterRow
            columns={columns}
            invalidMessage={invalidMessages.get(rule.id)}
            onApplyRequest={onApplyRequest}
            onChange={(patch) => onUpdateRule(index, patch)}
            onRemove={() => onRemoveRule(index)}
            rule={rule}
          />
        </li>
      ))}
    </ul>
  );
}

export { RulesEditor };
