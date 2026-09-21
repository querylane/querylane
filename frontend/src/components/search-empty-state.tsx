import { SearchX } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/querylane-ui/empty";
import { cn } from "@/lib/utils";

interface SearchEmptyStateProps {
  className?: string;
  presentation?:
    | "search"
    | "search-compact"
    | "search-header"
    | "search-bordered"
    | "search-rounded";
  resourceName?: string;
}

function SearchEmptyState({
  className,
  resourceName = "results",
  presentation = "search",
}: SearchEmptyStateProps) {
  return (
    <Empty
      className={cn("min-h-24", className)}
      data-slot="search-empty-state"
      presentation={presentation}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden={true} />
        </EmptyMedia>
        <EmptyTitle>No {resourceName} found</EmptyTitle>
        <EmptyDescription>Try a different search or filter.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export { SearchEmptyState };
