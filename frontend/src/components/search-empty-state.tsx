import { SearchX } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface SearchEmptyStateProps {
  className?: string;
  resourceName?: string;
}

function SearchEmptyState({
  className,
  resourceName = "results",
}: SearchEmptyStateProps) {
  return (
    <Empty
      className={cn("min-h-24 rounded-md border-0 px-4 py-8", className)}
      data-slot="search-empty-state"
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
