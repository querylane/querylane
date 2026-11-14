import { elementOf, observe } from "@ui-sdk/core/observe";
import { useAgentAccessStore } from "@/features/user-settings/agent-access";
import { useAgentDraftStore } from "./agent-draft-state";

const MAX_ACTIVITY = 100;
const MAX_ACTIVITY_LABEL_LENGTH = 120;
let nextActivityId = 0;
let stop: (() => void) | undefined;
function initializeUiObservation() {
  stop ??= observe((change) => {
    if (
      !useAgentAccessStore.getState().enabled ||
      change.value === "[redacted]" ||
      change.previous === "[redacted]"
    ) {
      return;
    }
    const element = elementOf(change.ref);
    if (
      !element?.isConnected ||
      element.closest(
        '[data-agent-hidden]:not([data-agent-hidden="false"]), [data-agent-secret]:not([data-agent-secret="false"]), input[type="password"]'
      )
    ) {
      return;
    }
    // Activity stores provenance only. Field values, row text, SQL, and credentials never enter this log.
    nextActivityId += 1;
    useAgentDraftStore.setState((state) => ({
      activity: [
        ...state.activity,
        {
          id: nextActivityId,
          component: change.component,
          key: change.key,
          label: (change.label ?? change.component).slice(
            0,
            MAX_ACTIVITY_LABEL_LENGTH
          ),
          reason: change.reason,
          source: change.source,
        },
      ].slice(-MAX_ACTIVITY),
    }));
  });
  return () => {
    stop?.();
    stop = undefined;
  };
}

export { initializeUiObservation };
