import { type RenderCheckboxProps, renderCheckbox } from "react-data-grid";

const SELECT_ALL_ARIA_LABEL = "Select All";

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
  return renderCheckbox(checkboxProps);
}

export { DataGridCheckbox };
