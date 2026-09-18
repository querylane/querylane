import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Card as BaseCard,
  CardAction as BaseCardAction,
  CardContent as BaseCardContent,
  CardDescription as BaseCardDescription,
  CardFooter as BaseCardFooter,
  CardHeader as BaseCardHeader,
  CardTitle as BaseCardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const cardPresentations = cva("", {
  variants: {
    presentation: {
      danger: "border-destructive/30 bg-destructive/3",
      onboarding:
        "border-white/10 bg-onboarding-card py-0 text-white shadow-(--shadow-onboarding-dialog)",
      floating: "border bg-background/95 shadow-lg backdrop-blur-sm",
      "bordered-flush": "gap-0 border-border py-0",
      flush: "gap-0 py-0",
      bordered: "border-border",
      compact: "gap-4",
      split: "gap-0 py-0 md:divide-x md:divide-border",
      error: "border-destructive/30",
    },
    layout: {
      wide: "md:col-span-2",
      single: "md:col-span-2 lg:col-span-1",
      double: "md:col-span-2 lg:col-span-2",
    },
  },
});

function Card({
  layout,
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCard> & VariantProps<typeof cardPresentations>) {
  return (
    <BaseCard
      className={cn(cardPresentations({ presentation, layout }), className)}
      {...props}
    />
  );
}

const cardHeaderPresentations = cva("", {
  variants: {
    presentation: {
      compact: "py-4",
      spacious: "gap-3",
      definition: "border-b bg-muted/40 py-3",
      insights: "border-b py-4",
      "insights-stacked": "gap-3 py-4",
      section: "gap-4",
      inset: "px-4",
      "compact-row": "gap-2",
      "definition-plain": "py-3",
      "definition-separated": "border-b py-3",
    },
  },
});

function CardHeader({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCardHeader> &
  VariantProps<typeof cardHeaderPresentations>) {
  return (
    <BaseCardHeader
      className={cn(cardHeaderPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const cardContentPresentations = cva("", {
  variants: {
    presentation: {
      stacked: "space-y-3",
      recovery: "gap-4 px-6 py-8",
      spacious: "space-y-4",
      flush: "p-0",
      "spacious-row": "gap-4",
      description: "text-muted-foreground text-sm",
      compact: "py-3",
      canvas: "gap-3 p-4",
      insights: "gap-4 py-4",
      chart: "px-0 pb-2",
      summary: "gap-1 px-4 py-3",
      "compact-row": "gap-3",
      "tight-row": "gap-2",
      empty: "gap-3 py-10",
      divided: "divide-y divide-border/60 p-0",
      metric: "gap-y-1 px-4 py-0",
      inset: "px-4",
      "definition-description":
        "py-4 text-muted-foreground text-sm leading-relaxed",
    },
  },
});

function CardContent({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCardContent> &
  VariantProps<typeof cardContentPresentations>) {
  return (
    <BaseCardContent
      className={cn(cardContentPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const cardTitlePresentations = cva("", {
  variants: {
    presentation: {
      icon: "gap-2",
      section: "gap-2 text-base",
    },
  },
});

function CardTitle({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCardTitle> &
  VariantProps<typeof cardTitlePresentations>) {
  return (
    <BaseCardTitle
      className={cn(cardTitlePresentations({ presentation }), className)}
      {...props}
    />
  );
}

const cardDescriptionPresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono text-xs",
    },
  },
});

function CardDescription({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseCardDescription> &
  VariantProps<typeof cardDescriptionPresentations>) {
  return (
    <BaseCardDescription
      className={cn(cardDescriptionPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function CardAction(props: ComponentProps<typeof BaseCardAction>) {
  return <BaseCardAction {...props} />;
}
function CardFooter(props: ComponentProps<typeof BaseCardFooter>) {
  return <BaseCardFooter {...props} />;
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
