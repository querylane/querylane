# Integration tests

This directory contains integration test utilities and tests that cover larger application surfaces.

## Structure

- `testutil/`: reusable test utilities for integration and end-to-end tests
  - `postgres.go`: PostgreSQL 18 (`postgres:18-alpine`) test container management for full-stack testing
  - `database.go`: database utilities for container-based testing
  - `suite.go`: base Testify suites for integration tests

## Usage

Run the backend integration suite with:

```sh
task backend:test:integration
```

The shared testcontainer uses `postgres:18-alpine`, so failures from the core RPC suite represent the latest PostgreSQL 18 image instead of a multi-version matrix. Storage-layer integration tests still use embedded PostgreSQL and are unaffected by this image.

Use these utilities for:

- **Server integration tests:** test HTTP endpoints with a real database.
- **Command integration tests:** test CLI commands end to end.
- **Full application end-to-end tests:** test complete user workflows.

For storage-layer unit and integration tests, use the embedded PostgreSQL utilities in the `storage/` package instead.
