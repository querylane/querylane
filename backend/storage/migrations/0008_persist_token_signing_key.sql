-- +goose Up
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

CREATE TABLE IF NOT EXISTS token_signing_key (
    -- The v1 row is shared by every backend replica. Material is a base64 key,
    -- optionally wrapped in the existing qlenc:v1 AES-GCM envelope.
    id TEXT PRIMARY KEY,
    material TEXT NOT NULL
);

-- +goose Down
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '5s';

DROP TABLE IF EXISTS token_signing_key;
