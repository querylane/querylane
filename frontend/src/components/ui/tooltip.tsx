import {
  TooltipArrow as TooltipPrimitiveArrow,
  TooltipContent as TooltipPrimitivePopup,
  Tooltip as TooltipPrimitiveRoot,
  TooltipTrigger as TooltipPrimitiveTrigger,
} from "@ui-sdk/react/tooltip";
import { cn } from "cn";
import { type ComponentProps, isValidElement, type ReactNode } from "react";
import { isNonEmptyString, isRecord, isUnknownArray } from "@/lib/value-guards";

function tooltipText(value: unknown): string {
  const pending: unknown[] = [value];
  const text: string[] = [];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === "string" || typeof next === "number") {
      text.push(String(next));
      continue;
    }
    if (isUnknownArray(next)) {
      pending.push(...next.toReversed());
      continue;
    }
    if (
      isValidElement(next) &&
      isRecord(next.props) &&
      next.props["aria-hidden"] !== true
    ) {
      pending.push(next.props["children"]);
    }
  }
  return text.join("");
}

function Tooltip({ ...props }: ComponentProps<typeof TooltipPrimitiveRoot>) {
  return (
    <TooltipPrimitiveRoot data-querylane-slot="tooltip" delay={0} {...props} />
  );
}

function TooltipTrigger({
  ...props
}: ComponentProps<typeof TooltipPrimitiveTrigger>) {
  const renderProps =
    isValidElement(props.render) && isRecord(props.render.props)
      ? props.render.props
      : {};
  const name = [
    props["aria-label"],
    renderProps["aria-label"],
    tooltipText(props.children),
    tooltipText(renderProps["children"]),
  ].find((value) => isNonEmptyString(value));
  return (
    <TooltipPrimitiveTrigger
      data-querylane-slot="tooltip-trigger"
      {...props}
      {...(typeof name === "string" ? { "aria-label": name } : {})}
    />
  );
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: Omit<ComponentProps<typeof TooltipPrimitivePopup>, "children"> & {
  children?: ReactNode;
}) {
  return (
    <TooltipPrimitivePopup
      align={align}
      alignOffset={alignOffset}
      className={cn(
        "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[querylane-slot=kbd]:pr-1.5 **:data-[querylane-slot=kbd]:relative **:data-[querylane-slot=kbd]:isolate **:data-[querylane-slot=kbd]:z-50 **:data-[querylane-slot=kbd]:rounded-sm data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      data-querylane-slot="tooltip-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      {children}
      <TooltipPrimitiveArrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-xs bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
    </TooltipPrimitivePopup>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
