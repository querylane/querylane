import type { RenderCheckboxProps } from "react-data-grid";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const checkbox = (
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
    />
  );

  if (ariaLabel !== SELECT_ALL_ARIA_LABEL) {
    return checkbox;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="ml-auto inline-flex" />}>
        {checkbox}
      </TooltipTrigger>
      <TooltipContent>
        {indeterminate || checked
          ? "Clear selection"
          : "Select all rows on this page"}
      </TooltipContent>
    </Tooltip>
  );
}

export { DataGridCheckbox };
