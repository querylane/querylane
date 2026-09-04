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
  ".cm-tooltip-autocomplete": {
    "& > ul": {
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      maxHeight: "16rem",
    },
    "& > ul > li": {
      padding: "3px 8px",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
  },
  ".cm-tooltip.cm-completionInfo": {
    padding: "6px 8px",
  },
  ".cm-completionDetail": {
    color: "var(--muted-foreground)",
    fontStyle: "normal",
    marginLeft: "0.75rem",
  },
  ".cm-completionIcon": {
    opacity: "0.7",
  },
  ".cm-completionLabel": {
    color: "inherit",
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
