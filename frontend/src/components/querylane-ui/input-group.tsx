import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import {
  InputGroup as BaseInputGroup,
  InputGroupAddon as BaseInputGroupAddon,
  InputGroupButton as BaseInputGroupButton,
  InputGroupInput as BaseInputGroupInput,
  InputGroupText as BaseInputGroupText,
  InputGroupTextarea as BaseInputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

const inputGroupInputPresentations = cva("", {
  variants: {
    presentation: {
      identifier: "px-1 font-mono text-xs",
    },
  },
});

function InputGroupInput({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseInputGroupInput> &
  VariantProps<typeof inputGroupInputPresentations>) {
  return (
    <BaseInputGroupInput
      className={cn(inputGroupInputPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const inputGroupAddonPresentations = cva("", {
  variants: {
    presentation: {
      compact: "gap-1",
    },
  },
});

function InputGroupAddon({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseInputGroupAddon> &
  VariantProps<typeof inputGroupAddonPresentations>) {
  return (
    <BaseInputGroupAddon
      className={cn(inputGroupAddonPresentations({ presentation }), className)}
      {...props}
    />
  );
}

const inputGroupTextPresentations = cva("", {
  variants: {
    presentation: {
      identifier: "font-mono text-xs",
    },
  },
});

function InputGroupText({
  className,
  presentation,
  ...props
}: ComponentProps<typeof BaseInputGroupText> &
  VariantProps<typeof inputGroupTextPresentations>) {
  return (
    <BaseInputGroupText
      className={cn(inputGroupTextPresentations({ presentation }), className)}
      {...props}
    />
  );
}

function InputGroup(props: ComponentProps<typeof BaseInputGroup>) {
  return <BaseInputGroup {...props} />;
}
function InputGroupButton(props: ComponentProps<typeof BaseInputGroupButton>) {
  return <BaseInputGroupButton {...props} />;
}
function InputGroupTextarea(
  props: ComponentProps<typeof BaseInputGroupTextarea>
) {
  return <BaseInputGroupTextarea {...props} />;
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
