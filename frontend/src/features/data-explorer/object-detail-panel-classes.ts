/**
 * Panel classes for the full-bleed object detail layout: the header and tab
 * bar stay pinned while each tab panel scrolls on its own. FILL is for the
 * edge-to-edge data grid; PADDED is for metadata tabs and card flows.
 */
const OBJECT_DETAIL_PANEL_FILL_CLASS = "min-h-0 flex-1 overflow-y-auto";
const OBJECT_DETAIL_PANEL_PADDED_CLASS =
  "min-h-0 flex-1 overflow-y-auto p-4 sm:p-6";

export { OBJECT_DETAIL_PANEL_FILL_CLASS, OBJECT_DETAIL_PANEL_PADDED_CLASS };
