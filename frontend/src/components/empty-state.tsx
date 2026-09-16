import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/querylane-ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  description: string;
  icon: LucideIcon;
  presentation?: "page" | "chart";
  title: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  presentation = "page",
}: EmptyStateProps) {
  return (
    <Empty
      className={cn("min-h-64", className)}
      data-slot="app-empty-state"
      presentation={presentation}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <h2 className="font-medium text-lg tracking-tight">{title}</h2>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
