// Only opt-in code belongs in this boundary. The eager observer/store and
// instance-draft model stay in core, even though they share the feature directory.
const AGENT_TOOLS_MODULE_PATTERN =
  /(?:node_modules[/\\]@ui-sdk[/\\](?:core[/\\]dist[/\\](?:page[/\\](?:agent|history)[/\\]|(?:agent|history)\.)|react[/\\]dist[/\\](?:agent|history)\.)|src[/\\](?:features[/\\](?:user-settings[/\\]agent-tools\.|agent-drafts[/\\](?:agent-draft-panel|agent-draft-session|draft-revisions)\.)|components[/\\]querylane-ui[/\\]draft-revisions\.))/u;

function isAgentToolsModulePath(path: string) {
  return AGENT_TOOLS_MODULE_PATTERN.test(path);
}

export { AGENT_TOOLS_MODULE_PATTERN, isAgentToolsModulePath };
