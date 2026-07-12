package storage

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

const (
	instanceSecretKeyEnv  = "QUERYLANE_INSTANCE_SECRET_KEY"
	encryptedSecretPrefix = "qlenc:v1:" //nolint:gosec // Marker prefix for ciphertext, not a credential.
)

var (
	ErrMissingInstanceSecretKey      = errors.New("instance secret encryption key is required")
	ErrUnreadableInstanceCredentials = errors.New("instance credentials are unreadable")
)

type secretCipher struct{ aead cipher.AEAD }

func newSecretCipherFromEnv() (*secretCipher, error) {
	keyText := os.Getenv(instanceSecretKeyEnv)
	if keyText == "" {
		return nil, ErrMissingInstanceSecretKey
	}

	return newSecretCipher(keyText)
}

func newSecretCipher(keyText string) (*secretCipher, error) {
	key, err := decodeSecretKey(keyText)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("invalid instance secret encryption key: %w", err)
	}

	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create instance secret cipher: %w", err)
	}

	return &secretCipher{aead: aead}, nil
}

func decodeSecretKey(value string) ([]byte, error) {
	if decoded, err := base64.StdEncoding.DecodeString(value); err == nil && len(decoded) == 32 {
		return decoded, nil
	}

	if len(value) == 32 {
		return []byte(value), nil
	}

	if after, ok := strings.CutPrefix(value, "sha256:"); ok {
		sum := sha256.Sum256([]byte(after))
		return sum[:], nil
	}

	return nil, fmt.Errorf("%s must be base64-encoded 32 bytes, a raw 32-byte string, or sha256:<passphrase>", instanceSecretKeyEnv)
}

func (c *secretCipher) encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return plaintext, nil
	}

	if c == nil {
		return "", fmt.Errorf("%w: set %s for API-managed instance credentials", ErrMissingInstanceSecretKey, instanceSecretKeyEnv)
	}

	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate instance secret nonce: %w", err)
	}

	sealed := c.aead.Seal(nil, nonce, []byte(plaintext), nil)
	blob := make([]byte, 0, len(nonce)+len(sealed))
	blob = append(blob, nonce...)
	blob = append(blob, sealed...)

	return encryptedSecretPrefix + base64.StdEncoding.EncodeToString(blob), nil
}

func (c *secretCipher) decrypt(value string) (string, error) {
	if value == "" || !strings.HasPrefix(value, encryptedSecretPrefix) {
		return value, nil
	}

	if c == nil {
		return "", fmt.Errorf("%w: set %s to read encrypted instance credentials", ErrMissingInstanceSecretKey, instanceSecretKeyEnv)
	}

	blob, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encryptedSecretPrefix))
	if err != nil {
		return "", fmt.Errorf("decode encrypted instance secret: %w", err)
	}

	if len(blob) < c.aead.NonceSize() {
		return "", errors.New("encrypted instance secret is truncated")
	}

	nonce := blob[:c.aead.NonceSize()]
	ciphertext := blob[c.aead.NonceSize():]

	plain, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt instance secret: %w", err)
	}

	return string(plain), nil
}
