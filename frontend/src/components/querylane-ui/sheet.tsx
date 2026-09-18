import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Sheet as BaseSheet,
  SheetClose as BaseSheetClose,
  SheetContent as BaseSheetContent,
  SheetDescription as BaseSheetDescription,
  SheetFooter as BaseSheetFooter,
  SheetHeader as BaseSheetHeader,
  SheetTitle as BaseSheetTitle,
  SheetTrigger as BaseSheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const sheetContentPresentations = cva("", {
  variants: {
    presentation: {
      flush: "gap-0",
      detail: "gap-0 p-0",
    },
    width: {
      detail:
        "data-[side=right]:w-[min(calc(100vw-1rem),clamp(34rem,45vw,60rem))] data-[side=right]:sm:max-w-none",
    },
  },
});

function SheetContent({
  width,
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSheetContent> &
  VariantProps<typeof sheetContentPresentations>) {
  return (
    <BaseSheetContent
      className={cn(
        sheetContentPresentations({ presentation, width }),
        className
      )}
      {...props}
    />
  );
}

const sheetHeaderPresentations = cva("", {
  variants: {
    presentation: {
      drawer: "border-b px-5 py-4 pr-14",
      "record-drawer": "gap-2 border-b px-5 py-3.5 pr-14",
      inspector: "border-border border-b pr-12",
    },
  },
});

function SheetHeader({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSheetHeader> &
  VariantProps<typeof sheetHeaderPresentations>) {
  return (
    <BaseSheetHeader
      className={cn(sheetHeaderPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const sheetTitlePresentations = cva("", {
  variants: {
    presentation: {
      heading: "text-base",
      identifier: "truncate font-mono font-semibold text-base",
      query: "font-mono font-semibold text-sm",
      record: "font-mono text-base leading-snug",
    },
  },
});

function SheetTitle({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSheetTitle> &
  VariantProps<typeof sheetTitlePresentations>) {
  return (
    <BaseSheetTitle
      className={cn(sheetTitlePresentations({ presentation }), className)}
      {...props}
    />
  );
}

const sheetDescriptionPresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono text-xs",
    },
  },
});

function SheetDescription({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseSheetDescription> &
  VariantProps<typeof sheetDescriptionPresentations>) {
  return (
    <BaseSheetDescription
      className={cn(sheetDescriptionPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function Sheet(props: ComponentProps<typeof BaseSheet>) {
  return <BaseSheet {...props} />;
}
function SheetClose(props: ComponentProps<typeof BaseSheetClose>) {
  return <BaseSheetClose {...props} />;
}
function SheetFooter(props: ComponentProps<typeof BaseSheetFooter>) {
  return <BaseSheetFooter {...props} />;
}
function SheetTrigger(props: ComponentProps<typeof BaseSheetTrigger>) {
  return <BaseSheetTrigger {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
