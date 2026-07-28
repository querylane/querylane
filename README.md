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
questions in `evals.yaml`. This uses the authenticated Claude Code CLI installed
on your machine. To use Codex instead, run:

```sh
bun run docs:eval -- --agent codex
```

The API reference is generated from `proto/`. Run `task proto:generate` after
changing an API contract.

## License

[AGPL-3.0](./LICENSE)
