package sqlsvc

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
)

func TestTimeoutWithPostgresGrace(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		timeout time.Duration
		want    time.Duration
	}{
		{name: "disabled", timeout: 0, want: 0},
		{name: "small timeout gets minimum grace", timeout: 25 * time.Millisecond, want: 75 * time.Millisecond},
		{name: "normal timeout gets ten percent grace", timeout: 2 * time.Second, want: 2200 * time.Millisecond},
		{name: "large timeout gets capped grace", timeout: 60 * time.Second, want: 60500 * time.Millisecond},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.want, timeoutWithPostgresGrace(tt.timeout))
		})
	}
}

func TestValidateReadOnlyStatementAcceptsReadQueries(t *testing.T) {
	t.Parallel()

	statements := []string{
		"SELECT id FROM public.customers LIMIT 5",
		"WITH recent AS (SELECT 1 AS id) SELECT id FROM recent",
		"VALUES (1), (2)",
		"SHOW search_path",
		"/* explainable */ SELECT ';' AS semicolon",
		"SELECT $$not a ; delimiter$$ AS body",
		"SELECT comment, share, start, merge FROM subscriptions ORDER BY start",
	}

	for _, statement := range statements {
		t.Run(statement, func(t *testing.T) {
			t.Parallel()

			require.NoError(t, validateReadOnlyStatement(statement))
		})
	}
}

func TestValidateReadOnlyStatementDefersUnknownStartsToPostgres(t *testing.T) {
	t.Parallel()

	require.NoError(t, validateReadOnlyStatement("SELEC 1"))
}

func TestValidateReadOnlyStatementRejectsNonReadQueries(t *testing.T) {
	t.Parallel()

	statements := []string{
		"",
		"   ",
		"SELECT 1; SELECT 2",
		"INSERT INTO customers(id) VALUES (1)",
		"UPDATE customers SET name = 'x'",
		"DELETE FROM customers",
		"DROP TABLE customers",
		"CREATE TABLE scratch(id int)",
		"ALTER TABLE customers ADD COLUMN scratch text",
		"TRUNCATE customers",
		"VACUUM customers",
		"ANALYZE customers",
		"CALL refresh_customers()",
		"DO $$ BEGIN RAISE NOTICE 'x'; END $$",
		"BEGIN READ ONLY",
		"COMMIT",
		"SET search_path = public",
		"SELECT * INTO scratch_customers FROM customers",
		"SELECT * FROM customers FOR SHARE",
		"EXPLAIN SELECT 1",
	}

	for _, statement := range statements {
		t.Run(strings.ReplaceAll(statement, " ", "_"), func(t *testing.T) {
			t.Parallel()

			err := validateReadOnlyStatement(statement)
			require.Error(t, err)
			require.ErrorIs(t, err, engine.ErrQueryInvalid)
		})
	}
}
