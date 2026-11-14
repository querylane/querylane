import { createAgent, registerTools } from "@ui-sdk/react/agent";
import { requestAgentApproval, useAgentAccessStore } from "./agent-access";

const agent = createAgent({
  allow: (action, { signal }) => requestAgentApproval(action, signal),
});

function registerAgentTools() {
  return registerTools(agent, {
    allow: () => useAgentAccessStore.getState().enabled,
  });
}

export { agent, registerAgentTools };
