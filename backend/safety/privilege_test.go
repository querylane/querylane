package safety

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/querylane/querylane/backend/engine"
	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type startupPrivilegeInstanceReader struct {
	instances []*api.Instance
}

func (r startupPrivilegeInstanceReader) ListInstances(context.Context, int32, string, string, string) ([]*api.Instance, string, error) {
	return r.instances, "", nil
}

func (startupPrivilegeInstanceReader) GetInstance(context.Context, string) (*api.Instance, error) {
	return nil, errors.New("not used")
}

type failingStartupPrivilegeSessions struct {
	err error
}

func (s failingStartupPrivilegeSessions) OpenInstance(context.Context, resource.InstanceName) (engine.InstanceSession, error) {
	return nil, s.err
}

func TestLogPrivilegedInstanceRolesReportsProbeFailures(t *testing.T) { //nolint:paralleltest // replaces process-global slog default
	var logs bytes.Buffer

	previous := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	LogPrivilegedInstanceRoles(t.Context(), startupPrivilegeInstanceReader{
		instances: []*api.Instance{{Name: "instances/prod"}},
	}, failingStartupPrivilegeSessions{err: errors.New("dial refused")})

	output := logs.String()
	assert.Contains(t, output, "could not check PostgreSQL role privileges", output)
	assert.Contains(t, output, "instance=instances/prod", output)
	assert.Contains(t, output, `error="dial refused"`, output)
}
