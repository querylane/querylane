package engine_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func newPagePayload() *api.ReadRowsPageTokenPayload {
	return &api.ReadRowsPageTokenPayload{
		Version:   1,
		TableName: "instances/x/databases/y/schemas/public/tables/customers",
		PageSize:  50,
		IssuedAt:  timestamppb.Now(),
		Strategy:  api.PaginationStrategy_PAGINATION_STRATEGY_KEYSET,
	}
}

func newCellPayload() *api.TableCellFullValueTokenPayload {
	return &api.TableCellFullValueTokenPayload{
		Version:   1,
		TableName: "instances/x/databases/y/schemas/public/tables/customers",
		Column:    "metadata",
		IssuedAt:  timestamppb.Now(),
	}
}

func TestTokenCodec_Roundtrip(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		kind engine.TokenKind
		make func() proto.Message
		into func() proto.Message
	}{
		{
			name: "ReadRowsPage",
			kind: engine.TokenKindReadRowsPage,
			make: func() proto.Message { return newPagePayload() },
			into: func() proto.Message { return &api.ReadRowsPageTokenPayload{} },
		},
		{
			name: "FullValueCell",
			kind: engine.TokenKindFullValueCell,
			make: func() proto.Message { return newCellPayload() },
			into: func() proto.Message { return &api.TableCellFullValueTokenPayload{} },
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			codec, err := engine.NewRandomTokenCodec()
			require.NoError(t, err)

			signed := tt.make()

			token, err := codec.Sign(tt.kind, signed)
			require.NoError(t, err)
			require.NotEmpty(t, token)

			got := tt.into()
			require.NoError(t, codec.Verify(tt.kind, token, got))

			assert.True(t, proto.Equal(signed, got), "decoded payload should match signed payload")
		})
	}
}

func TestTokenCodec_KindMismatchRejected(t *testing.T) {
	t.Parallel()

	codec, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	token, err := codec.Sign(engine.TokenKindReadRowsPage, newPagePayload())
	require.NoError(t, err)

	// Try to verify the same token under a different kind. proto.Unmarshal
	// across these two payload types might silently succeed (overlapping
	// field numbers), so the kind check must happen before unmarshal.
	err = codec.Verify(engine.TokenKindFullValueCell, token, &api.TableCellFullValueTokenPayload{})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrInvalidToken)
	assert.Contains(t, err.Error(), "kind mismatch")
}

func TestTokenCodec_TamperRejected(t *testing.T) {
	t.Parallel()

	codec, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	token, err := codec.Sign(engine.TokenKindReadRowsPage, newPagePayload())
	require.NoError(t, err)

	parts := strings.Split(token, ".")
	require.Len(t, parts, 3)

	tests := []struct {
		name    string
		segment int
	}{
		{name: "tampered_kind", segment: 0},
		{name: "tampered_payload", segment: 1},
		{name: "tampered_signature", segment: 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			tampered := make([]string, 3)
			copy(tampered, parts)

			// Mutate one byte in the middle of the chosen segment.
			seg := tampered[tt.segment]
			require.Greater(t, len(seg), 1)
			midPos := len(seg) / 2

			swap := byte('A')
			if seg[midPos] == 'A' {
				swap = 'B'
			}

			tampered[tt.segment] = seg[:midPos] + string(swap) + seg[midPos+1:]

			err := codec.Verify(engine.TokenKindReadRowsPage, strings.Join(tampered, "."), &api.ReadRowsPageTokenPayload{})
			require.Error(t, err)
			assert.ErrorIs(t, err, engine.ErrInvalidToken)
		})
	}
}

func TestTokenCodec_MalformedRejected(t *testing.T) {
	t.Parallel()

	codec, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	tests := []struct {
		name  string
		token string
	}{
		{name: "empty", token: ""},
		{name: "no_dots", token: "abc"},
		{name: "two_segments", token: "abc.def"},
		{name: "four_segments", token: "abc.def.ghi.jkl"},
		{name: "invalid_base64_kind", token: "!!!.def.ghi"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			err := codec.Verify(engine.TokenKindReadRowsPage, tt.token, &api.ReadRowsPageTokenPayload{})
			require.Error(t, err)
			assert.ErrorIs(t, err, engine.ErrInvalidToken)
		})
	}
}

func TestTokenCodec_DifferentKeyRejects(t *testing.T) {
	t.Parallel()

	codec1, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)
	codec2, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	token, err := codec1.Sign(engine.TokenKindReadRowsPage, newPagePayload())
	require.NoError(t, err)

	err = codec2.Verify(engine.TokenKindReadRowsPage, token, &api.ReadRowsPageTokenPayload{})
	require.Error(t, err)
	require.ErrorIs(t, err, engine.ErrInvalidToken)
	assert.Contains(t, err.Error(), "signature mismatch")
}

func TestTokenCodec_NilArgs(t *testing.T) {
	t.Parallel()

	codec, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	_, err = codec.Sign(engine.TokenKindReadRowsPage, nil)
	require.Error(t, err)

	_, err = codec.Sign(engine.TokenKind(""), newPagePayload())
	require.Error(t, err)

	tok, err := codec.Sign(engine.TokenKindReadRowsPage, newPagePayload())
	require.NoError(t, err)

	require.Error(t, codec.Verify(engine.TokenKindReadRowsPage, tok, nil))
}

func TestNewTokenCodec_PanicsOnEmptyKey(t *testing.T) {
	t.Parallel()

	defer func() {
		r := recover()
		require.NotNil(t, r, "expected panic for empty key")
	}()

	_ = engine.NewTokenCodec(nil)
}
