import { Plus } from "lucide-react";
import { FilterRow } from "@/components/data-grid/table-data-grid/filter-popover-row";
import { Button } from "@/components/ui/button";
import type {
  TableFilterLogic,
  TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";
import type { TableResultColumn } from "@/protogen/querylane/console/v1alpha1/table_data_pb";

interface RulesEditorProps {
  canAdd: boolean;
  columns: TableResultColumn[];
  logic: TableFilterLogic;
  onAddRule: () => void;
  onLogicChange: (next: TableFilterLogic) => void;
  onRemoveRule: (index: number) => void;
  onUpdateRule: (index: number, patch: Partial<TableFilterRule>) => void;
  rules: TableFilterRule[];
}

function RulesEditor({
  canAdd,
  columns,
  logic,
  onAddRule,
  onLogicChange,
  onRemoveRule,
  onUpdateRule,
  rules,
}: RulesEditorProps) {
  return (
    <div className="flex flex-col gap-2">
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {"No columns are available to filter."}
        </p>
      ) : (
        <ul className="flex max-h-[min(48vh,22rem)] flex-col gap-2 overflow-auto">
          {rules.map((rule, index) => (
            <li
              className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2"
              key={rule.id}
            >
              {index === 0 ? (
                <span className="text-right text-muted-foreground text-xs">
                  {"where"}
                </span>
              ) : (
                <Button
                  aria-label="Toggle filter logic"
                  className="ml-auto h-6 px-1.5 font-mono text-[10px]"
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
                onChange={(patch) => onUpdateRule(index, patch)}
                onRemove={() => onRemoveRule(index)}
                rule={rule}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="pl-[3.75rem]">
        <Button
          aria-label="Add filter"
          className="h-8 px-2"
          disabled={!canAdd}
          onClick={onAddRule}
          size="xs"
          type="button"
          variant="ghost"
        >
          <Plus data-icon="inline-start" />
          {"Add rule"}
        </Button>
      </div>
    </div>
  );
}

export { RulesEditor };
