package postgres

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func newTestPostgres(t *testing.T) *Postgres {
	t.Helper()

	codec, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	return New(codec)
}

func TestTrimUTF8(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		input    string
		maxBytes int
		want     string
	}{
		{"under_max", "hello", 100, "hello"},
		{"exactly_max", "hello", 5, "hello"},
		{"ascii_cut", "hello world", 5, "hello"},
		{
			// "héllo" — 'é' is 2 bytes (0xC3 0xA9). Cutting at byte 2 would
			// leave a dangling continuation byte; trimUTF8 must rewind.
			name:     "rewind_to_rune_start",
			input:    "héllo",
			maxBytes: 2,
			want:     "h",
		},
		{
			// 4-byte rune (emoji); cutting inside it must rewind entirely.
			name:     "emoji_rewind",
			input:    "ab😀cd",
			maxBytes: 3,
			want:     "ab",
		},
		{"zero_max", "abc", 0, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := trimUTF8(tc.input, tc.maxBytes)
			assert.Equal(t, tc.want, got)
			assert.True(t, utf8.ValidString(got), "result must be valid UTF-8")
			assert.LessOrEqual(t, len(got), tc.maxBytes, "result must be at most maxBytes")
		})
	}
}

// TestPreviewProjection confirms BINARY columns project zero content
// bytes (size companion only) while every other preview-eligible type
// delegates to truncationProjection unchanged.
func TestPreviewProjection(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		col  engine.Column
		want string
	}{
		{
			name: "binary_ships_zero_bytes",
			col:  engine.Column{Name: "blob", DataType: api.DataType_DATA_TYPE_BINARY},
			want: `substring("blob" FROM 1 FOR 0) AS "blob", octet_length("blob") AS "blob__qlsize"`,
		},
		{
			name: "string_delegates",
			col:  engine.Column{Name: "description", DataType: api.DataType_DATA_TYPE_STRING},
			want: truncationProjection(engine.Column{Name: "description", DataType: api.DataType_DATA_TYPE_STRING}, 64),
		},
		{
			name: "json_delegates",
			col:  engine.Column{Name: "payload", DataType: api.DataType_DATA_TYPE_JSON},
			want: truncationProjection(engine.Column{Name: "payload", DataType: api.DataType_DATA_TYPE_JSON}, 64),
		},
		{
			name: "xml_delegates",
			col:  engine.Column{Name: "doc", DataType: api.DataType_DATA_TYPE_UNKNOWN, RawType: "xml"},
			want: truncationProjection(engine.Column{Name: "doc", DataType: api.DataType_DATA_TYPE_UNKNOWN, RawType: "xml"}, 64),
		},
		{
			name: "non_eligible_delegates",
			col:  engine.Column{Name: "id", DataType: api.DataType_DATA_TYPE_INTEGER},
			want: `"id"`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tc.want, previewProjection(tc.col, 64))
		})
	}
}

// TestApplyEmergencyTruncation_StringPreservesFullSize confirms a cell
// that wasn't previously preview-truncated gets `full_size_bytes` set
// from the original byte length.
func TestApplyEmergencyTruncation_StringPreservesFullSize(t *testing.T) {
	t.Parallel()

	orig := strings.Repeat("a", 2048)

	row := &api.TableResultRow{
		Values: []*api.TableCell{
			{Value: &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: orig}}},
		},
	}

	cols := []engine.Column{{Name: "payload", DataType: api.DataType_DATA_TYPE_STRING}}

	changed, err := applyEmergencyTruncation(newTestPostgres(t), row, cols, &api.RowIdentity{}, nil, "instances/x/databases/y/schemas/z/tables/t")
	require.NoError(t, err)
	require.True(t, changed)

	cell := row.GetValues()[0]
	assert.True(t, cell.GetTruncated())
	assert.Equal(t, int64(2048), cell.GetFullSizeBytes(), "must record original byte length")
	assert.LessOrEqual(t, len(cell.GetValue().GetStringValue()), emergencyCellBytes)
}

// TestApplyEmergencyTruncation_StringUTF8Safe confirms a multi-byte
// string that would split mid-rune at emergencyCellBytes gets rewound.
func TestApplyEmergencyTruncation_StringUTF8Safe(t *testing.T) {
	t.Parallel()

	// Build a ~2 KiB string of 3-byte runes so emergencyCellBytes=1024
	// lands mid-rune (1024 % 3 == 1, falling on a continuation byte).
	rune3 := "あ" // 3 bytes in UTF-8
	orig := strings.Repeat(rune3, 700)

	row := &api.TableResultRow{
		Values: []*api.TableCell{
			{Value: &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: orig}}},
		},
	}

	cols := []engine.Column{{Name: "payload", DataType: api.DataType_DATA_TYPE_STRING}}

	changed, err := applyEmergencyTruncation(newTestPostgres(t), row, cols, &api.RowIdentity{}, nil, "instances/x/databases/y/schemas/z/tables/t")
	require.NoError(t, err)
	require.True(t, changed)

	got := row.GetValues()[0].GetValue().GetStringValue()
	assert.True(t, utf8.ValidString(got), "truncated string must remain valid UTF-8")
	assert.LessOrEqual(t, len(got), emergencyCellBytes)
	assert.Equal(t, int64(len(orig)), row.GetValues()[0].GetFullSizeBytes())
}

// TestApplyEmergencyTruncation_BytesByteBoundary confirms bytea cells cut
// on byte boundaries (no UTF-8 concern) and full size is preserved.
func TestApplyEmergencyTruncation_BytesByteBoundary(t *testing.T) {
	t.Parallel()

	orig := make([]byte, 2048)
	for i := range orig {
		orig[i] = byte(i % 256)
	}

	row := &api.TableResultRow{
		Values: []*api.TableCell{
			{Value: &api.TableValue{Kind: &api.TableValue_BytesValue{BytesValue: orig}}},
		},
	}

	cols := []engine.Column{{Name: "blob", DataType: api.DataType_DATA_TYPE_BINARY}}

	changed, err := applyEmergencyTruncation(newTestPostgres(t), row, cols, &api.RowIdentity{}, nil, "instances/x/databases/y/schemas/z/tables/t")
	require.NoError(t, err)
	require.True(t, changed)

	cell := row.GetValues()[0]
	assert.True(t, cell.GetTruncated())
	assert.Equal(t, int64(2048), cell.GetFullSizeBytes())
	assert.Len(t, cell.GetValue().GetBytesValue(), emergencyCellBytes)
}

// TestApplyEmergencyTruncation_PreservesPriorFullSize confirms a cell
// that was already preview-truncated keeps its original FullSizeBytes
// rather than being overwritten with the post-preview length.
func TestApplyEmergencyTruncation_PreservesPriorFullSize(t *testing.T) {
	t.Parallel()

	// Cell is already in the "preview-truncated" state: short payload,
	// truncated=true, full_size_bytes points at the real on-disk size.
	row := &api.TableResultRow{
		Values: []*api.TableCell{
			{
				Value:         &api.TableValue{Kind: &api.TableValue_StringValue{StringValue: strings.Repeat("a", 2048)}},
				Truncated:     true,
				FullSizeBytes: 5000,
			},
		},
	}

	cols := []engine.Column{{Name: "payload", DataType: api.DataType_DATA_TYPE_STRING}}

	changed, err := applyEmergencyTruncation(newTestPostgres(t), row, cols, &api.RowIdentity{}, nil, "instances/x/databases/y/schemas/z/tables/t")
	require.NoError(t, err)
	require.True(t, changed)

	cell := row.GetValues()[0]
	assert.True(t, cell.GetTruncated())
	assert.Equal(t, int64(5000), cell.GetFullSizeBytes(), "preview-set FullSizeBytes must survive emergency re-truncation")
}

// TestApplyEmergencyTruncation_SkipsNonPreviewEligibleColumns confirms
// response-budget emergency trimming cannot mutate numeric identity-like cells.
func TestApplyEmergencyTruncation_SkipsNonPreviewEligibleColumns(t *testing.T) {
	t.Parallel()

	row := &api.TableResultRow{
		Values: []*api.TableCell{
			{Value: &api.TableValue{Kind: &api.TableValue_Int64Value{Int64Value: 42}}},
		},
	}
	cols := []engine.Column{{Name: "id", DataType: api.DataType_DATA_TYPE_INTEGER}}

	changed, err := applyEmergencyTruncation(newTestPostgres(t), row, cols, &api.RowIdentity{}, nil, "instances/x/databases/y/schemas/z/tables/t")
	require.NoError(t, err)

	assert.False(t, changed)
	assert.False(t, row.GetValues()[0].GetTruncated())
	assert.Empty(t, row.GetValues()[0].GetFullValueToken())
	assert.Equal(t, int64(42), row.GetValues()[0].GetValue().GetInt64Value())
}
