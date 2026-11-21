import { Select as SelectPrimitive } from "@base-ui/react/select";
import type { ChangeDetails } from "@ui-sdk/core";
import { cn } from "cn";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";
import { createContext, useContext, useState } from "react";
import {
  BaseUiChoiceItem,
  BaseUiChoices,
  BaseUiChoiceTrigger,
} from "@/features/ui-agent/base-ui-adapter";
import {
  useBaseUiModal,
  useBaseUiSafety,
} from "@/features/ui-agent/base-ui-safety-context";
import { dispatchBaseUiChange } from "@/lib/base-ui-change";

const SelectAgentValueContext = createContext<{
  value: unknown;
  readOnly: boolean;
  multiple: boolean;
}>({
  value: null,
  readOnly: false,
  multiple: false,
});
type Selected<
  Value,
  Multiple extends boolean | undefined,
> = Multiple extends true ? Value[] : Value;
function Select<Value, Multiple extends boolean | undefined = false>({
  onValueChange,
  ...props
}: Omit<SelectPrimitive.Root.Props<Value, Multiple>, "onValueChange"> & {
  onValueChange?:
    | ((
        value: Selected<Value, Multiple> | null,
        details: ChangeDetails<"item-press">
      ) => void)
    | undefined;
}) {
  const [observedValue, setObservedValue] = useState<unknown>(
    props.defaultValue ?? null
  );
  return (
    <BaseUiChoices kind="select" markers={props}>
      <SelectAgentValueContext
        value={{
          value: props.value === undefined ? observedValue : props.value,
          readOnly: props.readOnly === true,
          multiple: props.multiple === true,
        }}
      >
        <SelectPrimitive.Root
          {...props}
          onValueChange={(value, details) => {
            dispatchBaseUiChange(onValueChange, value, {
              ...details,
              reason: "item-press",
            });
            if (!details.isCanceled) {
              setObservedValue(value);
            }
          }}
        />
      </SelectAgentValueContext>
    </BaseUiChoices>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      className={cn("scroll-my-1 p-1", className)}
      data-querylane-slot="select-group"
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      className={cn("flex flex-1 text-left", className)}
      data-querylane-slot="select-value"
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  const agentValue = useContext(SelectAgentValueContext);
  return (
    <BaseUiChoiceTrigger>
      <SelectPrimitive.Trigger
        className={cn(
          "flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground *:data-[querylane-slot=select-value]:line-clamp-1 *:data-[querylane-slot=select-value]:flex *:data-[querylane-slot=select-value]:items-center *:data-[querylane-slot=select-value]:gap-1.5 data-[size=default]:h-9 data-[size=sm]:h-8 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          className
        )}
        data-querylane-agent-multiple={agentValue.multiple || undefined}
        data-querylane-agent-readonly={agentValue.readOnly || undefined}
        data-querylane-agent-value={JSON.stringify(agentValue.value)}
        data-querylane-slot="select-trigger"
        data-size={size}
        {...props}
      >
        {children}
        <SelectPrimitive.Icon
          render={
            <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
          }
        />
      </SelectPrimitive.Trigger>
    </BaseUiChoiceTrigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  // Deliberate registry drift: Base UI defaults to macOS-style item
  // alignment where the popup covers the trigger. Default to the classic
  // shadcn popper placement below the trigger instead.
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  const modal = useBaseUiModal();
  const safety = useBaseUiSafety(props);
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          data-align-trigger={alignItemWithTrigger}
          data-querylane-modal={modal ? "" : undefined}
          data-querylane-slot="select-content"
          {...props}
          {...safety}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      data-querylane-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: Omit<SelectPrimitive.Item.Props, "value"> & { value?: unknown }) {
  return (
    <BaseUiChoiceItem value={props.value}>
      <SelectPrimitive.Item
        className={cn(
          "relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
          className
        )}
        data-querylane-agent-value={JSON.stringify(props.value)}
        data-querylane-slot="select-item"
        {...props}
      >
        {/* Deliberate registry drift: allow the item text to shrink so children
          can opt into truncation (e.g. long column identifiers). */}
        <SelectPrimitive.ItemText
          className="flex min-w-0 flex-1 gap-2 whitespace-nowrap"
          data-querylane-slot="select-item-text"
        >
          {children}
        </SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator
          render={
            <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
          }
        >
          <CheckIcon className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    </BaseUiChoiceItem>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      data-querylane-slot="select-separator"
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-querylane-slot="select-scroll-up-button"
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      data-querylane-slot="select-scroll-down-button"
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
