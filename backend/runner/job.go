package runner

import (
	"context"

	"github.com/querylane/querylane/backend/storage"
)

type Job interface {
	Config() Config
	ListTargets(ctx context.Context) ([]string, error)
	Run(ctx context.Context, target string) (RunResult, error)
}

// Commit persists collected data inside the manager-supplied meta-DB
// transaction. The same transaction also marks the runner execution
// successful, so a failing Commit cleanly rolls back both.
type Commit func(ctx context.Context, exec storage.QueryExecutor) error

// RunResult is the successful outcome of one target run. A zero value means
// the job applied its policy but has nothing to persist.
type RunResult struct {
	Commit Commit
}
