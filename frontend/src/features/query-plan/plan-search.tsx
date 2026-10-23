import { useState } from "react";
import { Button } from "@/components/querylane-ui/button";
import { Input } from "@/components/querylane-ui/input";
import {
  type PlanNode,
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";
import { PlanFindings } from "@/features/query-plan/plan-findings";

function PlanSearch({
  nodes,
  onSelect,
}: {
  nodes: PlanNode[];
  onSelect: (node: PlanNode) => void;
}) {
  const [query, setQuery] = useState("");
  const term = query.trim().toLocaleLowerCase();
  const matches = term
    ? nodes.filter((node) =>
        planNodeTitle(node).toLocaleLowerCase().includes(term)
      )
    : [];
  return (
    <div className="border-b px-4 py-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Search plan operators"
          className="h-7"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search operators, relations or indexes"
          presentation="compact"
          type="search"
          value={query}
        />
        <PlanFindings nodes={nodes} onSelect={onSelect} />
      </div>
      {term && matches.length > 0 ? (
        <ul
          aria-label="Matching operators"
          className="mt-2 max-h-40 overflow-auto"
        >
          {matches.map((node) => (
            <li key={node.id}>
              <Button
                aria-label={`Inspect ${planNodeTitle(node)}`}
                className="h-auto max-w-full"
                onClick={() => {
                  onSelect(node);
                }}
                presentation="sql-plan-node"
                type="button"
                variant="ghost"
              >
                <span className="truncate">{planNodeTitle(node)}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {term && matches.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs" role="status">
          No matching operators.
        </p>
      ) : null}
    </div>
  );
}

export { PlanSearch };
