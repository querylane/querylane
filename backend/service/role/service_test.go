package role

import (
	"context"
	"errors"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

type fakeOpener struct {
	opened resource.InstanceName
	sess   *fakeRoleSession
	err    error
}

func (f *fakeOpener) OpenInstance(_ context.Context, name resource.InstanceName) (engine.InstanceSession, error) {
	f.opened = name
	return f.sess, f.err
}

type fakeRoleSession struct {
	params          aip.Params
	roles           []engine.Role
	token           string
	closed          bool
	err             error
	getRoleName     string
	getRole         *engine.Role
	getRoleErr      error
	dbSession       *fakeDatabaseSession
	openDatabaseErr error
	openedDatabase  string
}

type fakeDatabaseSession struct {
	engine.DatabaseSession

	params            aip.Params
	roleName          string
	grants            []engine.RoleGrant
	ownedObjects      []engine.OwnedObject
	defaultPrivileges []engine.RoleDefaultPrivilege
	publicGrants      []engine.RoleGrant
	token             string
	err               error
	closed            bool
}

// Prober is never exercised by role tests.
func (f *fakeDatabaseSession) Prober() engine.DatabaseProber { return nil }

func (f *fakeDatabaseSession) ListRoleGrants(_ context.Context, roleName string, params aip.Params) ([]engine.RoleGrant, string, error) {
	f.roleName = roleName
	f.params = params

	return f.grants, f.token, f.err
}

func (f *fakeDatabaseSession) ListRoleOwnedObjects(_ context.Context, roleName string, params aip.Params) ([]engine.OwnedObject, string, error) {
	f.roleName = roleName
	f.params = params

	return f.ownedObjects, f.token, f.err
}

func (f *fakeDatabaseSession) ListRoleDefaultPrivileges(_ context.Context, roleName string, params aip.Params) ([]engine.RoleDefaultPrivilege, string, error) {
	f.roleName = roleName
	f.params = params

	return f.defaultPrivileges, f.token, f.err
}

func (f *fakeDatabaseSession) ListPublicGrants(_ context.Context, params aip.Params) ([]engine.RoleGrant, string, error) {
	f.params = params

	return f.publicGrants, f.token, f.err
}

func (f *fakeDatabaseSession) Close() error {
	f.closed = true
	return nil
}

func (f *fakeRoleSession) GetServerInfo(_ context.Context) (*engine.ServerInfo, error) {
	return nil, errors.New("not used in tests")
}

func (f *fakeRoleSession) GetInstanceOverview(_ context.Context) (*engine.InstanceOverview, error) {
	return nil, errors.New("not used in tests")
}

func (f *fakeRoleSession) CheckInstanceHealth(_ context.Context) (*engine.InstanceHealth, error) {
	return nil, errors.New("not used in tests")
}

func (f *fakeRoleSession) CheckInstanceActivity(_ context.Context) (*engine.InstanceHealth, error) {
	return nil, errors.New("not used in tests")
}

// Prober is never exercised by role tests; the probe surface lives on a
// separate interface precisely so this fake ignores it.
func (f *fakeRoleSession) Prober() engine.InstanceProber { return nil }

func (f *fakeRoleSession) ListDatabases(_ context.Context, _ aip.Params) ([]engine.Database, string, error) {
	return nil, "", errors.New("not used in tests")
}

func (f *fakeRoleSession) GetDatabase(_ context.Context, _ string) (*engine.Database, error) {
	return nil, errors.New("not used in tests")
}

func (f *fakeRoleSession) OpenDatabase(_ context.Context, name string) (engine.DatabaseSession, error) {
	f.openedDatabase = name
	if f.openDatabaseErr != nil {
		return nil, f.openDatabaseErr
	}

	return f.dbSession, nil
}

func (f *fakeRoleSession) ListRoles(_ context.Context, params aip.Params) ([]engine.Role, string, error) {
	f.params = params
	return f.roles, f.token, f.err
}

func (f *fakeRoleSession) GetRole(_ context.Context, roleName string) (*engine.Role, error) {
	f.getRoleName = roleName
	return f.getRole, f.getRoleErr
}

func (f *fakeRoleSession) Close() error {
	f.closed = true
	return nil
}

func TestListRoles(t *testing.T) {
	t.Parallel()

	validUntil := time.Date(2030, time.January, 1, 0, 0, 0, 0, time.UTC)

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListRolesRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRolesResponse], err error)
	}{
		{
			name: "opens instance and converts roles",
			opener: &fakeOpener{sess: &fakeRoleSession{
				roles: []engine.Role{{
					Name: "app/user",
					Attributes: engine.RoleAttributes{
						CanLogin:          true,
						CanCreateDatabase: true,
						CanCreateRole:     true,
						BypassesRLS:       true,
						InheritsByDefault: true,
						ConnectionLimit:   -1,
						ValidUntil:        &validUntil,
						ConfigParameters:  []string{"work_mem=64MB", "search_path=public"},
					},
					MemberOf: []engine.RoleMembership{{
						RoleName:      "app_writer",
						AdminOption:   true,
						InheritOption: true,
						SetOption:     true,
						Grantor:       "postgres",
					}},
				}},
				token: "next",
			}},
			req: &v1alpha1.ListRolesRequest{
				Parent:    "instances/prod",
				PageSize:  25,
				PageToken: "page-1",
				OrderBy:   "name desc",
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRolesResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				assert.Equal(t, aip.Params{PageSize: 25, PageToken: "page-1", OrderBy: "name desc"}, opener.sess.params)
				assert.True(t, opener.sess.closed)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				roles := res.Msg.GetRoles()
				require.Len(t, roles, 1)
				got := roles[0]
				assert.Equal(t, "instances/prod/roles/YXBwL3VzZXI", got.GetName())
				assert.Equal(t, "app/user", got.GetRoleName())
				assert.True(t, got.GetAttributes().GetCanLogin())
				assert.True(t, got.GetAttributes().GetCanCreateDatabase())
				assert.True(t, got.GetAttributes().GetCanCreateRole())
				assert.True(t, got.GetAttributes().GetBypassesRls())
				assert.Equal(t, int32(-1), got.GetAttributes().GetConnectionLimit())
				require.NotNil(t, got.GetAttributes().GetValidUntil())
				assert.Equal(t, validUntil, got.GetAttributes().GetValidUntil().AsTime())
				assert.Equal(t, []string{"work_mem=64MB", "search_path=public"}, got.GetAttributes().GetConfigParameters())
				require.Len(t, got.GetMemberOf(), 1)
				membership := got.GetMemberOf()[0]
				assert.Equal(t, "app_writer", membership.GetRoleName())
				assert.Equal(t, resource.NewRoleName("prod", "app_writer").String(), membership.GetRole())
				assert.True(t, membership.GetAdminOption())
				assert.Equal(t, "postgres", membership.GetGrantor())
				assert.Equal(t, resource.NewRoleName("prod", "postgres").String(), membership.GetGrantorRole())
			},
		},
		{
			name:   "rejects invalid parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListRolesRequest{Parent: "databases/prod"},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRolesResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
		{
			// Filter validation lives in the engine (aip.BuildPlan rejects
			// filters the schema does not support); the service just passes
			// the filter through.
			name:   "passes filter through to the session",
			opener: &fakeOpener{sess: &fakeRoleSession{}},
			req: &v1alpha1.ListRolesRequest{
				Parent: "instances/prod",
				Filter: "name = 'postgres'",
			},
			assertion: func(t *testing.T, opener *fakeOpener, _ *connect.Response[v1alpha1.ListRolesResponse], err error) {
				t.Helper()
				require.NoError(t, err)
				assert.Equal(t, "name = 'postgres'", opener.sess.params.Filter)
			},
		},
		{
			name:   "maps open error",
			opener: &fakeOpener{err: errors.New("boom")},
			req:    &v1alpha1.ListRolesRequest{Parent: "instances/prod"},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRolesResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListRoles(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestGetRole(t *testing.T) {
	t.Parallel()

	roleName := resource.NewRoleName("prod", "app/user").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.GetRoleRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.GetRoleResponse], err error)
	}{
		{
			name: "opens instance and converts role",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole: &engine.Role{
					Name:       "app/user",
					Attributes: engine.RoleAttributes{CanLogin: true, ConnectionLimit: -1},
					Comment:    "Primary application role.",
					MemberOf: []engine.RoleMembership{{
						RoleName:    "app_writer",
						AdminOption: true,
						Grantor:     "postgres",
					}},
				},
			}},
			req: &v1alpha1.GetRoleRequest{Name: roleName},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.GetRoleResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				assert.Equal(t, "app/user", opener.sess.getRoleName)
				assert.True(t, opener.sess.closed)

				got := res.Msg.GetRole()
				assert.Equal(t, roleName, got.GetName())
				assert.Equal(t, "app/user", got.GetRoleName())
				assert.True(t, got.GetAttributes().GetCanLogin())
				assert.Equal(t, "Primary application role.", got.GetComment())
				require.Len(t, got.GetMemberOf(), 1)
				assert.Equal(t, resource.NewRoleName("prod", "app_writer").String(), got.GetMemberOf()[0].GetRole())
			},
		},
		{
			name:   "rejects non-role name",
			opener: &fakeOpener{},
			req:    &v1alpha1.GetRoleRequest{Name: "instances/prod"},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.GetRoleResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			name: "maps not-found error",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRoleErr: engine.ErrRoleNotFound,
			}},
			req: &v1alpha1.GetRoleRequest{Name: roleName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.GetRoleResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
			},
		},
		{
			name:   "maps open error",
			opener: &fakeOpener{err: errors.New("boom")},
			req:    &v1alpha1.GetRoleRequest{Name: roleName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.GetRoleResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.GetRole(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestListRoleGrants(t *testing.T) {
	t.Parallel()

	roleName := resource.NewRoleName("prod", "app_user").String()
	databaseName := resource.NewDatabaseName("prod", "appdb").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListRoleGrantsRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRoleGrantsResponse], err error)
	}{
		{
			name: "opens database and converts grants",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole: &engine.Role{Name: "app_user"},
				dbSession: &fakeDatabaseSession{
					grants: []engine.RoleGrant{
						{
							ObjectType:      "TABLE",
							SchemaName:      "public",
							ObjectName:      "users",
							Privilege:       "SELECT",
							WithGrantOption: true,
							Grantor:         "postgres",
						},
						{
							ObjectType: "SCHEMA",
							SchemaName: "public",
							Privilege:  "USAGE",
						},
						{
							ObjectType: "TABLE",
							SchemaName: "public",
							ObjectName: "maintenance_log",
							Privilege:  "MAINTAIN",
							Grantor:    "postgres",
						},
					},
					token: "next",
				},
			}},
			req: &v1alpha1.ListRoleGrantsRequest{
				Parent:    roleName,
				Database:  databaseName,
				PageSize:  25,
				PageToken: "page-1",
				OrderBy:   "object_name asc",
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRoleGrantsResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				assert.Equal(t, "app_user", opener.sess.getRoleName)
				assert.Equal(t, "appdb", opener.sess.openedDatabase)
				assert.True(t, opener.sess.closed)
				assert.True(t, opener.sess.dbSession.closed)
				assert.Equal(t, "app_user", opener.sess.dbSession.roleName)
				assert.Equal(t, aip.Params{PageSize: 25, PageToken: "page-1", OrderBy: "object_name asc"}, opener.sess.dbSession.params)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				grants := res.Msg.GetGrants()
				require.Len(t, grants, 3)
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_TABLE, grants[0].GetObjectType())
				assert.Equal(t, "public", grants[0].GetSchemaName())
				assert.Equal(t, "users", grants[0].GetObjectName())
				assert.Equal(t, "SELECT", grants[0].GetPrivilege())
				assert.True(t, grants[0].GetWithGrantOption())
				assert.Equal(t, "postgres", grants[0].GetGrantor())
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_SCHEMA, grants[1].GetObjectType())
				assert.Equal(t, "USAGE", grants[1].GetPrivilege())
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_TABLE, grants[2].GetObjectType())
				assert.Equal(t, "maintenance_log", grants[2].GetObjectName())
				assert.Equal(t, "MAINTAIN", grants[2].GetPrivilege())
			},
		},
		{
			name:   "rejects non-role parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListRoleGrantsRequest{Parent: "instances/prod", Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleGrantsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			name:   "rejects database in a different instance",
			opener: &fakeOpener{},
			req: &v1alpha1.ListRoleGrantsRequest{
				Parent:   roleName,
				Database: resource.NewDatabaseName("other", "appdb").String(),
			},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleGrantsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			// The grant schema opts in Filterable fields, so the service forwards
			// the filter to the engine, which parses/validates it.
			name: "forwards filter to engine",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole:   &engine.Role{Name: "app_user"},
				dbSession: &fakeDatabaseSession{},
			}},
			req: &v1alpha1.ListRoleGrantsRequest{
				Parent:   roleName,
				Database: databaseName,
				Filter:   `object_type = "TABLE"`,
			},
			assertion: func(t *testing.T, opener *fakeOpener, _ *connect.Response[v1alpha1.ListRoleGrantsResponse], err error) {
				t.Helper()
				require.NoError(t, err)
				assert.Equal(t, `object_type = "TABLE"`, opener.sess.dbSession.params.Filter)
			},
		},
		{
			name: "maps role not found",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRoleErr: engine.ErrRoleNotFound,
			}},
			req: &v1alpha1.ListRoleGrantsRequest{Parent: roleName, Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleGrantsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
			},
		},
		{
			name:   "maps open error",
			opener: &fakeOpener{err: errors.New("boom")},
			req:    &v1alpha1.ListRoleGrantsRequest{Parent: roleName, Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleGrantsResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListRoleGrants(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestListRoleOwnedObjects(t *testing.T) {
	t.Parallel()

	roleName := resource.NewRoleName("prod", "app_user").String()
	databaseName := resource.NewDatabaseName("prod", "appdb").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListRoleOwnedObjectsRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error)
	}{
		{
			name: "opens database and converts owned objects",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole: &engine.Role{Name: "app_user"},
				dbSession: &fakeDatabaseSession{
					ownedObjects: []engine.OwnedObject{
						{ObjectType: "DATABASE", ObjectName: "appdb"},
						{ObjectType: "SCHEMA", SchemaName: "analytics"},
						{ObjectType: "TABLE", SchemaName: "public", ObjectName: "orders"},
					},
					token: "next",
				},
			}},
			req: &v1alpha1.ListRoleOwnedObjectsRequest{
				Parent:    roleName,
				Database:  databaseName,
				PageSize:  25,
				PageToken: "page-1",
				OrderBy:   "schema_name asc",
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				assert.Equal(t, "app_user", opener.sess.getRoleName)
				assert.Equal(t, "appdb", opener.sess.openedDatabase)
				assert.True(t, opener.sess.dbSession.closed)
				assert.Equal(t, "app_user", opener.sess.dbSession.roleName)
				assert.Equal(t, aip.Params{PageSize: 25, PageToken: "page-1", OrderBy: "schema_name asc"}, opener.sess.dbSession.params)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				objects := res.Msg.GetOwnedObjects()
				require.Len(t, objects, 3)
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_DATABASE, objects[0].GetObjectType())
				assert.Equal(t, "appdb", objects[0].GetObjectName())
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_SCHEMA, objects[1].GetObjectType())
				assert.Equal(t, "analytics", objects[1].GetSchemaName())
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_TABLE, objects[2].GetObjectType())
				assert.Equal(t, "orders", objects[2].GetObjectName())
			},
		},
		{
			name:   "rejects non-role parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListRoleOwnedObjectsRequest{Parent: "instances/prod", Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			name:   "rejects database in a different instance",
			opener: &fakeOpener{},
			req: &v1alpha1.ListRoleOwnedObjectsRequest{
				Parent:   roleName,
				Database: resource.NewDatabaseName("other", "appdb").String(),
			},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			// The slice enables owned-objects filtering: the service forwards the
			// filter to the engine, which parses/validates it. (Filter validity is
			// covered by the aip and integration tests; here we assert pass-through.)
			name: "forwards filter to engine",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole:   &engine.Role{Name: "app_user"},
				dbSession: &fakeDatabaseSession{},
			}},
			req: &v1alpha1.ListRoleOwnedObjectsRequest{
				Parent:   roleName,
				Database: databaseName,
				Filter:   `object_name:"orders"`,
			},
			assertion: func(t *testing.T, opener *fakeOpener, _ *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error) {
				t.Helper()
				require.NoError(t, err)
				assert.Equal(t, `object_name:"orders"`, opener.sess.dbSession.params.Filter)
			},
		},
		{
			name: "maps role not found",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRoleErr: engine.ErrRoleNotFound,
			}},
			req: &v1alpha1.ListRoleOwnedObjectsRequest{Parent: roleName, Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
			},
		},
		{
			name:   "maps open error",
			opener: &fakeOpener{err: errors.New("boom")},
			req:    &v1alpha1.ListRoleOwnedObjectsRequest{Parent: roleName, Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListRoleOwnedObjects(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestListRoleDefaultPrivileges(t *testing.T) {
	t.Parallel()

	roleName := resource.NewRoleName("prod", "app_user").String()
	databaseName := resource.NewDatabaseName("prod", "appdb").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListRoleDefaultPrivilegesRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRoleDefaultPrivilegesResponse], err error)
	}{
		{
			name: "opens database and converts default privileges",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole: &engine.Role{Name: "app_user"},
				dbSession: &fakeDatabaseSession{
					defaultPrivileges: []engine.RoleDefaultPrivilege{
						{
							CreatorRoleName: "etl_writer",
							ObjectType:      "TABLES",
							SchemaName:      "public",
							Privilege:       "SELECT",
							WithGrantOption: true,
						},
						{
							ObjectType: "SEQUENCES",
							Privilege:  "USAGE",
						},
						{
							CreatorRoleName: "etl_writer",
							ObjectType:      "TABLES",
							SchemaName:      "public",
							Privilege:       "MAINTAIN",
						},
					},
					token: "next",
				},
			}},
			req: &v1alpha1.ListRoleDefaultPrivilegesRequest{
				Parent:    roleName,
				Database:  databaseName,
				PageSize:  25,
				PageToken: "page-1",
				OrderBy:   "creator_role_name asc",
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListRoleDefaultPrivilegesResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "app_user", opener.sess.getRoleName)
				assert.Equal(t, "appdb", opener.sess.openedDatabase)
				assert.True(t, opener.sess.dbSession.closed)
				assert.Equal(t, aip.Params{PageSize: 25, PageToken: "page-1", OrderBy: "creator_role_name asc"}, opener.sess.dbSession.params)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				privileges := res.Msg.GetDefaultPrivileges()
				require.Len(t, privileges, 3)
				assert.Equal(t, "etl_writer", privileges[0].GetCreatorRoleName())
				assert.Equal(t, resource.NewRoleName("prod", "etl_writer").String(), privileges[0].GetCreatorRole())
				assert.Equal(t, v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_TABLES, privileges[0].GetObjectType())
				assert.Equal(t, "public", privileges[0].GetSchemaName())
				assert.Equal(t, "SELECT", privileges[0].GetPrivilege())
				assert.True(t, privileges[0].GetWithGrantOption())
				// Empty creator name yields no resource name and empty schema = all schemas.
				assert.Empty(t, privileges[1].GetCreatorRole())
				assert.Empty(t, privileges[1].GetSchemaName())
				assert.Equal(t, v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_SEQUENCES, privileges[1].GetObjectType())
				assert.Equal(t, v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_TABLES, privileges[2].GetObjectType())
				assert.Equal(t, "MAINTAIN", privileges[2].GetPrivilege())
			},
		},
		{
			name:   "rejects non-role parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListRoleDefaultPrivilegesRequest{Parent: "instances/prod", Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleDefaultPrivilegesResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			// The slice enables default-privileges filtering: the service forwards
			// the filter to the engine, which parses/validates it.
			name: "forwards filter to engine",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRole:   &engine.Role{Name: "app_user"},
				dbSession: &fakeDatabaseSession{},
			}},
			req: &v1alpha1.ListRoleDefaultPrivilegesRequest{
				Parent:   roleName,
				Database: databaseName,
				Filter:   `privilege = "SELECT"`,
			},
			assertion: func(t *testing.T, opener *fakeOpener, _ *connect.Response[v1alpha1.ListRoleDefaultPrivilegesResponse], err error) {
				t.Helper()
				require.NoError(t, err)
				assert.Equal(t, `privilege = "SELECT"`, opener.sess.dbSession.params.Filter)
			},
		},
		{
			name: "maps role not found",
			opener: &fakeOpener{sess: &fakeRoleSession{
				getRoleErr: engine.ErrRoleNotFound,
			}},
			req: &v1alpha1.ListRoleDefaultPrivilegesRequest{Parent: roleName, Database: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListRoleDefaultPrivilegesResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListRoleDefaultPrivileges(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}

func TestListPublicGrants(t *testing.T) {
	t.Parallel()

	databaseName := resource.NewDatabaseName("prod", "appdb").String()

	tests := []struct {
		name      string
		opener    *fakeOpener
		req       *v1alpha1.ListPublicGrantsRequest
		assertion func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListPublicGrantsResponse], err error)
	}{
		{
			name: "opens database and converts public grants without a role check",
			opener: &fakeOpener{sess: &fakeRoleSession{
				dbSession: &fakeDatabaseSession{
					publicGrants: []engine.RoleGrant{
						{ObjectType: "DATABASE", ObjectName: "appdb", Privilege: "CONNECT"},
						{ObjectType: "SCHEMA", SchemaName: "public", Privilege: "USAGE"},
						{ObjectType: "TABLE", SchemaName: "public", ObjectName: "jobs", Privilege: "MAINTAIN"},
					},
					token: "next",
				},
			}},
			req: &v1alpha1.ListPublicGrantsRequest{
				Parent:    databaseName,
				PageSize:  25,
				PageToken: "page-1",
				OrderBy:   "schema_name asc",
			},
			assertion: func(t *testing.T, opener *fakeOpener, res *connect.Response[v1alpha1.ListPublicGrantsResponse], err error) {
				t.Helper()
				require.NoError(t, err)

				assert.Equal(t, "instances/prod", opener.opened.String())
				// PUBLIC has no role subject, so the role-existence check is skipped.
				assert.Empty(t, opener.sess.getRoleName)
				assert.Equal(t, "appdb", opener.sess.openedDatabase)
				assert.True(t, opener.sess.dbSession.closed)
				assert.Equal(t, aip.Params{PageSize: 25, PageToken: "page-1", OrderBy: "schema_name asc"}, opener.sess.dbSession.params)
				assert.Equal(t, "next", res.Msg.GetNextPageToken())

				grants := res.Msg.GetGrants()
				require.Len(t, grants, 3)
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_DATABASE, grants[0].GetObjectType())
				assert.Equal(t, "CONNECT", grants[0].GetPrivilege())
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_SCHEMA, grants[1].GetObjectType())
				assert.Equal(t, "USAGE", grants[1].GetPrivilege())
				assert.Equal(t, v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_TABLE, grants[2].GetObjectType())
				assert.Equal(t, "MAINTAIN", grants[2].GetPrivilege())
			},
		},
		{
			name:   "rejects non-database parent",
			opener: &fakeOpener{},
			req:    &v1alpha1.ListPublicGrantsRequest{Parent: resource.NewRoleName("prod", "app_user").String()},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListPublicGrantsResponse], err error) {
				t.Helper()
				require.Error(t, err)
				assert.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(err))
			},
		},
		{
			// The shared grant schema opts in Filterable fields, so the service
			// forwards the filter to the engine, which parses/validates it.
			name: "forwards filter to engine",
			opener: &fakeOpener{sess: &fakeRoleSession{
				dbSession: &fakeDatabaseSession{},
			}},
			req: &v1alpha1.ListPublicGrantsRequest{Parent: databaseName, Filter: `privilege = "CONNECT"`},
			assertion: func(t *testing.T, opener *fakeOpener, _ *connect.Response[v1alpha1.ListPublicGrantsResponse], err error) {
				t.Helper()
				require.NoError(t, err)
				assert.Equal(t, `privilege = "CONNECT"`, opener.sess.dbSession.params.Filter)
			},
		},
		{
			name:   "maps open error",
			opener: &fakeOpener{err: errors.New("boom")},
			req:    &v1alpha1.ListPublicGrantsRequest{Parent: databaseName},
			assertion: func(t *testing.T, _ *fakeOpener, _ *connect.Response[v1alpha1.ListPublicGrantsResponse], err error) {
				t.Helper()
				require.Error(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			svc := NewService(tt.opener)
			res, err := svc.ListPublicGrants(context.Background(), connect.NewRequest(tt.req))
			tt.assertion(t, tt.opener, res, err)
		})
	}
}
