import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Tabs as BaseTabs,
  TabsContent as BaseTabsContent,
  TabsList as BaseTabsList,
  TabsTrigger as BaseTabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const tabsPresentations = cva("", {
  variants: {
    presentation: {
      flush: "gap-0",
    },
  },
});

function Tabs({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTabs> & VariantProps<typeof tabsPresentations>) {
  return (
    <BaseTabs
      className={cn(tabsPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tabsContentPresentations = cva("", {
  variants: {
    presentation: {
      inspector: "p-3 sm:p-4",
      "onboarding-form": "space-y-4 pt-1",
      onboarding: "pt-1",
      metrics: "pb-6",
      "object-fill": "min-h-0 flex-1 overflow-y-auto",
      "object-padded": "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6",
    },
  },
});

function TabsContent({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTabsContent> &
  VariantProps<typeof tabsContentPresentations>) {
  return (
    <BaseTabsContent
      className={cn(tabsContentPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tabsListPresentations = cva("", {
  variants: {
    presentation: {
      flush: "gap-0 p-0",
      "sql-results": "bg-transparent p-0",
      "sql-workbench": "h-full justify-start rounded-none bg-transparent p-0",
      metrics:
        "divide-border border-border divide-x divide-y rounded-none border-b bg-transparent p-0 sm:divide-y-0",
    },
  },
});

function TabsList({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTabsList> &
  VariantProps<typeof tabsListPresentations>) {
  return (
    <BaseTabsList
      className={cn(tabsListPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tabsTriggerPresentations = cva("", {
  variants: {
    presentation: {
      inspector: "px-3",
      truncated: "truncate",
      "sql-workbench":
        "border-border data-active:bg-background dark:data-active:bg-background h-auto max-w-56 flex-none gap-1.5 rounded-none border-0 border-r px-3 py-2 text-xs group-data-[variant=default]/tabs-list:data-active:shadow-none",
      "sql-compact": "gap-1.5 px-2.5 text-xs",
      "sql-plan-mode": "px-2 text-xs",
      metric:
        "before:bg-primary hover:bg-muted/50 gap-1.5 rounded-none border-0 px-4 py-3 before:opacity-0 data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:shadow-none data-active:before:opacity-100 dark:data-active:bg-transparent",
    },
  },
});

function TabsTrigger({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTabsTrigger> &
  VariantProps<typeof tabsTriggerPresentations>) {
  return (
    <BaseTabsTrigger
      className={cn(tabsTriggerPresentations({ presentation }), className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
