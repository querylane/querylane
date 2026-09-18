import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Accordion as BaseAccordion,
  AccordionContent as BaseAccordionContent,
  AccordionItem as BaseAccordionItem,
  AccordionTrigger as BaseAccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

const accordionPresentations = cva("", {
  variants: {
    presentation: {
      separated: "border-t",
    },
  },
});

function Accordion({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseAccordion> &
  VariantProps<typeof accordionPresentations>) {
  return (
    <BaseAccordion
      className={cn(accordionPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const accordionTriggerPresentations = cva("", {
  variants: {
    presentation: {
      spacious: "py-4",
      compact: "text-sm",
    },
  },
});

function AccordionTrigger({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseAccordionTrigger> &
  VariantProps<typeof accordionTriggerPresentations>) {
  return (
    <BaseAccordionTrigger
      className={cn(accordionTriggerPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const accordionContentPresentations = cva("", {
  variants: {
    presentation: {
      stacked: "space-y-4",
    },
  },
});

function AccordionContent({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseAccordionContent> &
  VariantProps<typeof accordionContentPresentations>) {
  return (
    <BaseAccordionContent
      className={cn(accordionContentPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function AccordionItem(props: ComponentProps<typeof BaseAccordionItem>) {
  return <BaseAccordionItem {...props} />;
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
