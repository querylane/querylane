"use client";

import {
  autocompletion,
  type CompletionContext,
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
import {
  type CompletionClause,
  completionClause,
  contextOptions,
  scopedColumns,
  statementAround,
} from "@/features/sql-workbench/sql-completion-context";
import { completionIconOption } from "@/features/sql-workbench/sql-completion-icons";
import {
  extractReferencedRelations,
  isRelationPosition,
} from "@/features/sql-workbench/sql-completion-schema";
import { sqlEditorTheme } from "@/features/sql-workbench/sql-editor-theme";
import type { SqlEditorHandle } from "@/features/sql-workbench/sql-editor-types";
import { refreshSqlLint, sqlLinter } from "@/features/sql-workbench/sql-lint";
import { DEFAULT_SCHEMA } from "@/features/sql-workbench/sql-relation";
import type { CompletionScope } from "@/features/sql-workbench/use-sql-completion-namespace";
import type { SqlValidator } from "@/features/sql-workbench/use-sql-validation";

interface SqlEditorProps {
  ariaLabel: string;
  /** Columns and relations the contextual completion ranks from. */
  completionScope?: CompletionScope | undefined;
  /**
   * Schema unqualified names resolve against (the tab's search_path).
   * Defaults to `public`.
   */
  defaultSchema?: string | undefined;
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

/** What completion reads at the moment it runs, kept current through a ref. */
interface CompletionCatalog {
  defaultSchema: string;
  namespace: SQLNamespace;
  scope: CompletionScope;
}

const RELATION_LOOKBEHIND_CHARS = 200;
const WORD_BEFORE_PATTERN = /[\w$]*/;
const WORD_PATTERN = /^[\w$]*$/;
const EMPTY_SCOPE: CompletionScope = {
  columnsByRelation: new Map(),
  defaultSchema: DEFAULT_SCHEMA,
  relations: [],
};

function clauseAt(context: CompletionContext) {
  const { before, full } = statementAround(
    context.state.doc.toString(),
    context.pos
  );
  return { before, clause: completionClause(before), full };
}

/** True where our source should stay quiet and leave the field to lang-sql. */
function leavesToCatalog(clause: CompletionClause, before: string): boolean {
  if (clause === "alias") {
    return true;
  }
  return (
    clause === "relation" &&
    isRelationPosition(before.slice(-RELATION_LOOKBEHIND_CHARS))
  );
}

/**
 * Columns, functions and the keywords that fit the clause at the cursor,
 * ranked columns > functions > (lang-sql's tables and schemas) > keywords.
 * Qualified paths (`alias.`, `schema.table.`) are left to lang-sql.
 */
function contextualSource(catalogRef: {
  readonly current: CompletionCatalog;
}): CompletionSource {
  return (context) => {
    const word = context.matchBefore(WORD_BEFORE_PATTERN);
    const idle = !word || (word.from === word.to && !context.explicit);
    if (idle || context.state.sliceDoc(word.from - 1, word.from) === ".") {
      return null;
    }
    const { before, clause, full } = clauseAt(context);
    if (leavesToCatalog(clause, before)) {
      return null;
    }
    const { scope } = catalogRef.current;
    const columns = scopedColumns({
      ...scope,
      referenced: extractReferencedRelations(
        full,
        scope.relations,
        scope.defaultSchema
      ),
    });
    return {
      from: word.from,
      options: contextOptions(clause, columns),
      validFor: WORD_PATTERN,
    };
  };
}

/**
 * lang-sql's catalog source (tables, schemas, `alias.column` paths), muted
 * where no table belongs: the first word of a statement and alias names.
 * lang-sql builds its lookup tree when the source is created, so the source
 * is rebuilt only when completion runs against a changed namespace or
 * schema, never on a keystroke that does not ask for completion.
 */
function catalogSource(catalogRef: {
  readonly current: CompletionCatalog;
}): CompletionSource {
  let built:
    | {
        defaultSchema: string;
        namespace: SQLNamespace;
        source: CompletionSource;
      }
    | undefined;
  return (context) => {
    const { clause } = clauseAt(context);
    if (clause === "statement" || clause === "alias") {
      return null;
    }
    const { defaultSchema, namespace } = catalogRef.current;
    if (
      built?.namespace !== namespace ||
      built.defaultSchema !== defaultSchema
    ) {
      built = {
        defaultSchema,
        namespace,
        source: schemaCompletionSource({
          defaultSchema,
          dialect: PostgreSQL,
          schema: namespace,
        }),
      };
    }
    return built.source(context);
  };
}

type EditorCompartments = ReturnType<typeof createCompartments>;

function createCompartments() {
  return {
    attributes: new Compartment(),
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

// Mirrors lang-sql's `sql()`, but completion is contextual: the full
// PostgreSQL keyword list is replaced by clause-aware columns, functions and
// keywords. Both sources read the catalog through the ref, so the language
// is built once per editor.
function sqlLanguage(catalogRef: { readonly current: CompletionCatalog }) {
  const { language } = PostgreSQL;
  return new LanguageSupport(language, [
    language.data.of({ autocomplete: catalogSource(catalogRef) }),
    language.data.of({ autocomplete: contextualSource(catalogRef) }),
  ]);
}

function SqlEditor({
  ariaLabel,
  completionScope,
  defaultSchema = DEFAULT_SCHEMA,
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
  // Read through a ref so new tables and columns complete immediately
  // without rebuilding the language extension.
  const catalogRef = useRef<CompletionCatalog>({
    defaultSchema,
    namespace: schema,
    scope: completionScope ?? EMPTY_SCOPE,
  });
  // Created once per mount. A `useRef(createCompartments())` initialiser
  // would allocate the compartments on every render and discard them.
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
    catalogRef.current = {
      defaultSchema,
      namespace: schema,
      scope: completionScope ?? EMPTY_SCOPE,
    };
  });

  useImperativeHandle(ref, () => ({
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
        text,
        view.state.doc.sliceString(to, to + 1)
      );
      view.dispatch({
        changes: { from, insert, to },
        scrollIntoView: true,
        // Land after the name itself, before any separator space we added.
        selection: { anchor: from + insert.trimEnd().length },
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
          sqlLanguage(catalogRef),
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

  const lintScope = validate?.scopeKey;
  useEffect(
    function relintOnScopeChange() {
      // The linter re-runs on edits only. When the validator's scope (the
      // tab's default schema) changes, the same text can resolve differently,
      // so ask for a fresh check; with no validator there is nothing to redo.
      if (lintScope === undefined) {
        return;
      }
      viewRef.current?.dispatch({ effects: refreshSqlLint.of(null) });
    },
    [lintScope]
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
