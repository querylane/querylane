# Querylane

Postgres admin UI for managing multiple PostgreSQL servers.

## Documentation

Run the documentation site locally with [Blume](https://useblume.dev/):

```sh
bun install
bun run docs:dev
```

Use `bun run docs:build` to verify the site.

The API reference is generated from `proto/`. Run `task proto:generate` after
changing an API contract.

## License

[AGPL-3.0](./LICENSE)
