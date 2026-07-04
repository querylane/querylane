import {
  type View,
  View_ViewType,
} from "@/protogen/querylane/console/v1alpha1/view_pb";

export function viewTypeLabel(view: View | undefined): string {
  if (!view) {
    return "View";
  }
  return view.viewType === View_ViewType.MATERIALIZED
    ? "Materialized view"
    : "View";
}
