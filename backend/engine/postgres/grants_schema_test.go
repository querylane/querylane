package postgres

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
)

func TestGrantSchemasAcceptPG17MaintainPrivilegeFilter(t *testing.T) {
	t.Parallel()

	t.Run("role grants", func(t *testing.T) {
		t.Parallel()
		requireMaintainPlan(t, grantCoreSchema)
	})
	t.Run("public grants", func(t *testing.T) {
		t.Parallel()
		requireMaintainPlan(t, publicGrantCoreSchema)
	})
	t.Run("default privileges", func(t *testing.T) {
		t.Parallel()
		requireMaintainPlan(t, defaultPrivilegeCoreSchema)
	})
}

func requireMaintainPlan[M any](t *testing.T, schema *aip.Schema[M]) {
	t.Helper()

	_, err := aip.BuildPlan(schema, aip.Params{
		Filter:  `privilege = "MAINTAIN"`,
		OrderBy: "privilege asc",
	})
	require.NoError(t, err, "BuildPlan() rejected MAINTAIN privilege filter")
}
