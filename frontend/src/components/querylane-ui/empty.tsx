import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Empty as BaseEmpty,
  EmptyContent as BaseEmptyContent,
  EmptyDescription as BaseEmptyDescription,
  EmptyHeader as BaseEmptyHeader,
  EmptyMedia as BaseEmptyMedia,
  EmptyTitle as BaseEmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

const emptyPresentations = cva("", {
  variants: {
    presentation: {
      borderless: "border-0 p-0",
      compact: "border-0 p-4",
      page: "border-border bg-card border",
      panel: "border-border bg-card rounded-xl border px-6 py-10",
      "panel-compact": "border-border bg-card rounded-md border px-4 py-6",
      "panel-dashed":
        "border-border bg-card rounded-md border border-dashed px-6 py-10",
      search: "rounded-md border-0 px-4 py-8",
      "search-compact": "rounded-md border-0 px-4 py-3.5",
      "search-header": "rounded-md border-0 px-4 py-6",
      "search-bordered": "rounded-md border px-4 py-8",
      "search-rounded": "rounded-lg border px-4 py-8",
      chart: "border-0 bg-transparent",
    },
  },
});

function Empty({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseEmpty> & VariantProps<typeof emptyPresentations>) {
  return (
    <BaseEmpty
      className={cn(emptyPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const emptyTitlePresentations = cva("", {
  variants: {
    presentation: {
      compact: "text-sm",
    },
  },
});

function EmptyTitle({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseEmptyTitle> &
  VariantProps<typeof emptyTitlePresentations>) {
  return (
    <BaseEmptyTitle
      className={cn(emptyTitlePresentations({ presentation }), className)}
      {...props}
    />
  );
}

function EmptyContent({
  width,
  className,
  ...props
}: ComponentProps<typeof BaseEmptyContent> & { width?: "default" | "wide" }) {
  return (
    <BaseEmptyContent
      className={cn(
        width && (width === "wide" ? "max-w-[520px]" : "max-w-md"),
        className
      )}
      {...props}
    />
  );
}
function EmptyDescription(props: ComponentProps<typeof BaseEmptyDescription>) {
  return <BaseEmptyDescription {...props} />;
}
function EmptyHeader({
  width,
  className,
  ...props
}: ComponentProps<typeof BaseEmptyHeader> & { width?: "default" | "wide" }) {
  return (
    <BaseEmptyHeader
      className={cn(
        width && (width === "wide" ? "max-w-[520px]" : "max-w-md"),
        className
      )}
      {...props}
    />
  );
}
function EmptyMedia(props: ComponentProps<typeof BaseEmptyMedia>) {
  return <BaseEmptyMedia {...props} />;
}

export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
};
