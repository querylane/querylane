package postgres

import (
	"context"
	"testing"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/postgreserrors"
)

func TestGetInstanceOverviewClassifiesPartialMetricPostgresSQLErrors(t *testing.T) {
	t.Parallel()

	db := openTableMetadataErrorDB(t, &pgconn.PgError{
		Code:       pgerrcode.InsufficientPrivilege,
		Severity:   "ERROR",
		SchemaName: "pg_catalog",
	})
	defer db.Close()

	overview, err := (&Postgres{}).GetInstanceOverview(context.Background(), db)

	require.NoError(t, err)
	require.Nil(t, overview.Storage)

	metricErr := requireOverviewMetricError(t, overview.PartialErrors, "storage")

	var pgErr *postgreserrors.Error
	require.ErrorAs(t, metricErr.Err, &pgErr)
	assert.Equal(t, postgreserrors.KindPermissionDenied, pgErr.Classification().Kind)
	assert.Equal(t, pgerrcode.InsufficientPrivilege, pgErr.Classification().SQLState)
	assert.Equal(t, "query storage metrics", pgErr.Operation())
	assert.Equal(t, "pg_catalog", pgErr.Classification().ClientFields.SchemaName)
}

func requireOverviewMetricError(t *testing.T, partialErrors []engine.OverviewMetricError, metric string) engine.OverviewMetricError {
	t.Helper()

	for _, partialError := range partialErrors {
		if partialError.Metric == metric {
			return partialError
		}
	}

	require.Failf(t, "missing overview metric error", "metric %q not found in %#v", metric, partialErrors)

	return engine.OverviewMetricError{}
}
