import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  Dialog as BaseDialog,
  DialogClose as BaseDialogClose,
  DialogContent as BaseDialogContent,
  DialogDescription as BaseDialogDescription,
  DialogFooter as BaseDialogFooter,
  DialogHeader as BaseDialogHeader,
  DialogOverlay as BaseDialogOverlay,
  DialogPortal as BaseDialogPortal,
  DialogTitle as BaseDialogTitle,
  DialogTrigger as BaseDialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const dialogContentPresentations = cva("", {
  variants: {
    presentation: {
      spacious: "gap-4",
      canvas: "gap-3 p-3 sm:p-4",
      compact: "p-4",
      "spacious-padded": "gap-4 p-4",
    },
  },
});

function DialogContent({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseDialogContent> &
  VariantProps<typeof dialogContentPresentations>) {
  return (
    <BaseDialogContent
      className={cn(dialogContentPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const dialogHeaderPresentations = cva("", {
  variants: {
    presentation: {
      closeable: "pr-10",
    },
  },
});

function DialogHeader({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseDialogHeader> &
  VariantProps<typeof dialogHeaderPresentations>) {
  return (
    <BaseDialogHeader
      className={cn(dialogHeaderPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function Dialog(props: ComponentProps<typeof BaseDialog>) {
  return <BaseDialog {...props} />;
}
function DialogClose(props: ComponentProps<typeof BaseDialogClose>) {
  return <BaseDialogClose {...props} />;
}
function DialogDescription(
  props: ComponentProps<typeof BaseDialogDescription>
) {
  return <BaseDialogDescription {...props} />;
}
function DialogFooter(props: ComponentProps<typeof BaseDialogFooter>) {
  return <BaseDialogFooter {...props} />;
}
function DialogOverlay(props: ComponentProps<typeof BaseDialogOverlay>) {
  return <BaseDialogOverlay {...props} />;
}
function DialogPortal(props: ComponentProps<typeof BaseDialogPortal>) {
  return <BaseDialogPortal {...props} />;
}
function DialogTitle(props: ComponentProps<typeof BaseDialogTitle>) {
  return <BaseDialogTitle {...props} />;
}
function DialogTrigger(props: ComponentProps<typeof BaseDialogTrigger>) {
  return <BaseDialogTrigger {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
