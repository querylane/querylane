package postgres

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
)

type workflowListCaptureDriver struct {
	state *workflowListCaptureState
}

type workflowListCaptureState struct {
	query     string
	args      []driver.NamedValue
	installed bool
	queryErr  error
}

type workflowListCaptureConn struct {
	state *workflowListCaptureState
}

type workflowListEmptyRows struct{}

type workflowListInstalledRows struct {
	installed bool
	read      bool
}

var workflowListCaptureDriverSeq atomic.Int64

func openWorkflowListCaptureDB(t *testing.T) (*sql.DB, *workflowListCaptureState) {
	t.Helper()

	state := &workflowListCaptureState{installed: true}
	name := fmt.Sprintf("querylane_workflow_list_capture_%d", workflowListCaptureDriverSeq.Add(1))
	sql.Register(name, &workflowListCaptureDriver{state: state})

	db, err := sql.Open(name, "")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })

	return db, state
}

func (d *workflowListCaptureDriver) Open(string) (driver.Conn, error) {
	return &workflowListCaptureConn{state: d.state}, nil
}

func (c *workflowListCaptureConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c *workflowListCaptureConn) Close() error { return nil }

func (c *workflowListCaptureConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions unsupported")
}

func (c *workflowListCaptureConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(query, "FROM pg_catalog.pg_extension") {
		return &workflowListInstalledRows{installed: c.state.installed}, nil
	}

	c.state.query = query

	c.state.args = append([]driver.NamedValue(nil), args...)
	if c.state.queryErr != nil {
		return nil, c.state.queryErr
	}

	return workflowListEmptyRows{}, nil
}

func (workflowListEmptyRows) Columns() []string {
	return []string{"instance_id", "label", "function_name", "status", "execution_count", "created_at"}
}

func (workflowListEmptyRows) Close() error { return nil }

func (workflowListEmptyRows) Next([]driver.Value) error { return io.EOF }

func (*workflowListInstalledRows) Columns() []string { return []string{"exists"} }

func (*workflowListInstalledRows) Close() error { return nil }

func (r *workflowListInstalledRows) Next(dest []driver.Value) error {
	if r.read {
		return io.EOF
	}

	dest[0] = r.installed
	r.read = true

	return nil
}

func TestListWorkflowsDefaultsToStableNewestFirstOrder(t *testing.T) {
	t.Parallel()

	db, captured := openWorkflowListCaptureDB(t)
	_, _, err := (&Postgres{}).ListWorkflows(context.Background(), db, aip.Params{PageSize: 1})
	require.NoError(t, err)

	require.Contains(t, captured.query, "ORDER BY COALESCE(i.created_at, TIMESTAMPTZ 'epoch') DESC, i.id DESC")
}

func TestListWorkflowsAppliesStatusBeforeItsPageWindow(t *testing.T) {
	t.Parallel()

	db, captured := openWorkflowListCaptureDB(t)
	_, _, err := (&Postgres{}).ListWorkflows(context.Background(), db, aip.Params{
		Filter:   `status = "failed"`,
		PageSize: 1,
	})
	require.NoError(t, err)

	statusIndex := strings.Index(captured.query, "COALESCE(i.status, '') = $1")
	limitIndex := strings.Index(captured.query, "LIMIT 2")

	require.NotEqual(t, -1, statusIndex)
	require.NotEqual(t, -1, limitIndex)
	require.Less(t, statusIndex, limitIndex)
	require.Equal(t, "failed", captured.args[0].Value)
}

func TestListWorkflowsHydratesOnlyTheRequestedPage(t *testing.T) {
	t.Parallel()

	db, captured := openWorkflowListCaptureDB(t)
	_, _, err := (&Postgres{}).ListWorkflows(context.Background(), db, aip.Params{PageSize: 1})
	require.NoError(t, err)

	limitIndex := strings.Index(captured.query, "LIMIT 2")
	hydrateIndex := strings.Index(captured.query, "LEFT JOIN LATERAL df.instance_info")

	require.NotEqual(t, -1, limitIndex)
	require.NotEqual(t, -1, hydrateIndex)
	require.Less(t, limitIndex, hydrateIndex, "the materialized candidate page must be bounded before hydration")
	require.NotContains(t, captured.query, "FROM df.list_instances")
}

func TestListWorkflowsRejectsIncompleteFunctionNameFiltering(t *testing.T) {
	t.Parallel()

	db, _ := openWorkflowListCaptureDB(t)
	_, _, err := (&Postgres{}).ListWorkflows(context.Background(), db, aip.Params{
		Filter: `function_name:"process"`,
	})

	require.ErrorIs(t, err, engine.ErrInvalidFilter)
}

func TestListWorkflowsConfirmsPgDurableIsAbsent(t *testing.T) {
	t.Parallel()

	db, captured := openWorkflowListCaptureDB(t)
	captured.installed = false

	_, _, err := (&Postgres{}).ListWorkflows(context.Background(), db, aip.Params{})

	require.ErrorIs(t, err, engine.ErrDurableNotInstalled)
	require.Empty(t, captured.query, "an absent extension must stop before querying df objects")
}

func TestListWorkflowsDoesNotCallAnInstalledButIncompatibleExtensionAbsent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		err  error
	}{
		{
			name: "missing metadata table",
			err:  &pgconn.PgError{Code: "42P01", Message: `relation "df.instances" does not exist`},
		},
		{
			name: "missing hydration function",
			err:  &pgconn.PgError{Code: "42883", Message: "function df.instance_info(text) does not exist"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			db, captured := openWorkflowListCaptureDB(t)
			captured.queryErr = tt.err

			_, _, err := (&Postgres{}).ListWorkflows(context.Background(), db, aip.Params{})

			require.Error(t, err)
			require.ErrorIs(t, err, engine.ErrQueryInvalid)
			require.NotErrorIs(t, err, engine.ErrDurableNotInstalled)
			require.NotEmpty(t, captured.query, "an installed extension must reach the version-specific query")
		})
	}
}
