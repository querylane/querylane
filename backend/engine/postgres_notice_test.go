package engine

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFormatPostgresNoticeIncludesUsefulFields(t *testing.T) {
	t.Parallel()

	got := formatPostgresNotice(&pgconn.Notice{
		SeverityUnlocalized: "WARNING",
		Code:                "01000",
		Message:             "querylane warning",
		Detail:              "row 7 was skipped",
		Hint:                "inspect the source table",
		Position:            42,
		Where:               "PL/pgSQL function ql_notice() line 3",
	})

	assert.Contains(t, got, "WARNING 01000: querylane warning")
	assert.Contains(t, got, "DETAIL: row 7 was skipped")
	assert.Contains(t, got, "HINT: inspect the source table")
	assert.Contains(t, got, "POSITION: 42")
	assert.Contains(t, got, "WHERE: PL/pgSQL function ql_notice() line 3")
}

func TestTruncateNoticeStaysWithinByteCapAndKeepsValidUTF8(t *testing.T) {
	t.Parallel()

	got := truncateNotice(strings.Repeat("a", maxPostgresNoticeBytes) + "🙂")

	require.LessOrEqual(t, len(got), maxPostgresNoticeBytes)
	assert.True(t, utf8.ValidString(got))
	assert.True(t, strings.HasSuffix(got, truncatedNoticeSuffix))
}

func TestPostgresNoticeCollectorReportsOmittedNoticesWithQuerylaneMarker(t *testing.T) {
	t.Parallel()

	collector := &postgresNoticeCollector{}
	for range maxPostgresNotices + 2 {
		collector.add(&pgconn.Notice{SeverityUnlocalized: "NOTICE", Code: "00000", Message: "chatty"})
	}

	notices := collector.snapshot()

	require.Len(t, notices, maxPostgresNotices+1)
	assert.Equal(t, "QUERYLANE_NOTICE_TRUNCATED: 2 additional database notices omitted", notices[len(notices)-1])
}

func TestPostgresNoticeSlotIgnoresNoticesWithoutCollector(t *testing.T) {
	t.Parallel()

	slot := &postgresNoticeSlot{}

	require.NotPanics(t, func() {
		slot.add(&pgconn.Notice{SeverityUnlocalized: "NOTICE", Message: "outside querylane session"})
	})
}
