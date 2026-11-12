import {
  AccordionHeader as AccordionPrimitiveHeader,
  AccordionItem as AccordionPrimitiveItem,
  AccordionPanel as AccordionPrimitivePanel,
  Accordion as AccordionPrimitiveRoot,
  AccordionTrigger as AccordionPrimitiveTrigger,
} from "@ui-sdk/react/accordion";
import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type * as React from "react";

function Accordion({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitiveRoot>) {
  return (
    <AccordionPrimitiveRoot
      className={cn("flex w-full flex-col", className)}
      data-querylane-slot="accordion"
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitiveItem>) {
  return (
    <AccordionPrimitiveItem
      className={cn("not-last:border-b", className)}
      data-querylane-slot="accordion-item"
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitiveTrigger>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <AccordionPrimitiveHeader className="flex">
      <AccordionPrimitiveTrigger
        className={cn(
          "group/accordion-trigger relative flex flex-1 items-start justify-between rounded-md border border-transparent py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[querylane-slot=accordion-trigger-icon]:ml-auto **:data-[querylane-slot=accordion-trigger-icon]:size-4 **:data-[querylane-slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        data-querylane-slot="accordion-trigger"
        {...props}
      >
        {children}
        <ChevronDownIcon
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
          data-querylane-slot="accordion-trigger-icon"
        />
        <ChevronUpIcon
          className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
          data-querylane-slot="accordion-trigger-icon"
        />
      </AccordionPrimitiveTrigger>
    </AccordionPrimitiveHeader>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AccordionPrimitivePanel>, "children"> & {
  children?: React.ReactNode;
}) {
  return (
    <AccordionPrimitivePanel
      className="h-(--accordion-panel-height) overflow-hidden text-sm transition-all duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
      data-querylane-slot="accordion-content"
      {...props}
    >
      <div
        className={cn(
          "pt-0 pb-4 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitivePanel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
