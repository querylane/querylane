function quoteShellArgument(value: string) {
  return `'${value.split("'").join("'\\''")}'`;
}

function buildResetConfigCommand(configFilePath?: string) {
  if (!configFilePath || configFilePath === "~/.querylane/config.yaml") {
    return "querylane server reset-config";
  }

  return `querylane server reset-config --config ${quoteShellArgument(configFilePath)}`;
}

export { buildResetConfigCommand };
