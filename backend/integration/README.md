# Integration Tests

This directory contains integration test utilities and tests that cover larger application surfaces.

## Structure

- `testutil/` - Reusable test utilities for integration and e2e tests
  - `postgres.go` - PostgreSQL 18 (`postgres:18-alpine`) testcontainer management for full-stack testing
  - `database.go` - Database utilities for container-based testing
  - `suite.go` - Base testify suites for integration tests

## Usage

Run the backend integration suite with:

```sh
task backend:test:integration
```

The shared testcontainer uses `postgres:18-alpine`, so failures from the core RPC suite represent the latest PostgreSQL 18 image instead of a multi-version matrix. Storage-layer integration tests still use embedded PostgreSQL and are unaffected by this image.

These utilities are designed for:
- **Server Integration Tests**: Testing HTTP endpoints with real database
- **Command Integration Tests**: Testing CLI commands end-to-end
- **Full Application E2E Tests**: Complete user workflows

For storage layer unit/integration tests, use the embedded postgres utilities in the `storage/` package instead.