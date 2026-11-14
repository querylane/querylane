import { type ComponentProps, type ReactNode, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const DEFAULT_TOOLTIP_CLASS_NAME =
  "max-w-lg whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

function isElementOverflowing(element: HTMLElement) {
  const hasHorizontalOverflow = element.scrollWidth - element.clientWidth > 1;
  const hasVerticalOverflow = element.scrollHeight - element.clientHeight > 1;

  return hasHorizontalOverflow || hasVerticalOverflow;
}

interface OverflowTooltipProps extends ComponentProps<"span"> {
  forceTooltip?: boolean;
  tooltipClassName?: string;
  tooltipContent?: ReactNode;
  tooltipProps?: Omit<
    ComponentProps<typeof TooltipContent>,
    "children" | "className"
  >;
}

function OverflowTooltip({
  children,
  className,
  forceTooltip = false,
  tooltipClassName,
  tooltipContent,
  tooltipProps,
  ...props
}: OverflowTooltipProps) {
  const [isOverflowing, setIsOverflowing] = useState(false);
  function observeOverflow(element: HTMLSpanElement | null) {
    if (!element) {
      return undefined;
    }
    function updateOverflow() {
      if (element) {
        setIsOverflowing(isElementOverflowing(element));
      }
    }
    updateOverflow();
    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }

  const content = tooltipContent ?? children;
  const hasTooltipContent =
    content !== null && content !== undefined && content !== false;
  const trigger = (
    <span className={cn("min-w-0", className)} ref={observeOverflow} {...props}>
      {children}
    </span>
  );

  if (!(hasTooltipContent && (forceTooltip || isOverflowing))) {
    return trigger;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={typeof children === "string" ? children : undefined}
        render={trigger}
      />
      <TooltipContent
        className={cn(DEFAULT_TOOLTIP_CLASS_NAME, tooltipClassName)}
        {...tooltipProps}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export { OverflowTooltip };
