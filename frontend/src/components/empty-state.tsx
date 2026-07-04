import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  action?: ReactNode;
  className?: string;
  contentClassName?: string;
  description: string;
  icon: LucideIcon;
  title: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  contentClassName,
}: EmptyStateProps) {
  return (
    <Empty
      className={cn("min-h-64 border border-border bg-card", className)}
      data-slot="app-empty-state"
    >
      <EmptyHeader className={contentClassName}>
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
