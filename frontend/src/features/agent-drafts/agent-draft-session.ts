import type { AgentAction } from "@ui-sdk/react/agent";
import {
  createHistory,
  type HistoryEntry,
  type StagedChange,
  stageChanges,
} from "@ui-sdk/react/history";
import { elementOf } from "@ui-sdk/react/observe";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import { agent } from "@/features/user-settings/agent-tools";
import { useAgentDraftStore } from "./agent-draft-state";
import {
  DRAFT_KEYS,
  type DraftKey,
  type InstanceDraftValue,
} from "./instance-draft";

const MAX_REVISIONS = 100;
interface DraftSessionSnapshot {
  busy: boolean;
  entries: readonly HistoryEntry[];
  notice: string;
  position: number;
  preview: boolean;
  selected: string;
}
const EMPTY_DRAFT_SESSION: DraftSessionSnapshot = {
  entries: [],
  position: 0,
  selected: "0",
  busy: false,
  preview: false,
  notice: "Draft history stays in this tab. Saving remains manual.",
};

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function keyForAction(action: AgentAction) {
  return DRAFT_KEYS.find(
    (key) =>
      action.action === `set${key.charAt(0).toUpperCase()}${key.slice(1)}`
  );
}

function createAgentDraftSession(
  anchor: HTMLElement,
  read: () => InstanceDraftValue,
  publish: (snapshot: DraftSessionSnapshot) => void
) {
  const location = globalThis.location.href;
  const history = createHistory(agent, {
    within: anchor,
    keys: [...DRAFT_KEYS],
  });
  let alive = true;
  let epoch = 0;
  let busy = false;
  let selected = "0";
  let lastPosition = 0;
  let preview: Awaited<ReturnType<typeof stageChanges>> | null = null;
  let { notice } = EMPTY_DRAFT_SESSION;

  function emit() {
    if (!alive) {
      return;
    }
    if (history.entries().length > MAX_REVISIONS) {
      clear(
        "History reached 100 revisions and was cleared. The current draft is unchanged."
      );
      return;
    }
    if (lastPosition !== history.position()) {
      selected = String(history.position());
    }
    lastPosition = history.position();
    publish({
      entries: history.entries(),
      position: history.position(),
      selected,
      busy,
      preview: preview !== null,
      notice,
    });
  }
  function currentRef() {
    return history.entries().find((entry) => elementOf(entry.ref) === anchor)
      ?.ref;
  }
  function inScope() {
    return (
      alive &&
      anchor.isConnected &&
      location === globalThis.location.href &&
      useAgentAccessStore.getState().enabled &&
      currentRef() !== undefined
    );
  }
  function clear(
    message = "Draft history cleared. Current values are unchanged."
  ) {
    if (!alive) {
      return;
    }
    epoch += 1;
    useAgentAccessStore.getState().approval?.decide(false);
    preview = null;
    selected = "0";
    notice = message;
    history.clear();
  }
  async function run(
    work: () => Promise<string>,
    valueGuard?: (action: AgentAction) => boolean
  ) {
    if (busy || !inScope()) {
      return;
    }
    busy = true;
    const started = epoch;
    const guard = (action: AgentAction) =>
      inScope() && epoch === started && (!valueGuard || valueGuard(action));
    useAgentDraftStore.setState({ approvalGuard: guard });
    emit();
    try {
      const message = await work();
      setNotice(message, started);
    } catch {
      setNotice(
        "The draft operation did not finish. Review the current fields before trying again.",
        started
      );
    } finally {
      releaseGuard(guard);
      busy = false;
      emit();
    }
  }
  function changesFor(position: number): StagedChange[] {
    const ref = currentRef();
    if (ref === undefined) {
      return [];
    }
    return DRAFT_KEYS.flatMap((key) => {
      const first = history
        .entries()
        .find((entry) => entry.ref === ref && entry.key === key);
      if (!first) {
        return [];
      }
      const target = history
        .entries()
        .slice(0, position)
        .findLast(
          (entry) =>
            entry.ref === ref && entry.key === key && entry.reverted !== true
        );
      const value = target ? target.value : first.previous;
      return sameValue(read()[key], value) ? [] : [{ ref, key, value }];
    });
  }
  function currentlyApplied(change: { key: string; value: unknown }) {
    const key = DRAFT_KEYS.find((candidate) => candidate === change.key);
    return key !== undefined && sameValue(read()[key], change.value);
  }
  function previewNotice(actual: number, expected: number) {
    if (actual === expected && actual > 0) {
      return "Preview applied to the draft only. Keep it or revert it; saving remains manual.";
    }
    return "Preview was incomplete or refused. Review any applied fields before keeping or reverting them.";
  }
  function setNotice(message: string, started = epoch) {
    if (alive && epoch === started) {
      notice = message;
    }
  }
  function releaseGuard(guard: (action: AgentAction) => boolean) {
    if (useAgentDraftStore.getState().approvalGuard === guard) {
      useAgentDraftStore.setState({ approvalGuard: null });
    }
  }
  function matches(action: AgentAction, expected: Map<DraftKey, unknown>) {
    const key = keyForAction(action);
    return (
      action.ref === currentRef() &&
      key !== undefined &&
      expected.has(key) &&
      sameValue(read()[key], expected.get(key))
    );
  }
  async function applyPreview(
    changes: StagedChange[],
    target: number,
    started: number
  ) {
    if (changes.length === 0) {
      return "Selected revision already matches the current draft. Nothing was changed.";
    }
    const staged = await stageChanges(agent, changes);
    if (!inScope() || epoch !== started) {
      return "The draft scope changed; preview was stopped.";
    }
    const actual = staged.applied.filter((change) => currentlyApplied(change));
    preview = actual.length > 0 ? staged : null;
    if (preview) {
      selected = String(target);
    }
    return previewNotice(actual.length, changes.length);
  }
  const stop = history.subscribe(emit);
  useAgentDraftStore.setState({ clearDraft: clear });
  emit();
  return {
    select(value: string) {
      const position = Number(value);
      if (
        busy ||
        preview ||
        !Number.isInteger(position) ||
        position < 0 ||
        position > history.entries().length
      ) {
        return;
      }
      selected = value;
      emit();
    },
    undoAgent: () =>
      run(async () => {
        const failed = await history.undoSource("agent");
        return failed.length > 0
          ? "Some fields could not be restored. Later human edits and protected values were kept."
          : "Agent draft edits undone; later human edits are preserved. Nothing was saved.";
      }),
    seek: () =>
      run(async () => {
        const failed = await history.seek(Number(selected));
        return failed.length > 0
          ? "Some fields could not be restored. Review the current draft."
          : "Draft revision restored. Nothing was saved.";
      }),
    preview: () => {
      const target = Number(selected);
      const changes = changesFor(target);
      const before = new Map(DRAFT_KEYS.map((key) => [key, read()[key]]));
      const started = epoch;
      return run(
        () => applyPreview(changes, target, started),
        (action) => matches(action, before)
      );
    },
    keep() {
      if (busy || !preview || !inScope()) {
        return;
      }
      preview = null;
      selected = String(history.position());
      notice = "Current draft kept. Saving remains manual.";
      emit();
    },
    revert() {
      const staged = preview;
      if (!staged) {
        return Promise.resolve();
      }
      const expected = new Map<DraftKey, unknown>();
      for (const change of staged.applied) {
        const key = DRAFT_KEYS.find((candidate) => candidate === change.key);
        if (key) {
          expected.set(key, change.value);
        }
      }
      return run(
        async () => {
          const failed = await staged.revert();
          preview = null;
          const incomplete = staged.applied.some(
            (change) =>
              !currentlyApplied({ key: change.key, value: change.before })
          );
          return failed.length > 0 || incomplete
            ? "Some preview fields could not be reverted. Later edits, protected values, and refused changes were kept. Review the current draft."
            : "Preview reverted. Nothing was saved.";
        },
        (action) => matches(action, expected)
      );
    },
    clear,
    destroy() {
      if (!alive) {
        return;
      }
      alive = false;
      epoch += 1;
      preview = null;
      stop();
      history.destroy();
      history.clear();
      if (useAgentDraftStore.getState().clearDraft === clear) {
        useAgentDraftStore.setState({ clearDraft: null });
      }
      useAgentAccessStore.getState().approval?.decide(false);
    },
  };
}

export type { DraftSessionSnapshot };
export { createAgentDraftSession, EMPTY_DRAFT_SESSION };
