interface SqlEditorRunTarget {
  cursor: number;
  selection: { from: number; to: number };
  text: string;
}

interface SqlEditorHandle {
  focus: () => void;
  getRunTarget: () => SqlEditorRunTarget;
  /** Replaces the whole document as one undoable change. */
  replaceText: (text: string) => void;
}

export type { SqlEditorHandle, SqlEditorRunTarget };
