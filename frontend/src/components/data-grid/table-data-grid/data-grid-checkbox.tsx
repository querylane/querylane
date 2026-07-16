import type { RenderCheckboxProps } from "react-data-grid";
import { Checkbox } from "@/components/ui/checkbox";

const SELECT_ALL_ARIA_LABEL = "Select All";

function DataGridCheckbox({
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  checked,
  disabled,
  indeterminate,
  onChange,
  tabIndex,
}: RenderCheckboxProps) {
  let selectAllTitle: string | undefined;
  if (ariaLabel === SELECT_ALL_ARIA_LABEL) {
    selectAllTitle =
      indeterminate || checked
        ? "Clear selection"
        : "Select all rows on this page";
  }

  return (
    <Checkbox
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      checked={checked ?? false}
      className="ml-auto"
      disabled={disabled}
      indeterminate={indeterminate}
      onCheckedChange={(nextChecked, details) => {
        const shift =
          details.event instanceof MouseEvent ? details.event.shiftKey : false;
        onChange(nextChecked, shift);
      }}
      tabIndex={tabIndex}
      title={selectAllTitle}
    />
  );
}

export { DataGridCheckbox };
