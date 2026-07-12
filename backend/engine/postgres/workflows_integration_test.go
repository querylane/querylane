package postgres_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/engine/postgres"
	"github.com/querylane/querylane/backend/integration/testutil"
)

const workflowTerminalWaitTimeout = 2 * time.Minute

// TestWorkflowsIntegration exercises the workflow engine queries against a
// real pg_durable installation. It is opt-in: set
// QUERYLANE_TEST_PGDURABLE_IMAGE=ghcr.io/microsoft/pg_durable:pg17 to run it
// (the image is amd64-only and pg_durable is preview, so required CI does not
// depend on it).
func TestWorkflowsIntegration(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("skipping integration test; run without -short")
	}

	// t.Cleanup, not defer: the parallel subtests outlive this function body,
	// so a deferred cancel would kill their context before they run.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	t.Cleanup(cancel)

	container := testutil.RequirePgDurableContainer(ctx, t)
	t.Cleanup(func() {
		_ = container.Cleanup(context.Background())
	})

	// Install the extension and seed a submitter role plus a table the
	// workflows operate on. Submissions run as a non-superuser LOGIN role,
	// mirroring how querylane connects to managed instances.
	for _, statement := range []string{
		"CREATE EXTENSION IF NOT EXISTS pg_durable;",
		"CREATE ROLE wf_submitter LOGIN PASSWORD 'wf';",
		"CREATE ROLE wf_stranger LOGIN PASSWORD 'wf';",
		// wf_nogrant is deliberately NOT granted df.grant_usage, exercising the
		// installed-but-not-granted path (the common least-privilege state).
		"CREATE ROLE wf_nogrant LOGIN PASSWORD 'wf';",
		"SELECT df.grant_usage('wf_submitter');",
		"SELECT df.grant_usage('wf_stranger');",
		"CREATE TABLE wf_docs(id int PRIMARY KEY, processed bool DEFAULT false);",
		"INSERT INTO wf_docs SELECT g, false FROM generate_series(1, 20) g;",
		"GRANT ALL ON wf_docs TO wf_submitter;",
	} {
		require.NoError(t, container.ExecSQL(ctx, statement), "setup statement: %s", statement)
	}

	submitterDB := openWorkflowDB(ctx, t, container, "wf_submitter")
	strangerDB := openWorkflowDB(ctx, t, container, "wf_stranger")
	superuserDB := openWorkflowDB(ctx, t, container, "")

	completedID := startWorkflow(ctx, t, submitterDB,
		`SELECT df.start('SELECT id FROM wf_docs WHERE processed = false LIMIT 5' |=> 'batch' ~> 'UPDATE wf_docs SET processed = true WHERE id IN (SELECT id FROM $batch.*)', 'it-completed')`)
	failedID := startWorkflow(ctx, t, submitterDB,
		`SELECT df.start('SELECT count(*) FROM wf_missing_table', 'it-failed')`)

	waitForWorkflowStatus(ctx, t, submitterDB, completedID, "completed")
	waitForWorkflowStatus(ctx, t, submitterDB, failedID, "failed")

	tokens, err := engine.NewRandomTokenCodec()
	require.NoError(t, err)

	eng := postgres.New(tokens)

	t.Run("list workflows returns submitted instances", func(t *testing.T) {
		t.Parallel()

		workflows, nextToken, err := eng.ListWorkflows(ctx, submitterDB, aip.Params{PageSize: 50})
		require.NoError(t, err)
		assert.Empty(t, nextToken)
		require.Len(t, workflows, 2)
		assert.False(t, workflows[0].CreateTime.IsZero())
		assert.False(t, workflows[1].CreateTime.IsZero())
		assert.False(t, workflows[0].CreateTime.Before(workflows[1].CreateTime), "default order must be newest first")

		byID := map[string]engine.Workflow{}
		for _, workflow := range workflows {
			byID[workflow.ID] = workflow
		}

		completed := byID[completedID]
		assert.Equal(t, "it-completed", completed.Label)
		assert.Equal(t, "completed", completed.Status)
		assert.NotEmpty(t, completed.FunctionName)
		assert.Positive(t, completed.ExecutionCount)

		failed := byID[failedID]
		assert.Equal(t, "it-failed", failed.Label)
		assert.Equal(t, "failed", failed.Status)
		// The list surface omits output by design; it is asserted via
		// GetWorkflow below.
		assert.Empty(t, failed.Output)
	})

	t.Run("list workflows filters on status", func(t *testing.T) {
		t.Parallel()

		workflows, _, err := eng.ListWorkflows(ctx, submitterDB, aip.Params{
			Filter:   `status = "failed"`,
			PageSize: 50,
		})
		require.NoError(t, err)
		require.Len(t, workflows, 1)
		assert.Equal(t, failedID, workflows[0].ID)
	})

	t.Run("list workflows paginates with a keyset token", func(t *testing.T) {
		t.Parallel()

		first, token, err := eng.ListWorkflows(ctx, submitterDB, aip.Params{PageSize: 1})
		require.NoError(t, err)
		require.Len(t, first, 1)
		require.NotEmpty(t, token)

		second, lastToken, err := eng.ListWorkflows(ctx, submitterDB, aip.Params{PageSize: 1, PageToken: token})
		require.NoError(t, err)
		require.Len(t, second, 1)
		assert.Empty(t, lastToken)
		assert.NotEqual(t, first[0].ID, second[0].ID)
	})

	t.Run("rls hides other submitters and superuser sees all", func(t *testing.T) {
		t.Parallel()

		asStranger, _, err := eng.ListWorkflows(ctx, strangerDB, aip.Params{PageSize: 50})
		require.NoError(t, err)
		assert.Empty(t, asStranger)

		asSuperuser, _, err := eng.ListWorkflows(ctx, superuserDB, aip.Params{PageSize: 50})
		require.NoError(t, err)
		assert.Len(t, asSuperuser, 2)
	})

	t.Run("get workflow returns instance_info fields", func(t *testing.T) {
		t.Parallel()

		workflow, err := eng.GetWorkflow(ctx, submitterDB, completedID)
		require.NoError(t, err)
		assert.Equal(t, completedID, workflow.ID)
		assert.Equal(t, "it-completed", workflow.Label)
		assert.Equal(t, "completed", workflow.Status)
		assert.NotEmpty(t, workflow.FunctionVersion)
		assert.NotEmpty(t, workflow.CurrentExecutionID)
		assert.False(t, workflow.CreateTime.IsZero())

		// Output lives on the detail surface (df.instance_info), not the list.
		failed, err := eng.GetWorkflow(ctx, submitterDB, failedID)
		require.NoError(t, err)
		assert.NotEmpty(t, failed.Output, "a failed workflow reports its error as output")
	})

	t.Run("get workflow maps unknown ids to not found", func(t *testing.T) {
		t.Parallel()

		_, err := eng.GetWorkflow(ctx, submitterDB, "does-not-exist")
		require.ErrorIs(t, err, engine.ErrWorkflowNotFound)
	})

	t.Run("list workflow nodes returns the latest execution graph", func(t *testing.T) {
		t.Parallel()

		nodes, nextToken, err := eng.ListWorkflowNodes(ctx, submitterDB, completedID, aip.Params{PageSize: 50})
		require.NoError(t, err)
		assert.Empty(t, nextToken)
		// 'a' ~> 'b' builds a THEN root with two SQL children.
		require.Len(t, nodes, 3)

		var thenNode *engine.WorkflowNode

		for i := range nodes {
			assert.NotEmpty(t, nodes[i].NodeID)
			assert.Equal(t, "completed", nodes[i].Status)

			if nodes[i].NodeType == "THEN" {
				thenNode = &nodes[i]
			}
		}

		require.NotNil(t, thenNode, "expected a THEN root node")
		assert.NotNil(t, thenNode.LeftNode)
		assert.NotNil(t, thenNode.RightNode)
	})

	t.Run("role without df.grant_usage maps to access-denied sentinel", func(t *testing.T) {
		t.Parallel()

		nograntDB := openWorkflowDB(ctx, t, container, "wf_nogrant")

		_, _, err := eng.ListWorkflows(ctx, nograntDB, aip.Params{PageSize: 50})
		require.ErrorIs(t, err, engine.ErrDurableAccessDenied)

		_, err = eng.GetWorkflow(ctx, nograntDB, "anything")
		require.ErrorIs(t, err, engine.ErrDurableAccessDenied)
	})

	t.Run("missing extension maps to a dedicated sentinel", func(t *testing.T) {
		t.Parallel()

		_, err := container.CreateDatabase(ctx, "wf_bare")
		require.NoError(t, err)

		bareDB, err := container.ConnectToDatabase(ctx, "wf_bare")
		require.NoError(t, err)
		t.Cleanup(func() { _ = bareDB.Close() })

		_, _, err = eng.ListWorkflows(ctx, bareDB, aip.Params{PageSize: 50})
		require.ErrorIs(t, err, engine.ErrDurableNotInstalled)

		_, err = eng.GetWorkflow(ctx, bareDB, "anything")
		require.ErrorIs(t, err, engine.ErrDurableNotInstalled)
	})
}

// openWorkflowDB opens a pooled connection to the maintenance database as the
// given role (empty role means the container superuser) and registers cleanup.
func openWorkflowDB(ctx context.Context, t *testing.T, container *testutil.PostgreSQLContainer, role string) *sql.DB {
	t.Helper()

	var (
		connString string
		err        error
	)

	if role == "" {
		connString, err = container.ConnectionString(ctx)
	} else {
		connString, err = container.DatabaseConnectionStringForUser(ctx, "postgres", role, "wf")
	}

	require.NoError(t, err)

	db, err := sql.Open("pgx", connString)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	require.NoError(t, db.PingContext(ctx))

	return db
}

func startWorkflow(ctx context.Context, t *testing.T, db *sql.DB, statement string) string {
	t.Helper()

	var instanceID string
	require.NoError(t, db.QueryRowContext(ctx, statement).Scan(&instanceID))
	require.NotEmpty(t, instanceID)

	return instanceID
}

// waitForWorkflowStatus polls df.status until the instance reaches the
// expected status, failing on timeout or an unexpected terminal state.
func waitForWorkflowStatus(ctx context.Context, t *testing.T, db *sql.DB, instanceID, expected string) {
	t.Helper()

	deadline := time.Now().Add(workflowTerminalWaitTimeout)

	for {
		var status string
		require.NoError(t, db.QueryRowContext(ctx, "SELECT df.status($1)", instanceID).Scan(&status))

		if status == expected {
			return
		}

		terminal := status == "completed" || status == "failed" || status == "cancelled"
		if terminal || time.Now().After(deadline) {
			t.Fatalf("workflow %s reached status %q while waiting for %q", instanceID, status, expected)
		}

		select {
		case <-ctx.Done():
			t.Fatalf("context done while waiting for workflow %s: %v", instanceID, ctx.Err())
		case <-time.After(500 * time.Millisecond):
		}
	}
}
