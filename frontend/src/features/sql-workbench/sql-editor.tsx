"use client";

import {
  autocompletion,
  type CompletionSource,
  closeBrackets,
  closeBracketsKeymap,
  closeCompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  keywordCompletionSource,
  PostgreSQL,
  type SQLNamespace,
  schemaCompletionSource,
} from "@codemirror/lang-sql";
import {
  bracketMatching,
  indentOnInput,
  LanguageSupport,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection,
} from "@codemirror/view";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";
import { padInsertion } from "@/features/sql-workbench/sql-catalog-model";
import { completionIconOption } from "@/features/sql-workbench/sql-completion-icons";
import {
  DEFAULT_SCHEMA,
  isRelationPosition,
} from "@/features/sql-workbench/sql-completion-schema";
import { sqlEditorTheme } from "@/features/sql-workbench/sql-editor-theme";
import type { SqlEditorHandle } from "@/features/sql-workbench/sql-editor-types";
import { sqlLinter } from "@/features/sql-workbench/sql-lint";
import type { SqlValidator } from "@/features/sql-workbench/use-sql-validation";

interface SqlEditorProps {
  ariaLabel: string;
  disabled?: boolean | undefined;
  onChange: (text: string) => void;
  onFormat: () => void;
  onRunAll: () => void;
  onRunCurrent: () => void;
  placeholder?: string | undefined;
  ref?: Ref<SqlEditorHandle> | undefined;
  schema: SQLNamespace;
  /** Server-side statement check; omit to lint nothing. */
  validate?: SqlValidator | undefined;
  value: string;
}

interface EditorCallbacks {
  onChange: (text: string) => void;
  onFormat: () => void;
  onRunAll: () => void;
  onRunCurrent: () => void;
}

const EMPTY_SCHEMA: SQLNamespace = {};
const RELATION_LOOKBEHIND_CHARS = 200;
const postgresKeywords = keywordCompletionSource(PostgreSQL, true);

/** Keyword completions, except where only a relation name belongs. */
const contextualKeywords: CompletionSource = (context) => {
  const before = context.state.sliceDoc(
    Math.max(0, context.pos - RELATION_LOOKBEHIND_CHARS),
    context.pos
  );
  return isRelationPosition(before) ? null : postgresKeywords(context);
};

type EditorCompartments = ReturnType<typeof createCompartments>;

function createCompartments() {
  return {
    attributes: new Compartment(),
    editable: new Compartment(),
    language: new Compartment(),
    placeholder: new Compartment(),
  };
}

function contentAttributes(ariaLabel: string) {
  return EditorView.contentAttributes.of({
    "aria-label": ariaLabel,
    "aria-multiline": "true",
    role: "textbox",
  });
}

// Mirrors lang-sql's `sql()` but with the keyword source made contextual.
function sqlLanguage(schema: SQLNamespace) {
  const { language } = PostgreSQL;
  return new LanguageSupport(language, [
    language.data.of({
      autocomplete: schemaCompletionSource({
        defaultSchema: DEFAULT_SCHEMA,
        dialect: PostgreSQL,
        schema,
      }),
    }),
    language.data.of({ autocomplete: contextualKeywords }),
  ]);
}

function SqlEditor({
  ariaLabel,
  disabled = false,
  onChange,
  onFormat,
  onRunAll,
  onRunCurrent,
  placeholder,
  ref,
  schema,
  validate,
  value,
}: SqlEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacksRef = useRef<EditorCallbacks>({
    onChange,
    onFormat,
    onRunAll,
    onRunCurrent,
  });
  const validateRef = useRef(validate);
  // Created once per mount. A `useRef(createCompartments())` initialiser
  // would allocate four compartments on every render and discard them.
  const compartmentsRef = useRef<EditorCompartments | null>(null);
  if (compartmentsRef.current === null) {
    compartmentsRef.current = createCompartments();
  }
  const compartments = compartmentsRef.current;
  // The view is created once per mount; props that can change afterwards are
  // applied through compartments so the document and its undo history survive
  // (a tab rename must not reset the SQL).
  const initialPropsRef = useRef({ ariaLabel, placeholder, value });

  useEffect(function keepCallbacksCurrent() {
    callbacksRef.current = { onChange, onFormat, onRunAll, onRunCurrent };
    validateRef.current = validate;
  });

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    getRunTarget: () => {
      const view = viewRef.current;
      if (!view) {
        return { cursor: 0, selection: { from: 0, to: 0 }, text: "" };
      }
      const { from, to, head } = view.state.selection.main;
      return {
        cursor: head,
        selection: { from, to },
        text: view.state.doc.toString(),
      };
    },
    insertText: (text) => {
      const view = viewRef.current;
      if (!view) {
        return;
      }
      const { from, to } = view.state.selection.main;
      const insert = padInsertion(
        view.state.doc.sliceString(Math.max(0, from - 1), from),
        text
      );
      view.dispatch({
        changes: { from, insert, to },
        scrollIntoView: true,
        selection: { anchor: from + insert.length },
      });
      view.focus();
    },
    replaceText: (text) => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === text) {
        return;
      }
      view.dispatch({
        changes: { from: 0, insert: text, to: view.state.doc.length },
        selection: {
          anchor: Math.min(text.length, view.state.selection.main.head),
        },
      });
    },
  }));

  useEffect(
    function mountEditor() {
      const host = hostRef.current;
      if (!host) {
        return;
      }
      const runKeymap = keymap.of([
        {
          key: "Mod-Enter",
          preventDefault: true,
          run: (editorView) => {
            closeCompletion(editorView);
            callbacksRef.current.onRunCurrent();
            return true;
          },
        },
        {
          key: "Shift-Mod-Enter",
          preventDefault: true,
          run: (editorView) => {
            closeCompletion(editorView);
            callbacksRef.current.onRunAll();
            return true;
          },
        },
        {
          key: "Shift-Mod-f",
          preventDefault: true,
          run: () => {
            callbacksRef.current.onFormat();
            return true;
          },
        },
      ]);
      const initial = initialPropsRef.current;
      const state = EditorState.create({
        doc: initial.value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({
            activateOnTyping: true,
            addToOptions: [completionIconOption],
            icons: false,
            maxRenderedOptions: 40,
          }),
          highlightSelectionMatches(),
          sqlLinter(() => validateRef.current),
          EditorState.allowMultipleSelections.of(true),
          runKeymap,
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          compartments.language.of(sqlLanguage(EMPTY_SCHEMA)),
          compartments.editable.of(EditorView.editable.of(true)),
          compartments.placeholder.of(
            placeholderExtension(initial.placeholder ?? "")
          ),
          compartments.attributes.of(contentAttributes(initial.ariaLabel)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacksRef.current.onChange(update.state.doc.toString());
            }
          }),
          sqlEditorTheme,
        ],
      });
      const view = new EditorView({ parent: host, state });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    },
    [compartments]
  );

  useEffect(
    function syncAriaLabel() {
      viewRef.current?.dispatch({
        effects: compartments.attributes.reconfigure(
          contentAttributes(ariaLabel)
        ),
      });
    },
    [ariaLabel, compartments]
  );

  useEffect(
    function syncPlaceholder() {
      viewRef.current?.dispatch({
        effects: compartments.placeholder.reconfigure(
          placeholderExtension(placeholder ?? "")
        ),
      });
    },
    [placeholder, compartments]
  );

  useEffect(
    function syncSchema() {
      viewRef.current?.dispatch({
        effects: compartments.language.reconfigure(sqlLanguage(schema)),
      });
    },
    [schema, compartments]
  );

  useEffect(
    function syncEditable() {
      viewRef.current?.dispatch({
        effects: compartments.editable.reconfigure(
          EditorView.editable.of(!disabled)
        ),
      });
    },
    [disabled, compartments]
  );

  useEffect(
    function syncExternalValue() {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) {
        return;
      }
      view.dispatch({
        changes: { from: 0, insert: value, to: view.state.doc.length },
      });
    },
    [value]
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col [&_.cm-editor]:h-full"
      data-keyboard-shortcut-scope="editor"
      data-testid="sql-editor"
      ref={hostRef}
    />
  );
}

export { SqlEditor };
