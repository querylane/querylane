import {
  TabsList as TabsPrimitiveList,
  TabsPanel as TabsPrimitivePanel,
  Tabs as TabsPrimitiveRoot,
  TabsTab as TabsPrimitiveTab,
} from "@ui-sdk/react/tabs";
import type { VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type * as React from "react";
import { tabsListVariants } from "./tabs-variants";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitiveRoot>) {
  return (
    <TabsPrimitiveRoot
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      data-querylane-slot="tabs"
      orientation={orientation}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitiveList> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitiveList
      className={cn(tabsListVariants({ variant }), className)}
      data-querylane-slot="tabs-list"
      data-variant={variant}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitiveTab>) {
  return (
    <TabsPrimitiveTab
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-selected:shadow-sm group-data-[variant=line]/tabs-list:data-selected:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-selected:bg-transparent dark:group-data-[variant=line]/tabs-list:data-selected:border-transparent dark:group-data-[variant=line]/tabs-list:data-selected:bg-transparent",
        "data-selected:bg-background data-selected:text-foreground dark:data-selected:border-input dark:data-selected:bg-input/30 dark:data-selected:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-selected:after:opacity-100",
        className
      )}
      data-querylane-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitivePanel>) {
  return (
    <TabsPrimitivePanel
      className={cn("flex-1 text-sm outline-none", className)}
      data-querylane-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
