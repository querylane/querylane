import { X } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildFilterLabel,
  type TableFilterLogic,
  type TableFilterRule,
} from "@/features/data-explorer/table-data/filter-state";

interface FilterChipsProps {
  logic: TableFilterLogic;
  onChange: (next: TableFilterRule[]) => void;
  rules: TableFilterRule[];
}

function FilterChips({ logic, onChange, rules }: FilterChipsProps) {
  if (rules.length === 0) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {rules.map((rule, index) => (
        <Fragment key={rule.id}>
          {index > 0 ? (
            <Badge className="font-mono text-xs" variant="outline">
              {(rule.logic ?? logic).toUpperCase()}
            </Badge>
          ) : null}
          <Badge
            className="gap-1 truncate font-mono text-xs"
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
        </Fragment>
      ))}
      <Button
        className="h-5 px-1.5 text-xs"
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

export { FilterChips };
