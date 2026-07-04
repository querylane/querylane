export function buildConfigPreview(configPath: string) {
  return `database:
  host: localhost
  port: 5432
  database: querylane
  username: querylane
  password: <your-password>
  ssl_mode: disable

# Querylane watches this file for changes:
# ${configPath}
`;
}
