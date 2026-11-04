package readmask_test

import (
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/fieldmaskpb"

	v1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/service/readmask"
)

func TestProjection(t *testing.T) {
	t.Parallel()
	original := &v1.Role{Name: "instances/test/roles/user", RoleName: "user", Comment: "description", Attributes: &v1.RoleAttributes{CanLogin: true, ConnectionLimit: 5}}
	tests := []struct {
		name    string
		paths   []string
		want    *v1.Role
		invalid bool
	}{
		{name: "omitted", want: original},
		{name: "empty", paths: []string{}, want: original},
		{name: "wildcard", paths: []string{"*"}, want: original},
		{name: "nested", paths: []string{"name", "attributes.can_login"}, want: &v1.Role{Name: original.Name, Attributes: &v1.RoleAttributes{CanLogin: true}}},
		{name: "parent wins", paths: []string{"attributes.can_login", "attributes"}, want: &v1.Role{Attributes: original.Attributes}},
		{name: "unknown", paths: []string{"unknown"}, invalid: true},
		{name: "invalid nested", paths: []string{"role_name.unknown"}, invalid: true},
		{name: "mixed wildcard", paths: []string{"*", "name"}, invalid: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var mask *fieldmaskpb.FieldMask
			if tt.paths != nil {
				mask = &fieldmaskpb.FieldMask{Paths: tt.paths}
			}
			projection, err := readmask.New(mask, &v1.Role{})
			if tt.invalid {
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
				return
			}
			require.NoError(t, err)
			projected := proto.Clone(original)
			projection.Apply(projected)
			assert.True(t, proto.Equal(tt.want, projected), "got %v", projected)
			assert.Equal(t, int32(5), original.GetAttributes().GetConnectionLimit(), "cached source must not be mutated")
		})
	}
}
