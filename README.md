# Querylane

Postgres admin UI for managing multiple PostgreSQL servers.

## Documentation

Run the documentation site locally with [Blume](https://useblume.dev/):

```sh
bun install
bun run docs:dev
```

Use `bun run docs:build` to verify the site.

Run `bun run docs:eval` to test whether the docs answer the critical reader
questions in `evals.yaml`. This uses the Codex CLI with an OpenAI API key. For
local runs, install Codex and authenticate it first:

```sh
npm install --global @openai/codex
printenv OPENAI_API_KEY | codex login --with-api-key
bun run docs:eval
```

To keep API spending opt-in, pull request CI does not run evals automatically.
The `docs-eval` manual GitHub Actions workflow maps the `OPENAI_API_KEY`
repository secret to Codex only for its eval step. Select the branch and run the
workflow from GitHub Actions when you want a paid eval. OpenAI bills API-key
usage at standard API rates.

The API reference is generated from `proto/`. Run `task proto:generate` after
changing an API contract.

## License

[AGPL-3.0](./LICENSE)
