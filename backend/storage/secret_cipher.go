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
	instanceSecretKeyEnv         = "QUERYLANE_INSTANCE_SECRET_KEY"
	previousInstanceSecretKeyEnv = "QUERYLANE_INSTANCE_SECRET_KEY_PREVIOUS"
	encryptedSecretPrefix        = "qlenc:v1:" //nolint:gosec // Marker prefix for ciphertext, not a credential.
)

var (
	ErrMissingInstanceSecretKey      = errors.New("instance secret encryption key is required")
	ErrUnreadableInstanceCredentials = errors.New("instance credentials are unreadable")
)

type secretCipher struct{ aead cipher.AEAD }

type secretKeyring struct {
	current  *secretCipher
	previous *secretCipher
}

func newSecretCipherFromEnvVar(name string) (*secretCipher, error) {
	keyText := os.Getenv(name)
	if keyText == "" {
		return nil, ErrMissingInstanceSecretKey
	}

	secrets, err := newSecretCipher(keyText)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", name, err)
	}

	return secrets, nil
}

func newSecretKeyringFromEnv(requireCurrent bool) (secretKeyring, error) {
	current, err := newSecretCipherFromEnvVar(instanceSecretKeyEnv)
	if err != nil {
		if !requireCurrent && errors.Is(err, ErrMissingInstanceSecretKey) {
			current = nil
		} else {
			return secretKeyring{}, err
		}
	}

	previousText := os.Getenv(previousInstanceSecretKeyEnv)
	if previousText == "" {
		return secretKeyring{current: current}, nil
	}

	if current == nil {
		return secretKeyring{}, fmt.Errorf("%s requires %s", previousInstanceSecretKeyEnv, instanceSecretKeyEnv)
	}

	previous, err := newSecretCipherFromEnvVar(previousInstanceSecretKeyEnv)
	if err != nil {
		return secretKeyring{}, err
	}

	return secretKeyring{current: current, previous: previous}, nil
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

	return nil, errors.New("secret encryption key must be base64-encoded 32 bytes, a raw 32-byte string, or sha256:<passphrase>")
}

func (k secretKeyring) plaintextForStorage(value string) (string, bool, error) {
	if value == "" {
		return value, false, nil
	}

	if !looksLikeEncryptedSecret(value) {
		return value, k.current != nil, nil
	}

	if k.current == nil {
		return "", false, fmt.Errorf("%w: set %s to read encrypted credentials", ErrMissingInstanceSecretKey, instanceSecretKeyEnv)
	}

	plaintext, currentErr := k.current.decrypt(value)
	if currentErr == nil {
		return plaintext, false, nil
	}

	if k.previous == nil {
		return "", false, fmt.Errorf(
			"%w: credentials do not match %s; set %s to the old key during rotation: %w",
			ErrUnreadableInstanceCredentials,
			instanceSecretKeyEnv,
			previousInstanceSecretKeyEnv,
			currentErr,
		)
	}

	plaintext, previousErr := k.previous.decrypt(value)
	if previousErr != nil {
		return "", false, fmt.Errorf(
			"%w: credentials match neither %s nor %s: %w",
			ErrUnreadableInstanceCredentials,
			instanceSecretKeyEnv,
			previousInstanceSecretKeyEnv,
			previousErr,
		)
	}

	return plaintext, true, nil
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

func looksLikeEncryptedSecret(value string) bool {
	if !strings.HasPrefix(value, encryptedSecretPrefix) {
		return false
	}

	blob, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, encryptedSecretPrefix))
	if err != nil {
		return false
	}

	return len(blob) >= 12+16
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
