import type { AgentAction } from "@ui-sdk/react/agent";
import { create } from "zustand";

interface UiActivity {
  component: string;
  id: number;
  key: string;
  label: string;
  reason: string;
  source: string;
}
interface AgentDraftState {
  activity: UiActivity[];
  approvalGuard: ((action: AgentAction) => boolean) | null;
  clearDraft: (() => void) | null;
}
const useAgentDraftStore = create<AgentDraftState>()(() => ({
  activity: [],
  approvalGuard: null,
  clearDraft: null,
}));

export type { UiActivity };
export { useAgentDraftStore };
