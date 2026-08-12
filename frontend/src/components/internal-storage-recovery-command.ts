function quoteShellArgument(value: string) {
  return `'${value.split("'").join("'\\''")}'`;
}

function buildResetConfigCommand(configFilePath?: string) {
  if (!configFilePath || configFilePath === "~/.querylane/config.yaml") {
    return "querylane server reset-config --yes";
  }

  return `querylane server reset-config --yes --config ${quoteShellArgument(configFilePath)}`;
}

export { buildResetConfigCommand };
