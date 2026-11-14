import type { AgentAction } from "@ui-sdk/react/agent";
import { create } from "zustand";
import { useAgentDraftStore } from "@/features/agent-drafts/agent-draft-state";

interface AgentApproval {
  action: AgentAction;
  decide: (approved: boolean) => void;
}

interface AgentAccessState {
  approval: AgentApproval | null;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const useAgentAccessStore = create<AgentAccessState>()((set, get) => ({
  approval: null,
  enabled: false,
  setEnabled(enabled) {
    get().approval?.decide(false);
    set({ enabled });
    if (!enabled) {
      useAgentDraftStore.getState().clearDraft?.();
      useAgentDraftStore.setState({ activity: [], approvalGuard: null });
    }
  },
}));

function requestAgentApproval(action: AgentAction, signal: AbortSignal) {
  const state = useAgentAccessStore.getState();
  // Database writes and SQL remain human-operated, even after session opt-in.
  if (
    !state.enabled ||
    action.confirm !== undefined ||
    signal.aborted ||
    state.approval
  ) {
    return Promise.resolve(false);
  }
  const { approvalGuard } = useAgentDraftStore.getState();
  if (approvalGuard && !approvalGuard(action)) {
    return Promise.resolve(false);
  }
  const location = globalThis.location.href;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    function decide(approved: boolean) {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", cancel);
      useAgentAccessStore.setState({ approval: null });
      resolve(
        approved &&
          useAgentAccessStore.getState().enabled &&
          globalThis.location.href === location &&
          !signal.aborted &&
          (!approvalGuard || approvalGuard(action))
      );
    }
    function cancel() {
      decide(false);
    }
    signal.addEventListener("abort", cancel, { once: true });
    useAgentAccessStore.setState({ approval: { action, decide } });
  });
}

export { requestAgentApproval, useAgentAccessStore };
