// Package role provides the RoleService implementation for viewing PostgreSQL
// server-level roles on external instances.
package role

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/connectrpc/apierrors"
	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	v1connect "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1/consolev1alpha1connect"
	"github.com/querylane/querylane/backend/resource"
)

var _ v1connect.RoleServiceHandler = (*Service)(nil)

type instanceOpener interface {
	OpenInstance(ctx context.Context, name resource.InstanceName) (engine.InstanceSession, error)
}

// Service implements RoleService RPC handlers.
type Service struct {
	connManager instanceOpener
}

// NewService creates a new RoleService.
func NewService(connManager instanceOpener) *Service {
	return &Service{connManager: connManager}
}

// ListRoles returns a paginated list of server-level roles within an instance.
func (s *Service) ListRoles(ctx context.Context, req *connect.Request[v1alpha1.ListRolesRequest]) (*connect.Response[v1alpha1.ListRolesResponse], error) {
	instanceResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseInstanceName)
	if connErr != nil {
		return nil, connErr
	}

	instSession, err := s.connManager.OpenInstance(ctx, instanceResource)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeInstance,
			Name: instanceResource.String(),
			Op:   "list_roles",
		})
	}
	defer instSession.Close()

	roles, nextToken, err := instSession.ListRoles(ctx, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, apierrors.ResourceCtx{
			Type: resource.TypeInstance,
			Name: instanceResource.String(),
			Op:   "list_roles",
		})
	}

	return connect.NewResponse(&v1alpha1.ListRolesResponse{
		Roles:         convertRoles(roles, instanceResource.InstanceID),
		NextPageToken: nextToken,
	}), nil
}

// GetRole returns the details of a single server-level role within an instance.
func (s *Service) GetRole(ctx context.Context, req *connect.Request[v1alpha1.GetRoleRequest]) (*connect.Response[v1alpha1.GetRoleResponse], error) {
	roleResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetName(), "name", resource.ParseRoleName)
	if connErr != nil {
		return nil, connErr
	}

	postgresRoleName := roleResource.PostgresRoleName()

	rctx := apierrors.ResourceCtx{
		Type: roleResource.ResourceType(),
		Name: roleResource.String(),
		Op:   "get_role",
	}

	instSession, err := s.connManager.OpenInstance(ctx, roleResource.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer instSession.Close()

	role, err := instSession.GetRole(ctx, postgresRoleName)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	return connect.NewResponse(&v1alpha1.GetRoleResponse{
		Role: convertRole(*role, roleResource.InstanceID),
	}), nil
}

// ListRoleGrants returns a paginated list of object-level privileges granted
// directly to a role within a specific database.
func (s *Service) ListRoleGrants(ctx context.Context, req *connect.Request[v1alpha1.ListRoleGrantsRequest]) (*connect.Response[v1alpha1.ListRoleGrantsResponse], error) {
	target, err := s.openRoleDatabaseSession(ctx, req.Msg.GetParent(), req.Msg.GetDatabase(), "list_role_grants")
	if err != nil {
		return nil, err
	}
	defer target.close()

	grants, nextToken, err := target.session.ListRoleGrants(ctx, target.postgresRoleName, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, target.rctx)
	}

	return connect.NewResponse(&v1alpha1.ListRoleGrantsResponse{
		Grants:        convertRoleGrants(grants),
		NextPageToken: nextToken,
	}), nil
}

// roleDatabaseTarget holds the resolved inputs for a role-scoped, database-local
// list RPC (grants, owned objects, default privileges).
type roleDatabaseTarget struct {
	instanceSession  engine.InstanceSession
	session          engine.DatabaseSession
	postgresRoleName string
	instanceID       string
	rctx             apierrors.ResourceCtx
}

func (t *roleDatabaseTarget) close() {
	_ = t.session.Close()
	_ = t.instanceSession.Close()
}

// openRoleDatabaseSession resolves the shared preamble for the role-scoped,
// database-local list RPCs: it validates the role and database names, confirms
// they share an instance, verifies the role exists, and opens a database
// session. Any failure is returned as a ready-to-return connect error.
//
// Filter validation is the engine's responsibility: each schema declares which
// fields are Filterable, and the aip filter engine rejects bad filters with
// ErrInvalidFilter (mapped to InvalidArgument). Schemas with no Filterable
// fields reject any non-empty filter the same way.
//
//nolint:funcorder // shared preamble kept adjacent to the role-database list RPCs it serves (ListRoleOwnedObjects/DefaultPrivileges below)
func (s *Service) openRoleDatabaseSession(ctx context.Context, parent, database, op string) (*roleDatabaseTarget, error) {
	roleResource, connErr := apierrors.ParseResourceWithError(parent, "parent", resource.ParseRoleName)
	if connErr != nil {
		return nil, connErr
	}

	databaseResource, connErr := apierrors.ParseResourceWithError(database, "database", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	if databaseResource.InstanceID != roleResource.InstanceID {
		return nil, apierrors.NewInvalidArgumentError(
			apierrors.NewFieldViolation("database", "database must belong to the same instance as the role"),
		)
	}

	postgresRoleName := roleResource.PostgresRoleName()

	rctx := apierrors.ResourceCtx{
		Type: roleResource.ResourceType(),
		Name: roleResource.String(),
		Op:   op,
	}

	instSession, err := s.connManager.OpenInstance(ctx, roleResource.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	// Verify the role exists; an ACL-join query would otherwise silently return
	// zero rows for a dropped or misspelled role.
	if _, err := instSession.GetRole(ctx, postgresRoleName); err != nil {
		_ = instSession.Close()

		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	dbSession, err := instSession.OpenDatabase(ctx, databaseResource.DatabaseID)
	if err != nil {
		_ = instSession.Close()

		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	return &roleDatabaseTarget{
		instanceSession:  instSession,
		session:          dbSession,
		postgresRoleName: postgresRoleName,
		instanceID:       roleResource.InstanceID,
		rctx:             rctx,
	}, nil
}

// ListRoleOwnedObjects returns a paginated list of objects owned by a role
// within a specific database.
func (s *Service) ListRoleOwnedObjects(ctx context.Context, req *connect.Request[v1alpha1.ListRoleOwnedObjectsRequest]) (*connect.Response[v1alpha1.ListRoleOwnedObjectsResponse], error) {
	target, err := s.openRoleDatabaseSession(ctx, req.Msg.GetParent(), req.Msg.GetDatabase(), "list_role_owned_objects")
	if err != nil {
		return nil, err
	}
	defer target.close()

	objects, nextToken, err := target.session.ListRoleOwnedObjects(ctx, target.postgresRoleName, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, target.rctx)
	}

	return connect.NewResponse(&v1alpha1.ListRoleOwnedObjectsResponse{
		OwnedObjects:  convertOwnedObjects(objects),
		NextPageToken: nextToken,
	}), nil
}

// ListRoleDefaultPrivileges returns a paginated list of default privileges
// (ALTER DEFAULT PRIVILEGES) that grant access to a role on objects created
// later by other roles within a specific database.
func (s *Service) ListRoleDefaultPrivileges(ctx context.Context, req *connect.Request[v1alpha1.ListRoleDefaultPrivilegesRequest]) (*connect.Response[v1alpha1.ListRoleDefaultPrivilegesResponse], error) {
	target, err := s.openRoleDatabaseSession(ctx, req.Msg.GetParent(), req.Msg.GetDatabase(), "list_role_default_privileges")
	if err != nil {
		return nil, err
	}
	defer target.close()

	privileges, nextToken, err := target.session.ListRoleDefaultPrivileges(ctx, target.postgresRoleName, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, target.rctx)
	}

	return connect.NewResponse(&v1alpha1.ListRoleDefaultPrivilegesResponse{
		DefaultPrivileges: convertRoleDefaultPrivileges(privileges, target.instanceID),
		NextPageToken:     nextToken,
	}), nil
}

// ListPublicGrants returns a paginated list of privileges granted to PUBLIC
// within a specific database. Unlike the role-scoped RPCs, its parent is a
// Database (PUBLIC is not a role), so it does not verify a role exists.
func (s *Service) ListPublicGrants(ctx context.Context, req *connect.Request[v1alpha1.ListPublicGrantsRequest]) (*connect.Response[v1alpha1.ListPublicGrantsResponse], error) {
	databaseResource, connErr := apierrors.ParseResourceWithError(req.Msg.GetParent(), "parent", resource.ParseDatabaseName)
	if connErr != nil {
		return nil, connErr
	}

	rctx := apierrors.ResourceCtx{
		Type: databaseResource.ResourceType(),
		Name: databaseResource.String(),
		Op:   "list_public_grants",
	}

	instSession, err := s.connManager.OpenInstance(ctx, databaseResource.Instance())
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer instSession.Close()

	dbSession, err := instSession.OpenDatabase(ctx, databaseResource.DatabaseID)
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}
	defer dbSession.Close()

	grants, nextToken, err := dbSession.ListPublicGrants(ctx, aip.Params{
		PageSize:  req.Msg.GetPageSize(),
		PageToken: req.Msg.GetPageToken(),
		Filter:    req.Msg.GetFilter(),
		OrderBy:   req.Msg.GetOrderBy(),
	})
	if err != nil {
		return nil, apierrors.MapEngineErr(ctx, err, rctx)
	}

	return connect.NewResponse(&v1alpha1.ListPublicGrantsResponse{
		Grants:        convertRoleGrants(grants),
		NextPageToken: nextToken,
	}), nil
}

func convertRoles(roles []engine.Role, instanceID string) []*v1alpha1.Role {
	pbRoles := make([]*v1alpha1.Role, 0, len(roles))
	for _, role := range roles {
		pbRoles = append(pbRoles, convertRole(role, instanceID))
	}

	return pbRoles
}

func convertRole(role engine.Role, instanceID string) *v1alpha1.Role {
	return &v1alpha1.Role{
		Name:         resource.NewRoleName(instanceID, role.Name).String(),
		RoleName:     role.Name,
		Attributes:   convertRoleAttributes(role.Attributes),
		MemberOf:     convertRoleMemberships(role.MemberOf, instanceID),
		IsSystemRole: role.IsSystemRole,
		Comment:      role.Comment,
	}
}

func convertRoleAttributes(attrs engine.RoleAttributes) *v1alpha1.RoleAttributes {
	pbAttrs := &v1alpha1.RoleAttributes{
		CanLogin:          attrs.CanLogin,
		IsSuperuser:       attrs.IsSuperuser,
		CanCreateDatabase: attrs.CanCreateDatabase,
		CanCreateRole:     attrs.CanCreateRole,
		CanReplicate:      attrs.CanReplicate,
		BypassesRls:       attrs.BypassesRLS,
		InheritsByDefault: attrs.InheritsByDefault,
		ConnectionLimit:   attrs.ConnectionLimit,
		ConfigParameters:  attrs.ConfigParameters,
	}
	if attrs.ValidUntil != nil {
		pbAttrs.ValidUntil = timestamppb.New(*attrs.ValidUntil)
	}

	return pbAttrs
}

func convertRoleMemberships(memberships []engine.RoleMembership, instanceID string) []*v1alpha1.RoleMembership {
	pbMemberships := make([]*v1alpha1.RoleMembership, 0, len(memberships))
	for _, membership := range memberships {
		pbMembership := &v1alpha1.RoleMembership{
			Role:          resource.NewRoleName(instanceID, membership.RoleName).String(),
			RoleName:      membership.RoleName,
			AdminOption:   membership.AdminOption,
			InheritOption: membership.InheritOption,
			SetOption:     membership.SetOption,
			Grantor:       membership.Grantor,
		}
		if membership.Grantor != "" {
			pbMembership.GrantorRole = resource.NewRoleName(instanceID, membership.Grantor).String()
		}

		pbMemberships = append(pbMemberships, pbMembership)
	}

	return pbMemberships
}

func convertRoleGrants(grants []engine.RoleGrant) []*v1alpha1.ObjectGrant {
	pbGrants := make([]*v1alpha1.ObjectGrant, 0, len(grants))
	for _, grant := range grants {
		pbGrants = append(pbGrants, &v1alpha1.ObjectGrant{
			ObjectType:      grantObjectType(grant.ObjectType),
			SchemaName:      grant.SchemaName,
			ObjectName:      grant.ObjectName,
			Privilege:       grant.Privilege,
			WithGrantOption: grant.WithGrantOption,
			Grantor:         grant.Grantor,
		})
	}

	return pbGrants
}

func convertOwnedObjects(objects []engine.OwnedObject) []*v1alpha1.OwnedObject {
	pbObjects := make([]*v1alpha1.OwnedObject, 0, len(objects))
	for _, object := range objects {
		pbObjects = append(pbObjects, &v1alpha1.OwnedObject{
			ObjectType: grantObjectType(object.ObjectType),
			SchemaName: object.SchemaName,
			ObjectName: object.ObjectName,
		})
	}

	return pbObjects
}

func convertRoleDefaultPrivileges(privileges []engine.RoleDefaultPrivilege, instanceID string) []*v1alpha1.RoleDefaultPrivilege {
	pbPrivileges := make([]*v1alpha1.RoleDefaultPrivilege, 0, len(privileges))
	for _, priv := range privileges {
		pbPriv := &v1alpha1.RoleDefaultPrivilege{
			CreatorRoleName: priv.CreatorRoleName,
			ObjectType:      defaultPrivilegeObjectType(priv.ObjectType),
			SchemaName:      priv.SchemaName,
			Privilege:       priv.Privilege,
			WithGrantOption: priv.WithGrantOption,
		}
		if priv.CreatorRoleName != "" {
			pbPriv.CreatorRole = resource.NewRoleName(instanceID, priv.CreatorRoleName).String()
		}

		pbPrivileges = append(pbPrivileges, pbPriv)
	}

	return pbPrivileges
}

func defaultPrivilegeObjectType(objectType string) v1alpha1.DefaultPrivilegeObjectType {
	switch objectType {
	case "TABLES":
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_TABLES
	case "SEQUENCES":
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_SEQUENCES
	case "FUNCTIONS":
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_FUNCTIONS
	case "TYPES":
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_TYPES
	case "SCHEMAS":
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_SCHEMAS
	case "LARGE_OBJECTS":
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_LARGE_OBJECTS
	default:
		return v1alpha1.DefaultPrivilegeObjectType_DEFAULT_PRIVILEGE_OBJECT_TYPE_UNSPECIFIED
	}
}

func grantObjectType(objectType string) v1alpha1.GrantObjectType {
	switch objectType {
	case "DATABASE":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_DATABASE
	case "SCHEMA":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_SCHEMA
	case "TABLE":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_TABLE
	case "VIEW":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_VIEW
	case "MATERIALIZED_VIEW":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_MATERIALIZED_VIEW
	case "SEQUENCE":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_SEQUENCE
	case "FOREIGN_TABLE":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_FOREIGN_TABLE
	case "FUNCTION":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_FUNCTION
	case "LARGE_OBJECT":
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_LARGE_OBJECT
	default:
		return v1alpha1.GrantObjectType_GRANT_OBJECT_TYPE_UNSPECIFIED
	}
}
