package postgres

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/querylane/querylane/backend/engine"
)

func TestSummarizeUnqueryablePGStatStatements(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		health engine.PGStatStatementsHealth
		want   string
	}{
		{
			name:   "preload state hidden from role",
			health: engine.PGStatStatementsHealth{SharedPreloadKnown: false},
			want:   "pg_stat_statements is installed but not queryable; the connecting role cannot read shared_preload_libraries to verify it is loaded (requires pg_read_all_settings): boom",
		},
		{
			name:   "known not preloaded",
			health: engine.PGStatStatementsHealth{SharedPreloadKnown: true, SharedPreloadConfigured: false},
			want:   "pg_stat_statements is installed but not in shared_preload_libraries",
		},
		{
			name:   "preloaded but view still fails",
			health: engine.PGStatStatementsHealth{SharedPreloadKnown: true, SharedPreloadConfigured: true},
			want:   "pg_stat_statements is installed but not queryable: boom",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tc.want, summarizeUnqueryablePGStatStatements(tc.health, errors.New("boom")))
		})
	}
}
