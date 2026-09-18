import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Table as BaseTable,
  TableBody as BaseTableBody,
  TableCaption as BaseTableCaption,
  TableCell as BaseTableCell,
  TableFooter as BaseTableFooter,
  TableHead as BaseTableHead,
  TableHeader as BaseTableHeader,
  TableRow as BaseTableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const tableHeadPresentations = cva("", {
  variants: {
    presentation: {
      inset: "pl-4",
      "connection-leading": "pl-0 text-xs",
      connection: "px-1 text-xs",
      "connection-trailing": "px-1 pr-0 text-xs",
      "insight-leading": "pl-5 text-muted-foreground text-xs",
      insight: "text-muted-foreground text-xs",
    },
  },
});

function TableHead({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTableHead> &
  VariantProps<typeof tableHeadPresentations>) {
  return (
    <BaseTableHead
      className={cn(tableHeadPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tableCellPresentations = cva("", {
  variants: {
    presentation: {
      inset: "pl-4",
      "identifier-muted-small": "font-mono text-muted-foreground text-xs",
      identifier: "font-mono",
      "identifier-muted": "font-mono text-muted-foreground",
      "inset-muted": "pl-4 text-muted-foreground",
      empty: "py-4 pl-0 text-muted-foreground text-xs",
      "numeric-muted": "font-mono text-muted-foreground text-xs tabular-nums",
      "muted-small": "text-muted-foreground text-xs",
      description: "truncate text-muted-foreground text-sm",
      "insight-leading": "py-2 pl-5",
      numeric: "font-mono text-xs tabular-nums",
      "connection-name": "py-1.5 pr-2 pl-0 text-xs",
      "connection-value": "px-1 py-1.5 text-xs",
      "connection-total": "px-1 py-1.5 pr-0 text-xs",
      "connection-name-summary": "py-1.5 pr-2 pl-0 font-medium text-xs",
      "connection-value-summary": "px-1 py-1.5 font-medium text-xs",
      "connection-total-summary": "px-1 py-1.5 pr-0 font-semibold text-xs",
    },
  },
});

function TableCell({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTableCell> &
  VariantProps<typeof tableCellPresentations>) {
  return (
    <BaseTableCell
      className={cn(tableCellPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tableRowPresentations = cva("", {
  variants: {
    presentation: {
      static: "hover:bg-transparent",
      inspector: "border-l-2 border-l-transparent hover:bg-transparent",
      selected: "bg-muted/70 hover:bg-muted/70",
      "extension-installed":
        "border-l-2 border-l-success bg-success/4 hover:bg-success/8",
      "extension-available": "border-l-2 border-l-transparent",
    },
  },
});

function TableRow({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTableRow> &
  VariantProps<typeof tableRowPresentations>) {
  return (
    <BaseTableRow
      className={cn(tableRowPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tableFooterPresentations = cva("", {
  variants: {
    presentation: {
      transparent: "bg-transparent",
    },
  },
});

function TableFooter({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTableFooter> &
  VariantProps<typeof tableFooterPresentations>) {
  return (
    <BaseTableFooter
      className={cn(tableFooterPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const tablePresentations = cva("", {
  variants: {
    presentation: {
      compact: "text-xs",
    },
  },
});

function Table({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseTable> & VariantProps<typeof tablePresentations>) {
  return (
    <BaseTable
      className={cn(tablePresentations({ presentation }), className)}
      {...props}
    />
  );
}

function TableBody(props: ComponentProps<typeof BaseTableBody>) {
  return <BaseTableBody {...props} />;
}
function TableCaption(props: ComponentProps<typeof BaseTableCaption>) {
  return <BaseTableCaption {...props} />;
}
function TableHeader(props: ComponentProps<typeof BaseTableHeader>) {
  return <BaseTableHeader {...props} />;
}

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
};
