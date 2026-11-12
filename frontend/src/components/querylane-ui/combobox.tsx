import {
  ComboboxEmpty as ComboboxPrimitiveEmpty,
  ComboboxInput as ComboboxPrimitiveInput,
  ComboboxItem as ComboboxPrimitiveItem,
  ComboboxItemIndicator as ComboboxPrimitiveItemIndicator,
  ComboboxList as ComboboxPrimitiveList,
  ComboboxContent as ComboboxPrimitivePopup,
  Combobox as ComboboxPrimitiveRoot,
  ComboboxTrigger as ComboboxPrimitiveTrigger,
} from "@ui-sdk/react/combobox";
import { CheckIcon, SearchIcon } from "lucide-react";
import type * as React from "react";
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

// The sidebar composition follows UI SDK's input-in-popup combobox pattern.
const PopupAnchorContext = createContext<{
  button: HTMLButtonElement | null;
  setButton: React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>;
} | null>(null);

function Combobox({
  onOpenChange,
  onOpenChangeComplete,
  onQueryChange,
  query,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitiveRoot<string, false>>) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [localQuery, setQuery] = useState("");
  return (
    <PopupAnchorContext value={{ button, setButton }}>
      <ComboboxPrimitiveRoot
        autoHighlight={true}
        {...props}
        onOpenChange={(open, details) => {
          if (open) {
            setQuery("");
          }
          onOpenChange?.(open, details);
        }}
        onOpenChangeComplete={(open) => {
          if (!open) {
            button?.focus();
          }
          onOpenChangeComplete?.(open);
        }}
        onQueryChange={(next, details) => {
          setQuery(next);
          onQueryChange?.(next, details);
        }}
        query={query ?? localQuery}
      />
    </PopupAnchorContext>
  );
}

function ComboboxTrigger({
  className,
  presentation,
  ...props
}: Omit<React.ComponentProps<typeof ComboboxPrimitiveTrigger>, "ref"> & {
  presentation?: "sidebar";
}) {
  const anchor = useContext(PopupAnchorContext);
  return (
    <ComboboxPrimitiveTrigger
      aria-haspopup="listbox"
      className={cn(
        presentation === "sidebar" &&
          "h-9 w-full justify-start gap-2 rounded-md border-sidebar-border bg-sidebar-accent px-2.5 text-left shadow-sm hover:border-ring hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-open:border-ring",
        className
      )}
      ref={anchor?.setButton}
      render={<Button type="button" variant="outline" />}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitivePopup>) {
  const anchor = useContext(PopupAnchorContext);
  return (
    <ComboboxPrimitivePopup
      align="start"
      anchor={anchor?.button ?? null}
      className={cn(
        "flex max-h-(--available-height) w-60 max-w-(--available-width) origin-(--transform-origin) flex-col rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
        className
      )}
      sideOffset={4}
      {...props}
    />
  );
}

function ComboboxInput({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitiveInput>) {
  return (
    <div className="relative shrink-0 p-1 pb-0">
      <ComboboxPrimitiveInput
        autoFocus={true}
        className={cn(
          "h-8 w-full rounded-md border border-input bg-transparent pr-2 pl-8 text-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
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
}: Omit<React.ComponentProps<typeof ComboboxPrimitiveItem>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <ComboboxPrimitiveItem
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitiveItemIndicator className="absolute right-2">
        <CheckIcon aria-hidden="true" className="size-4" />
      </ComboboxPrimitiveItemIndicator>
    </ComboboxPrimitiveItem>
  );
}

function ComboboxList({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPrimitiveList>) {
  return (
    <ComboboxPrimitiveList
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
}: Omit<React.ComponentProps<typeof ComboboxPrimitiveEmpty>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <ComboboxPrimitiveEmpty {...props}>
      {children === null || children === undefined ? null : (
        <div className={cn("py-6 text-center text-sm", className)}>
          {children}
        </div>
      )}
    </ComboboxPrimitiveEmpty>
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
