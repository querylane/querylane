import type { Completion } from "@codemirror/autocomplete";

/**
 * Typed icons for the completion popup, in the spirit of DataGrip: every row
 * starts with a glyph that says what kind of thing it is, so the eye can
 * separate tables from columns from keywords before reading a label.
 *
 * Shapes are lucide path data (24px grid, 2px stroke) so the popup matches
 * the icons in the catalog rail; the materialized-view glyph is the project's
 * own. They are built as DOM nodes because CodeMirror renders options
 * outside React.
 */

type IconShape =
  | { d: string; tag: "path" }
  | { cx: string; cy: string; r: string; tag: "circle" }
  | {
      height: string;
      rx: string;
      tag: "rect";
      width: string;
      x: string;
      y: string;
    }
  | { tag: "line"; x1: string; x2: string; y1: string; y2: string };

interface CompletionIcon {
  /** CSS color for the glyph; design tokens keep it theme-aware. */
  color: string;
  shapes: readonly IconShape[];
}

const SVG_NS = "http://www.w3.org/2000/svg";

const SQUARE: IconShape = {
  height: "18",
  rx: "2",
  tag: "rect",
  width: "18",
  x: "3",
  y: "3",
};
const EYE: readonly IconShape[] = [
  { d: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z", tag: "path" },
  { cx: "12", cy: "12", r: "3", tag: "circle" },
];

const COMPLETION_ICONS: Record<string, CompletionIcon> = {
  column: {
    color: "var(--chart-3)",
    shapes: [
      SQUARE,
      { d: "M9 3v18", tag: "path" },
      { d: "M15 3v18", tag: "path" },
    ],
  },
  constant: {
    color: "var(--muted-foreground)",
    shapes: [
      { tag: "line", x1: "4", x2: "20", y1: "9", y2: "9" },
      { tag: "line", x1: "4", x2: "20", y1: "15", y2: "15" },
      { tag: "line", x1: "10", x2: "8", y1: "3", y2: "21" },
      { tag: "line", x1: "16", x2: "14", y1: "3", y2: "21" },
    ],
  },
  keyword: {
    color: "var(--chart-1)",
    shapes: [
      { d: "m16 18 6-6-6-6", tag: "path" },
      { d: "m8 6-6 6 6 6", tag: "path" },
    ],
  },
  "materialized-view": {
    color: "var(--chart-2)",
    shapes: [...EYE, { d: "m20 4-2 2", tag: "path" }],
  },
  namespace: {
    color: "var(--chart-4)",
    shapes: [
      {
        d: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
        tag: "path",
      },
    ],
  },
  table: {
    color: "var(--chart-2)",
    shapes: [
      SQUARE,
      { d: "M3 9h18", tag: "path" },
      { d: "M3 15h18", tag: "path" },
      { d: "M9 3v18", tag: "path" },
      { d: "M15 3v18", tag: "path" },
    ],
  },
  type: {
    color: "var(--chart-5)",
    shapes: [
      { d: "M12 4v16", tag: "path" },
      { d: "M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2", tag: "path" },
      { d: "M9 20h6", tag: "path" },
    ],
  },
  "primary-key": {
    color: "var(--chart-4)",
    shapes: [
      {
        d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
        tag: "path",
      },
      { cx: "16.5", cy: "7.5", r: ".5", tag: "circle" },
    ],
  },
  // lang-sql labels built-in functions "variable".
  variable: {
    color: "var(--chart-5)",
    shapes: [
      SQUARE,
      { d: "M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3", tag: "path" },
      { d: "M9 11.2h5.7", tag: "path" },
    ],
  },
  view: { color: "var(--chart-2)", shapes: EYE },
};

const FALLBACK_ICON: CompletionIcon = {
  color: "var(--muted-foreground)",
  shapes: [{ cx: "12", cy: "12", r: "3", tag: "circle" }],
};

function appendShape(svg: SVGSVGElement, shape: IconShape) {
  const element = document.createElementNS(SVG_NS, shape.tag);
  for (const [name, value] of Object.entries(shape)) {
    if (name !== "tag") {
      element.setAttribute(name, value);
    }
  }
  svg.append(element);
}

function renderCompletionIcon(completion: Completion): Node {
  const icon = COMPLETION_ICONS[completion.type ?? ""] ?? FALLBACK_ICON;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "cm-completionIcon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.style.color = icon.color;
  for (const shape of icon.shapes) {
    appendShape(svg, shape);
  }
  return svg;
}

/** Replaces CodeMirror's text glyphs; pass with `icons: false`. */
const completionIconOption = { position: 20, render: renderCompletionIcon };

export { completionIconOption };
