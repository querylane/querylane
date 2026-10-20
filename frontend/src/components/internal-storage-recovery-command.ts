import { isNonEmptyString } from "@/lib/value-guards";

function quoteShellArgument(value: string) {
  return `'${value.split("'").join("'\\''")}'`;
}

function buildResetConfigCommand(configFilePath?: string) {
  if (
    !isNonEmptyString(configFilePath) ||
    configFilePath === "~/.querylane/config.yaml"
  ) {
    return 'querylane server reset-config --yes --config "$HOME/.querylane/config.yaml"';
  }

  return `querylane server reset-config --yes --config ${quoteShellArgument(configFilePath)}`;
}

export { buildResetConfigCommand };
