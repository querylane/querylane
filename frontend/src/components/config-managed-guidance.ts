const DEFAULT_CONFIG_FILE_PATH = "~/.querylane/config.yaml";

function buildConfigManagedInstanceSnippet(configFilePath: string) {
  return `# ${configFilePath}
instances:
  - id: local
    display_name: Local PostgreSQL
    postgres_config:
      host: localhost
      port: 5432
      database: postgres
      username: postgres
      password: <password>
      ssl_mode: disable
`;
}

export { buildConfigManagedInstanceSnippet, DEFAULT_CONFIG_FILE_PATH };
