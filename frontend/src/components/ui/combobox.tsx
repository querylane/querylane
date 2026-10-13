import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Combobox<
  Value,
  Multiple extends boolean | undefined = false,
  Item = Value,
>(props: ComboboxPrimitive.Root.Props<Value, Multiple, Item>) {
  return <ComboboxPrimitive.Root {...props} />;
}

function ComboboxTrigger({
  className,
  presentation,
  ...props
}: ComboboxPrimitive.Trigger.Props & { presentation?: "sidebar" }) {
  return (
    <ComboboxPrimitive.Trigger
      className={cn(
        presentation === "sidebar" &&
          "h-9 w-full justify-start gap-2 rounded-md border-sidebar-border bg-sidebar-accent px-2.5 text-left shadow-sm hover:border-ring hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:border-ring",
        className
      )}
      render={<Button type="button" variant="outline" />}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  ...props
}: ComboboxPrimitive.Popup.Props) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        align="start"
        className="z-50"
        sideOffset={4}
      >
        <ComboboxPrimitive.Popup
          className={cn(
            "flex max-h-(--available-height) w-60 max-w-(--available-width) origin-(--transform-origin) flex-col rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none",
            className
          )}
          {...props}
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
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden data-highlighted:bg-muted data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator className="absolute right-2">
        <CheckIcon aria-hidden="true" className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      className={cn(
        "min-h-0 max-h-72 scroll-py-1 overflow-y-auto p-1",
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
      {children == null ? null : (
        <div className={cn("py-6 text-center text-sm", className)}>
          {children}
        </div>
      )}
    </ComboboxPrimitive.Empty>
  );
}

const createComboboxItems = ComboboxPrimitive.createItems;

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  createComboboxItems,
};
