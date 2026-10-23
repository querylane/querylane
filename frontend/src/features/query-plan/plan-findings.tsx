import { Button } from "@/components/querylane-ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/querylane-ui/dropdown-menu";
import {
  type PlanNode,
  planNodeInsights,
  planNodeTitle,
} from "@/features/query-plan/explain-plan-model";

function PlanFindings({
  nodes,
  onSelect,
}: {
  nodes: PlanNode[];
  onSelect: (node: PlanNode) => void;
}) {
  const findings = nodes
    .toSorted((a, b) => (b.exclusiveMs ?? 0) - (a.exclusiveMs ?? 0))
    .flatMap((node) =>
      planNodeInsights(node).map((insight) => ({ node, ...insight }))
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Plan findings"
            disabled={findings.length === 0}
            size="xs"
            type="button"
            variant="outline"
          />
        }
      >
        Findings ({findings.length})
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)]"
        render={(menuProps) => (
          <section aria-label="Plan findings">
            <div {...menuProps} />
          </section>
        )}
      >
        {findings.map(({ node, label }) => (
          <DropdownMenuItem
            aria-label={`${planNodeTitle(node)}: ${label}`}
            closeOnClick={true}
            key={`${node.id}:${label}`}
            onClick={() => {
              onSelect(node);
            }}
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium">{label}</span>
              <span className="text-muted-foreground block max-w-64 truncate text-xs">
                {planNodeTitle(node)}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { PlanFindings };
