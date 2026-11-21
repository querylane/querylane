import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, SearchIcon } from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BaseUiChoiceItem,
  BaseUiChoices,
  BaseUiChoiceTrigger,
} from "@/features/ui-agent/base-ui-adapter";
import { useBaseUiSafety } from "@/features/ui-agent/base-ui-safety-context";
import { cn } from "@/lib/utils";

// The sidebar picker keeps its search inside the popup, unlike the registry's
// input-first combobox. Own that composition here, not in managed UI output.
const ComboboxAgentValueContext = createContext<{
  value: unknown;
  readOnly: boolean;
  multiple: boolean;
}>({ value: null, readOnly: false, multiple: false });
const ComboboxDismissContext = createContext<{
  closeFromOutside: () => void;
  allowFocusReturn: () => boolean;
} | null>(null);
function Combobox<
  Value,
  Multiple extends boolean | undefined = false,
  Item = Value,
>(props: ComboboxPrimitive.Root.Props<Value, Multiple, Item>) {
  const internalActionsRef = useRef<ComboboxPrimitive.Root.Actions | null>(
    null
  );
  const outsideFocusRef = useRef(false);
  const actionsRef = props.actionsRef ?? internalActionsRef;
  const [observedValue, setObservedValue] = useState<unknown>(
    props.defaultValue ?? null
  );
  return (
    <ComboboxDismissContext
      value={{
        closeFromOutside: () => {
          outsideFocusRef.current = true;
          actionsRef.current?.close();
        },
        allowFocusReturn: () => !outsideFocusRef.current,
      }}
    >
      <ComboboxAgentValueContext
        value={{
          value: props.value === undefined ? observedValue : props.value,
          readOnly: props.readOnly === true,
          multiple: props.multiple === true,
        }}
      >
        <BaseUiChoices kind="combobox" markers={props}>
          <ComboboxPrimitive.Root
            autoHighlight={true}
            {...props}
            actionsRef={actionsRef}
            onOpenChange={(open, details) => {
              if (open) {
                outsideFocusRef.current = false;
              }
              props.onOpenChange?.(open, details);
            }}
            onValueChange={(value, details) => {
              props.onValueChange?.(value, details);
              if (!details.isCanceled) {
                setObservedValue(value);
              }
            }}
          />
        </BaseUiChoices>
      </ComboboxAgentValueContext>
    </ComboboxDismissContext>
  );
}

function ComboboxTrigger({
  className,
  presentation,
  ...props
}: ComboboxPrimitive.Trigger.Props & { presentation?: "sidebar" }) {
  const agentValue = useContext(ComboboxAgentValueContext);
  return (
    <BaseUiChoiceTrigger>
      <ComboboxPrimitive.Trigger
        className={cn(
          presentation === "sidebar" &&
            "h-9 w-full justify-start gap-2 rounded-md border-sidebar-border bg-sidebar-accent px-2.5 text-left shadow-sm hover:border-ring hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:border-ring",
          className
        )}
        data-querylane-agent-multiple={agentValue.multiple || undefined}
        data-querylane-agent-readonly={agentValue.readOnly || undefined}
        data-querylane-agent-value={JSON.stringify(agentValue.value)}
        render={<Button type="button" variant="outline" />}
        {...props}
      />
    </BaseUiChoiceTrigger>
  );
}

function ComboboxContent({
  className,
  onBlur,
  finalFocus,
  ...props
}: ComboboxPrimitive.Popup.Props) {
  const safety = useBaseUiSafety(props);
  const dismissal = useContext(ComboboxDismissContext);
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align="start"
        className="z-50"
        sideOffset={4}
      >
        <ComboboxPrimitive.Popup
          className={cn(
            "flex max-h-(--available-height) w-60 max-w-(--available-width) origin-(--transform-origin) flex-col rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
            className
          )}
          {...props}
          {...safety}
          finalFocus={
            finalFocus ?? (() => dismissal?.allowFocusReturn() ?? true)
          }
          onBlur={(event) => {
            onBlur?.(event);
            const next = event.relatedTarget;
            if (
              dismissal &&
              next instanceof HTMLElement &&
              !event.currentTarget.contains(next)
            ) {
              // Input-in-popup Base UI focus management can retain the popup on
              // programmatic focus-out. Close through its public action, without
              // returning focus from the field the person chose.
              dismissal.closeFromOutside();
            }
          }}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <div className="relative shrink-0 p-1 pb-0">
      <ComboboxPrimitive.Input
        className={cn("h-8 pl-8", className)}
        render={<Input />}
        {...props}
      />
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
      />
    </div>
  );
}

function ComboboxItem({
  className,
  children,
  label,
  ...props
}: Omit<ComboboxPrimitive.Item.Props, "value"> & {
  label?: string;
  value?: unknown;
}) {
  return (
    <BaseUiChoiceItem value={props.value}>
      <ComboboxPrimitive.Item
        className={cn(
          "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
          className
        )}
        data-querylane-agent-value={JSON.stringify(props.value)}
        data-querylane-label={label}
        {...props}
      >
        {children}
        <ComboboxPrimitive.ItemIndicator className="absolute right-2">
          <CheckIcon aria-hidden="true" className="size-4" />
        </ComboboxPrimitive.ItemIndicator>
      </ComboboxPrimitive.Item>
    </BaseUiChoiceItem>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      className={cn(
        "max-h-72 min-h-0 scroll-py-1 overflow-y-auto p-1",
        className
      )}
      {...props}
    />
  );
}

function ComboboxEmpty({
  className,
  children,
  ...props
}: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty {...props}>
      {children === null || children === undefined ? null : (
        <div className={cn("py-6 text-center text-sm", className)}>
          {children}
        </div>
      )}
    </ComboboxPrimitive.Empty>
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
};
