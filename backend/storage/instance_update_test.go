package storage

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestMergeInstanceUpdatePatchReplacesLabelsMap(t *testing.T) {
	t.Parallel()

	current := &api.Instance{
		Name:        "instances/test",
		DisplayName: "Original",
		Labels:      map[string]string{"env": "test", "team": "platform"},
	}
	patch := &api.Instance{
		Name:        "instances/test",
		DisplayName: "Updated",
		Labels:      map[string]string{"team": "data"},
	}

	mergeInstanceUpdatePatch(current, patch, []string{"display_name", "labels"})

	require.Equal(t, "Updated", current.GetDisplayName())
	require.Equal(t, map[string]string{"team": "data"}, current.GetLabels())
}

func TestMergeInstanceUpdatePatchClearsLabelsMap(t *testing.T) {
	t.Parallel()

	current := &api.Instance{
		Name:   "instances/test",
		Labels: map[string]string{"env": "test"},
	}
	patch := &api.Instance{
		Name:   "instances/test",
		Labels: map[string]string{},
	}

	mergeInstanceUpdatePatch(current, patch, []string{"labels"})

	require.Empty(t, current.GetLabels())
}

func TestMergeInstanceUpdatePatchReplacesMaskedConfig(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		current    *api.Instance
		patch      *api.Instance
		paths      []string
		wantConfig *api.PostgresConfig
	}{
		{
			name: "config mask replaces password source with inline password",
			current: &api.Instance{
				Name:        "instances/test",
				DisplayName: "Original",
				Config: &api.PostgresConfig{
					Host:           "db.internal",
					Port:           5432,
					Database:       "prod",
					Username:       "querylane",
					PasswordSource: &api.SecretSource{Source: &api.SecretSource_Inline{Inline: "stale-secret"}},
				},
			},
			patch: &api.Instance{
				Name: "instances/test",
				Config: &api.PostgresConfig{
					Host:     "db.internal",
					Port:     5432,
					Database: "prod",
					Username: "querylane",
					Password: "new-password",
				},
			},
			paths: []string{"config"},
			wantConfig: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "new-password",
			},
		},
		{
			name: "config sub-field mask clears optional password source",
			current: &api.Instance{
				Name: "instances/test",
				Config: &api.PostgresConfig{
					Host:           "db.internal",
					Port:           5432,
					Database:       "prod",
					Username:       "querylane",
					Password:       "stored-secret",
					PasswordSource: &api.SecretSource{Source: &api.SecretSource_Inline{Inline: "stale-secret"}},
				},
			},
			patch: &api.Instance{
				Name:   "instances/test",
				Config: &api.PostgresConfig{},
			},
			paths: []string{"config.password_source"},
			wantConfig: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "stored-secret",
			},
		},
		{
			name: "config mask with redacted empty password keeps stored password",
			current: &api.Instance{
				Name: "instances/test",
				Config: &api.PostgresConfig{
					Host:     "db.internal",
					Port:     5432,
					Database: "prod",
					Username: "querylane",
					Password: "stored-secret",
				},
			},
			patch: &api.Instance{
				Name: "instances/test",
				Config: &api.PostgresConfig{
					Host:     "db2.internal",
					Port:     5432,
					Database: "prod",
					Username: "querylane",
				},
			},
			paths: []string{"config"},
			wantConfig: &api.PostgresConfig{
				Host:     "db2.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "stored-secret",
			},
		},
		{
			name: "config password sub-field mask with empty value keeps stored password",
			current: &api.Instance{
				Name: "instances/test",
				Config: &api.PostgresConfig{
					Host:     "db.internal",
					Port:     5432,
					Database: "prod",
					Username: "querylane",
					Password: "stored-secret",
				},
			},
			patch: &api.Instance{
				Name:   "instances/test",
				Config: &api.PostgresConfig{},
			},
			paths: []string{"config.password"},
			wantConfig: &api.PostgresConfig{
				Host:     "db.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "stored-secret",
			},
		},
		{
			name: "config scalar sub-field mask replaces only that field",
			current: &api.Instance{
				Name: "instances/test",
				Config: &api.PostgresConfig{
					Host:     "db.internal",
					Port:     5432,
					Database: "prod",
					Username: "querylane",
					Password: "stored-secret",
					SslMode:  api.PostgresConfig_SSL_MODE_REQUIRE,
				},
			},
			patch: &api.Instance{
				Name:   "instances/test",
				Config: &api.PostgresConfig{Host: "db2.internal"},
			},
			paths: []string{"config.host"},
			wantConfig: &api.PostgresConfig{
				Host:     "db2.internal",
				Port:     5432,
				Database: "prod",
				Username: "querylane",
				Password: "stored-secret",
				SslMode:  api.PostgresConfig_SSL_MODE_REQUIRE,
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			mergeInstanceUpdatePatch(tc.current, tc.patch, tc.paths)

			require.True(t, proto.Equal(tc.wantConfig, tc.current.GetConfig()),
				"merged config mismatch:\nwant: %v\ngot:  %v", tc.wantConfig, tc.current.GetConfig())
		})
	}
}

func TestFilterUpdateMaskRejectsLabelSubpaths(t *testing.T) {
	t.Parallel()

	repo := &PGInstanceRepository{}

	_, err := repo.filterUpdateMask(&fieldmaskpb.FieldMask{Paths: []string{"labels.env"}})

	require.ErrorIs(t, err, ErrInvalidInput)
	require.ErrorContains(t, err, `field path "labels.env" is not supported for updates`)
}
