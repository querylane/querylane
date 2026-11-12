import {
  FieldDescription as FieldDescriptionPrimitive,
  FieldLabel as FieldLabelPrimitive,
  Field as FieldPrimitive,
} from "@ui-sdk/react/field";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { Separator } from "@/components/ui/separator";

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      className={cn(
        "flex flex-col gap-6 has-[>[data-querylane-slot=checkbox-group]]:gap-3 has-[>[data-querylane-slot=radio-group]]:gap-3",
        className
      )}
      data-querylane-slot="field-set"
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: React.ComponentProps<"legend"> & { variant?: "legend" | "label" }) {
  return (
    <legend
      className={cn(
        "mb-3 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
        className
      )}
      data-querylane-slot="field-legend"
      data-variant={variant}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-7 data-[querylane-slot=checkbox-group]:gap-3 *:data-[querylane-slot=field-group]:gap-4",
        className
      )}
      data-querylane-slot="field-group"
      {...props}
    />
  );
}

const fieldVariants = cva(
  "group/field flex w-full gap-3 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-querylane-slot=field-content]]:items-start *:data-[querylane-slot=field-label]:flex-auto has-[>[data-querylane-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-querylane-slot=field-content]]:items-start @md/field-group:*:data-[querylane-slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-querylane-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof FieldPrimitive> &
  VariantProps<typeof fieldVariants>) {
  return (
    <FieldPrimitive
      className={cn(fieldVariants({ orientation }), className)}
      data-orientation={orientation}
      data-querylane-slot="field"
      {...props}
    />
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group/field-content flex flex-1 flex-col gap-1 leading-snug",
        className
      )}
      data-querylane-slot="field-content"
      {...props}
    />
  );
}

function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof FieldLabelPrimitive>) {
  return (
    <FieldLabelPrimitive
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-querylane-slot=field]]:rounded-md has-[>[data-querylane-slot=field]]:border has-[>[data-querylane-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-querylane-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-querylane-slot=field]]:has-[:focus-visible]:ring-3 has-[>[data-querylane-slot=field]]:has-[:focus-visible]:ring-ring/50 *:data-[querylane-slot=field]:p-3 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-querylane-slot=field]]:w-full has-[>[data-querylane-slot=field]]:flex-col",
        className
      )}
      data-querylane-slot="field-label"
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50",
        className
      )}
      data-querylane-slot="field-label"
      {...props}
    />
  );
}

function FieldDescription({
  className,
  ...props
}: React.ComponentProps<typeof FieldDescriptionPrimitive>) {
  return (
    <FieldDescriptionPrimitive
      className={cn(
        "text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      data-querylane-slot="field-description"
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      data-content={Boolean(children)}
      data-querylane-slot="field-separator"
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {Boolean(children) && (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-querylane-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & {
  errors?: ({ message?: string } | undefined)[];
}) {
  const content = (() => {
    if (Boolean(children)) {
      return children;
    }

    if (errors === undefined || errors.length === 0) {
      return null;
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    if (uniqueErrors?.length === 1) {
      return uniqueErrors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {uniqueErrors.map(
          (error) =>
            Boolean(error?.message) && (
              <li key={error?.message}>{error?.message}</li>
            )
        )}
      </ul>
    );
  })();

  if (!Boolean(content)) {
    return null;
  }

  return (
    <div
      className={cn("text-sm font-normal text-destructive", className)}
      data-querylane-slot="field-error"
      role="alert"
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
