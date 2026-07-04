package engine

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/protobuf/proto"
)

// TokenKind disambiguates payload types in the HMAC envelope. The kind
// is included in the HMAC computation, so a token signed for one purpose
// (e.g. ReadRows pagination) cannot be replayed against another endpoint
// (e.g. ReadCellValue) — even when proto.Unmarshal would otherwise silently
// succeed against a structurally-similar message.
type TokenKind string

const (
	// TokenKindReadRowsPage signs ReadRowsPageTokenPayload values.
	TokenKindReadRowsPage TokenKind = "v1/read-rows-page" //nolint:gosec // G101: identifier, not a credential

	// TokenKindFullValueCell signs TableCellFullValueTokenPayload values.
	TokenKindFullValueCell TokenKind = "v1/full-value-cell" //nolint:gosec // G101: identifier, not a credential

	// TokenKindRowKey is reserved for row_key issuance and is unused in v1.
	TokenKindRowKey TokenKind = "v1/row-key"
)

// TokenCodec produces and verifies opaque tokens carrying proto payloads.
//
// Wire format:
//
//	base64url(kind_bytes) "." base64url(payload_bytes) "." base64url(hmac_sha256(kind_bytes||payload_bytes, key))
//
// A token signed for one TokenKind cannot be verified against another, even
// when both payload types share field numbers — the kind is part of the HMAC.
type TokenCodec struct {
	key []byte
}

// ErrInvalidToken indicates a token is malformed, tampered, signed with an
// unknown key, or has the wrong kind for the verifying call.
var ErrInvalidToken = errors.New("invalid token")

// NewTokenCodec returns a codec backed by the given HMAC key. Use
// NewRandomTokenCodec for the v1 process-random key path.
func NewTokenCodec(key []byte) *TokenCodec {
	if len(key) == 0 {
		panic("engine: TokenCodec requires a non-empty key") //nolint:forbidigo // programmer error during DI setup
	}

	cp := make([]byte, len(key))
	copy(cp, key)

	return &TokenCodec{key: cp}
}

// NewRandomTokenCodec generates a 32-byte random key from crypto/rand and
// returns a codec bound to it. Tokens signed by this codec become invalid
// once the process is restarted; callers tolerate that by treating
// pagination as best-effort across restarts.
//
// TODO(table-data): persist the key in the meta DB so tokens survive
// restart and an explicit rotation operation can be added later.
func NewRandomTokenCodec() (*TokenCodec, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("engine: generate token signing key: %w", err)
	}

	return &TokenCodec{key: key}, nil
}

// Sign returns a wire-form token for the given kind and proto payload.
// Marshalling uses deterministic output so identical payloads produce
// identical tokens (callers may rely on that for cache keys).
func (c *TokenCodec) Sign(kind TokenKind, m proto.Message) (string, error) {
	if kind == "" {
		return "", errors.New("engine: empty token kind")
	}

	if m == nil {
		return "", errors.New("engine: nil token payload")
	}

	payload, err := proto.MarshalOptions{Deterministic: true}.Marshal(m)
	if err != nil {
		return "", fmt.Errorf("engine: marshal token payload: %w", err)
	}

	kindBytes := []byte(kind)
	mac := hmac.New(sha256.New, c.key)
	mac.Write(kindBytes)
	mac.Write(payload)
	sig := mac.Sum(nil)

	enc := base64.RawURLEncoding

	return enc.EncodeToString(kindBytes) + "." + enc.EncodeToString(payload) + "." + enc.EncodeToString(sig), nil
}

// Verify decodes a wire-form token, checks that its kind matches `kind`,
// validates the HMAC, and unmarshals the payload into `into`.
//
// Returns ErrInvalidToken on any decode / kind / hmac / unmarshal failure.
func (c *TokenCodec) Verify(kind TokenKind, token string, into proto.Message) error {
	if into == nil {
		return errors.New("engine: nil token target")
	}

	enc := base64.RawURLEncoding

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return fmt.Errorf("%w: expected 3 segments", ErrInvalidToken)
	}

	kindBytes, err := enc.DecodeString(parts[0])
	if err != nil {
		return fmt.Errorf("%w: decode kind: %w", ErrInvalidToken, err)
	}

	if string(kindBytes) != string(kind) {
		return fmt.Errorf("%w: kind mismatch", ErrInvalidToken)
	}

	payload, err := enc.DecodeString(parts[1])
	if err != nil {
		return fmt.Errorf("%w: decode payload: %w", ErrInvalidToken, err)
	}

	sig, err := enc.DecodeString(parts[2])
	if err != nil {
		return fmt.Errorf("%w: decode signature: %w", ErrInvalidToken, err)
	}

	mac := hmac.New(sha256.New, c.key)
	mac.Write(kindBytes)
	mac.Write(payload)
	expected := mac.Sum(nil)

	if !hmac.Equal(sig, expected) {
		return fmt.Errorf("%w: signature mismatch", ErrInvalidToken)
	}

	if err := proto.Unmarshal(payload, into); err != nil {
		return fmt.Errorf("%w: unmarshal payload: %w", ErrInvalidToken, err)
	}

	return nil
}
