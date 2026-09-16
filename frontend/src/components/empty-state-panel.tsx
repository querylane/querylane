import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/querylane-ui/empty";
import { cn } from "@/lib/utils";

type EmptyStateHeadingLevel = "div" | "h2" | "h3" | "h4";

interface EmptyStatePanelProps
  extends Omit<React.ComponentProps<"div">, "title"> {
  children?: ReactNode;
  contentWidth?: "default" | "wide";
  description?: ReactNode;
  headingLevel?: EmptyStateHeadingLevel;
  icon?: ComponentType<SVGProps<SVGSVGElement>> | undefined;
  presentation?: "panel" | "panel-compact" | "panel-dashed";
  title?: ReactNode;
}

function EmptyStatePanel({
  children,
  className,
  contentWidth = "default",
  presentation = "panel",
  description,
  headingLevel = "div",
  icon: Icon,
  title,
  ...props
}: EmptyStatePanelProps) {
  const hasStructuredContent = title !== undefined || description !== undefined;
  const TitleComponent = headingLevel;
  const renderedTitle = (() => {
    if (!title) {
      return null;
    }
    if (headingLevel === "div") {
      return <EmptyTitle>{title}</EmptyTitle>;
    }
    return (
      <TitleComponent className="font-semibold text-foreground text-sm">
        {title}
      </TitleComponent>
    );
  })();

  return (
    <Empty
      className={cn("min-h-44", className)}
      data-slot="empty-state-panel"
      presentation={presentation}
      {...props}
    >
      {hasStructuredContent ? (
        <>
          <EmptyHeader width={contentWidth}>
            {Icon ? (
              <span
                className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
                data-testid="empty-state-icon"
              >
                <Icon aria-hidden={true} className="size-5" />
              </span>
            ) : null}
            {renderedTitle}
            {description ? (
              <EmptyDescription>{description}</EmptyDescription>
            ) : null}
          </EmptyHeader>
          {children ? (
            <EmptyContent width={contentWidth}>{children}</EmptyContent>
          ) : null}
        </>
      ) : (
        <EmptyHeader>
          {Icon ? (
            <span
              className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
              data-testid="empty-state-icon"
            >
              <Icon aria-hidden={true} className="size-5" />
            </span>
          ) : null}
          <EmptyDescription>{children}</EmptyDescription>
        </EmptyHeader>
      )}
    </Empty>
  );
}

export { EmptyStatePanel };
