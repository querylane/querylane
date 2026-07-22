import { CheckIcon, MinusIcon } from "lucide-react";
import { type RenderCheckboxProps, renderCheckbox } from "react-data-grid";
import { cn } from "@/lib/utils";

const SELECT_ALL_ARIA_LABEL = "Select All";

// Visual clone of the shadcn checkbox (see components/ui/checkbox.tsx) built
// around the data grid's native input renderer. The grid deliberately avoids
// mounting the headless ui/checkbox tree per row (PR #251 measured the churn);
// the native input keeps behavior (shift ranges, indeterminate, focus) and is
// stretched invisibly over the styled box in data-grid-theme.css.
function DataGridCheckbox(props: RenderCheckboxProps) {
  let selectAllTitle: string | undefined;
  if (props["aria-label"] === SELECT_ALL_ARIA_LABEL) {
    selectAllTitle =
      props.indeterminate || props.checked
        ? "Clear selection"
        : "Select all rows on this page";
  }

  const checkboxProps: RenderCheckboxProps & { title: string | undefined } = {
    ...props,
    title: selectAllTitle,
  };
  const isMarked = props.indeterminate === true || props.checked === true;
  return (
    <span
      className={cn(
        "relative mx-auto flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input text-primary-foreground shadow-xs transition-shadow dark:bg-input/30",
        "has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        isMarked && "border-primary bg-primary dark:bg-primary",
        props.disabled && "opacity-50"
      )}
      data-slot="grid-checkbox"
    >
      {renderCheckbox(checkboxProps)}
      {props.indeterminate ? (
        <MinusIcon aria-hidden={true} className="size-3.5" />
      ) : (
        props.checked && <CheckIcon aria-hidden={true} className="size-3.5" />
      )}
    </span>
  );
}

export { DataGridCheckbox };
