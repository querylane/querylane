# Querylane

Self-hosted PostgreSQL admin UI for managing multiple servers.

## Documentation

Run the documentation site locally with [Blume](https://useblume.dev/):

```sh
bun install
bun run docs:dev
```

Use `bun run docs:build` to verify the site.

Run `bun run docs:eval` to test whether the docs answer the critical questions
in `evals.yaml`. The command uses the Codex CLI with an OpenAI API key. Install
and authenticate Codex before running it locally:

```sh
npm install --global @openai/codex
printenv OPENAI_API_KEY | codex login --with-api-key
bun run docs:eval
```

Pull request CI does not run paid evals automatically. Use the manual GitHub Actions workflow,
`docs-eval`, when you want a paid eval. It maps the
`OPENAI_API_KEY` repository secret to Codex only for its eval step. Select the
branch and run the workflow from GitHub Actions. OpenAI bills API-key usage at
standard API rates.

The API reference is generated from `proto/`. Run `task proto:generate` after
changing an API contract.

## License

[AGPL-3.0](./LICENSE)
