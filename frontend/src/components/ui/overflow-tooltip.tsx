"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const DEFAULT_TOOLTIP_CLASS_NAME =
  "max-w-lg whitespace-pre-wrap break-words [overflow-wrap:anywhere]"

function isElementOverflowing(element: HTMLElement) {
  const hasHorizontalOverflow = element.scrollWidth - element.clientWidth > 1
  const hasVerticalOverflow = element.scrollHeight - element.clientHeight > 1

  return hasHorizontalOverflow || hasVerticalOverflow
}

interface OverflowTooltipProps extends React.ComponentProps<"span"> {
  forceTooltip?: boolean
  tooltipClassName?: string
  tooltipContent?: React.ReactNode
  tooltipProps?: Omit<
    React.ComponentProps<typeof TooltipContent>,
    "children" | "className"
  >
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
  const elementRef = React.useRef<HTMLSpanElement | null>(null)
  const [isOverflowing, setIsOverflowing] = React.useState(forceTooltip)

  React.useEffect(() => {
    const element = elementRef.current

    if (!element) {
      setIsOverflowing(forceTooltip)
      return
    }

    setIsOverflowing(forceTooltip || isElementOverflowing(element))
  }, [children, className, forceTooltip])

  React.useEffect(() => {
    const element = elementRef.current

    if (!element || typeof ResizeObserver === "undefined") {
      return undefined
    }

    const observer = new ResizeObserver(() => {
      setIsOverflowing(forceTooltip || isElementOverflowing(element))
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [forceTooltip])

  const content = tooltipContent ?? children
  const hasTooltipContent =
    content !== null && content !== undefined && content !== false
  const trigger = (
    <span
      ref={elementRef}
      className={cn("min-w-0", className)}
      {...props}
    >
      {children}
    </span>
  )

  if (!hasTooltipContent || !isOverflowing) {
    return trigger
  }

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent
        className={cn(DEFAULT_TOOLTIP_CLASS_NAME, tooltipClassName)}
        {...tooltipProps}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

export { OverflowTooltip }
