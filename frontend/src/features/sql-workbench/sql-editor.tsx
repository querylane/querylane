"use client";

import {
  autocompletion,
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
import { PostgreSQL, type SQLNamespace, sql } from "@codemirror/lang-sql";
import { bracketMatching, indentOnInput } from "@codemirror/language";
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
import { DEFAULT_SCHEMA } from "@/features/sql-workbench/sql-completion-schema";
import { sqlEditorTheme } from "@/features/sql-workbench/sql-editor-theme";
import type { SqlEditorHandle } from "@/features/sql-workbench/sql-editor-types";

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
  value: string;
}

interface EditorCallbacks {
  onChange: (text: string) => void;
  onFormat: () => void;
  onRunAll: () => void;
  onRunCurrent: () => void;
}

const EMPTY_SCHEMA: SQLNamespace = {};

function sqlLanguage(schema: SQLNamespace) {
  return sql({
    defaultSchema: DEFAULT_SCHEMA,
    dialect: PostgreSQL,
    schema,
    upperCaseKeywords: true,
  });
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
  const languageCompartment = useRef(new Compartment());
  const editableCompartment = useRef(new Compartment());
  const initialValueRef = useRef(value);

  useEffect(function keepCallbacksCurrent() {
    callbacksRef.current = { onChange, onFormat, onRunAll, onRunCurrent };
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
      const state = EditorState.create({
        doc: initialValueRef.current,
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
          autocompletion({ activateOnTyping: true, maxRenderedOptions: 40 }),
          highlightSelectionMatches(),
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
          languageCompartment.current.of(sqlLanguage(EMPTY_SCHEMA)),
          editableCompartment.current.of(EditorView.editable.of(true)),
          placeholderExtension(placeholder ?? ""),
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel,
            "aria-multiline": "true",
            role: "textbox",
          }),
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
    [ariaLabel, placeholder]
  );

  useEffect(
    function syncSchema() {
      viewRef.current?.dispatch({
        effects: languageCompartment.current.reconfigure(sqlLanguage(schema)),
      });
    },
    [schema]
  );

  useEffect(
    function syncEditable() {
      viewRef.current?.dispatch({
        effects: editableCompartment.current.reconfigure(
          EditorView.editable.of(!disabled)
        ),
      });
    },
    [disabled]
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
