package postgres

import (
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

const (
	defaultPreviewBytes = 8 * 1024
	maxPreviewBytes     = 1 * 1024 * 1024

	// Response-byte budget defaults / hard caps.
	defaultResponseBytes = 8 * 1024 * 1024  // 8 MiB
	maxResponseBytesCap  = 32 * 1024 * 1024 // 32 MiB

	// Emergency cell cap applied to PREVIEW-eligible cells of the very
	// first row when even one row exceeds the response budget.
	emergencyCellBytes = 1024

	// maxPageSize is the hard cap on a single ReadRows page.
	maxPageSize = 500

	// defaultReadTimeout is the per-statement timeout applied to ReadRows
	// and ReadCellValue. Capped server-side so a pathological filter or
	// large TOAST detoast can't tie up a connection forever.
	defaultReadTimeout = 30 * time.Second

	// SQL alias suffixes used in projected rows. Size companions track the
	// un-truncated byte length of a preview cell; cursor companions carry
	// the un-truncated ORDER BY value for keyset pagination.
	sizeAliasSuffix   = "__qlsize"
	cursorAliasSuffix = "__qlcursor"

	// ctidColumn is PostgreSQL's hidden physical-row pointer pseudo-column,
	// used as a synthetic identity when a table has no primary key. It is
	// referenced bare (never quoted).
	ctidColumn = "ctid"
)

// previewEligible reports whether a column may be truncated under
// CELL_VALUE_MODE_PREVIEW. Text-family, jsonb, bytea, xml, and array
// columns are eligible. Numeric/integer/boolean/timestamp values are
// bounded in size and never truncated.
func previewEligible(col engine.Column) bool {
	switch col.DataType { //nolint:exhaustive // explicit allow-list
	case api.DataType_DATA_TYPE_STRING,
		api.DataType_DATA_TYPE_BINARY,
		api.DataType_DATA_TYPE_JSON,
		api.DataType_DATA_TYPE_ARRAY:
		return true
	}

	return col.RawType == "xml"
}

// truncationProjection emits the SELECT expression(s) for a single column
// under PREVIEW mode. For preview-eligible columns it returns two
// comma-separated expressions:
//
//	<truncated_value> AS "<name>", <octet_length(name)> AS "<name>__qlsize"
//
// For other columns it returns just the quoted identifier. Callers that
// want to know whether a `__qlsize` companion was emitted should check
// previewEligible(col) directly.
func truncationProjection(col engine.Column, maxChars int) string {
	if !previewEligible(col) {
		return quoteIdent(col.Name)
	}

	q := quoteIdent(col.Name)
	sizeAlias := quoteIdent(col.Name + sizeAliasSuffix)

	switch col.DataType { //nolint:exhaustive // matches previewEligible allow-list
	case api.DataType_DATA_TYPE_BINARY:
		return fmt.Sprintf("substring(%s FROM 1 FOR %d) AS %s, octet_length(%s) AS %s", q, maxChars, q, q, sizeAlias)
	case api.DataType_DATA_TYPE_JSON, api.DataType_DATA_TYPE_ARRAY:
		// Render jsonb/json/arrays to text so left()/octet_length apply.
		return fmt.Sprintf("left((%s)::text, %d) AS %s, octet_length((%s)::text) AS %s", q, maxChars, q, q, sizeAlias)
	case api.DataType_DATA_TYPE_STRING:
		// substring(text, 1, N) is character-based — see proto comment.
		return fmt.Sprintf("substring(%s, 1, %d) AS %s, octet_length(%s) AS %s", q, maxChars, q, q, sizeAlias)
	}

	// xml fallback (raw_type == "xml" but DATA_TYPE_UNKNOWN).
	return fmt.Sprintf("left((%s)::text, %d) AS %s, octet_length((%s)::text) AS %s", q, maxChars, q, q, sizeAlias)
}

// resolveMaxCellChars returns the effective per-cell preview cap (in
// PostgreSQL characters / bytea bytes), clamped to [1, maxPreviewBytes].
// Zero or negative input means "use the server default".
func resolveMaxCellChars(requested int) int {
	if requested <= 0 {
		return defaultPreviewBytes
	}

	if requested > maxPreviewBytes {
		return maxPreviewBytes
	}

	return requested
}

// trimUTF8 returns s truncated to at most maxBytes, never slicing
// mid-rune. Walks back from maxBytes to the nearest UTF-8 rune start so
// the resulting prefix is always valid UTF-8.
func trimUTF8(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}

	cut := maxBytes
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}

	return s[:cut]
}

// resolveMaxResponseBytes returns the effective per-response wire-byte cap.
// Zero or negative input means "use the server default" (8 MiB). The hard
// cap is 32 MiB regardless of what the caller asks for.
func resolveMaxResponseBytes(requested int64) int64 {
	if requested <= 0 {
		return defaultResponseBytes
	}

	if requested > maxResponseBytesCap {
		return maxResponseBytesCap
	}

	return requested
}
