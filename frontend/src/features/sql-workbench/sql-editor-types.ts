interface SqlEditorRunTarget {
  cursor: number;
  selection: { from: number; to: number };
  text: string;
}

interface SqlEditorHandle {
  focus: () => void;
  getRunTarget: () => SqlEditorRunTarget;
  /** Replaces the selection (or inserts at the cursor) and focuses the editor. */
  insertText: (text: string) => void;
  /** Replaces the whole document as one undoable change. */
  replaceText: (text: string) => void;
}

export type { SqlEditorHandle, SqlEditorRunTarget };
