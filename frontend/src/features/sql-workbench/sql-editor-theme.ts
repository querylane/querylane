import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * CodeMirror theme wired to Querylane's design tokens so the editor follows
 * light/dark mode without a separate stylesheet swap. Token colors reuse the
 * chart palette, which is already tuned for both themes.
 */

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "13px",
    height: "100%",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
  "&.cm-focused .cm-selectionBackground, & .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    {
      backgroundColor:
        "color-mix(in oklab, var(--primary) 18%, var(--background))",
    },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklab, var(--muted) 55%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    fontFamily: "var(--font-mono)",
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    borderRight: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-mono)",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.75rem",
    padding: "0 10px 0 12px",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in oklab, var(--primary) 20%, transparent)",
    outline: "none",
  },
  ".cm-panels": {
    backgroundColor: "var(--card)",
    color: "var(--card-foreground)",
  },
  ".cm-panels.cm-panels-top": {
    borderBottom: "1px solid var(--border)",
  },
  ".cm-placeholder": {
    color: "var(--muted-foreground)",
    fontStyle: "normal",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklab, var(--chart-4) 35%, transparent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in oklab, var(--chart-4) 60%, transparent)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow:
      "0 8px 24px color-mix(in oklab, var(--foreground) 12%, transparent)",
    color: "var(--popover-foreground)",
    fontFamily: "var(--font-sans)",
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "var(--popover)",
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "var(--border)",
  },
  // Completion popup: icon, label, then a muted right-aligned detail per row.
  ".cm-tooltip-autocomplete": {
    "& > ul": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      maxHeight: "17rem",
      minWidth: "18rem",
      padding: "4px",
      scrollbarWidth: "thin",
    },
    "& > ul > li": {
      alignItems: "center",
      borderRadius: "4px",
      display: "flex",
      gap: "8px",
      lineHeight: "1.4",
      padding: "3px 8px",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor:
        "color-mix(in oklab, var(--primary) 10%, var(--popover))",
      color: "var(--popover-foreground)",
    },
  },
  ".cm-tooltip.cm-completionInfo": {
    padding: "6px 8px",
  },
  ".cm-completionDetail": {
    color: "var(--muted-foreground)",
    flexShrink: "0",
    fontSize: "11px",
    fontStyle: "normal",
    marginLeft: "auto",
    maxWidth: "40%",
    overflow: "hidden",
    paddingLeft: "1rem",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-completionIcon": {
    flexShrink: "0",
    height: "14px",
    opacity: "1",
    padding: "0",
    width: "14px",
  },
  ".cm-completionLabel": {
    color: "inherit",
    flex: "0 1 auto",
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Diagnostics: a wavy underline under the offending token and a tooltip
  // with PostgreSQL's message, detail and hint.
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--destructive)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
  ".cm-tooltip.cm-tooltip-lint": {
    fontSize: "12px",
    padding: "2px 0",
  },
  ".cm-tooltip-lint .cm-diagnostic": {
    borderLeft: "3px solid var(--destructive)",
    margin: "2px 4px",
    padding: "4px 8px",
  },
  ".cm-tooltip-lint .cm-diagnostic-error": {
    borderLeftColor: "var(--destructive)",
  },
  ".cm-sqlDiagnosticExtra": {
    color: "var(--muted-foreground)",
    marginTop: "2px",
  },
  ".cm-completionMatchedText": {
    color: "var(--primary)",
    fontWeight: "600",
    textDecoration: "none",
  },
});

const editorHighlightStyle = HighlightStyle.define([
  { color: "var(--chart-1)", fontWeight: "600", tag: tags.keyword },
  { color: "var(--chart-1)", tag: [tags.operatorKeyword, tags.modifier] },
  { color: "var(--chart-3)", tag: [tags.string, tags.special(tags.string)] },
  { color: "var(--chart-2)", tag: [tags.number, tags.bool, tags.null] },
  { color: "var(--chart-4)", tag: [tags.function(tags.variableName)] },
  { color: "var(--chart-5)", tag: tags.typeName },
  { color: "var(--foreground)", tag: [tags.name, tags.propertyName] },
  { color: "var(--muted-foreground)", fontStyle: "italic", tag: tags.comment },
  { color: "var(--muted-foreground)", tag: [tags.punctuation, tags.operator] },
]);

const sqlEditorTheme = [editorTheme, syntaxHighlighting(editorHighlightStyle)];

export { sqlEditorTheme };
