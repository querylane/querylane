package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/querylane/querylane/backend/aip"
	"github.com/querylane/querylane/backend/aip/rawsql"
	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/storage/types"
)

var roleSchema = rawsql.Bind(
	aip.NewSchema(
		"console.querylane.dev/Role",
		aip.Fields[engine.Role]{
			"name": {
				Codec:    aip.StringCodec{},
				GetValue: func(m *engine.Role) any { return m.Name },
			},
		},
		aip.WithNameOrdering(),
	),
	rawsql.Exprs{
		"name": "r.rolname",
	},
)

type roleMembershipJSON struct {
	RoleName      string `json:"roleName"`
	AdminOption   bool   `json:"adminOption"`
	InheritOption bool   `json:"inheritOption"`
	SetOption     bool   `json:"setOption"`
	Grantor       string `json:"grantor"`
}

// ListRoles returns a paginated list of server-level roles in the PostgreSQL instance.
func (d *Postgres) ListRoles(ctx context.Context, db *sql.DB, params aip.Params) ([]engine.Role, string, error) {
	return rawsql.Execute(ctx, roleSchema, params, withPostgresErrorClassifier(rawsql.Query{
		BaseQuery: roleListQuery,
	}, "list roles"), scanRole, db)
}

// GetRole retrieves details for a specific server-level role by its exact name.
func (d *Postgres) GetRole(ctx context.Context, db *sql.DB, roleName string) (*engine.Role, error) {
	role, err := scanRoleRow(db.QueryRowContext(ctx, getRoleQuery, roleName))
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("%w: %s", engine.ErrRoleNotFound, roleName)
		}

		return nil, fmt.Errorf("failed to query role: %w", err)
	}

	return &role, nil
}

func scanRole(rows *sql.Rows) (engine.Role, error) { return scanRoleRow(rows) }

func scanRoleRow(s scanner) (engine.Role, error) {
	var (
		role         engine.Role
		validUntil   sql.NullTime
		config       types.StringArray
		memberOfJSON string
	)

	err := s.Scan(
		&role.Name,
		&role.Attributes.CanLogin,
		&role.Attributes.IsSuperuser,
		&role.Attributes.CanCreateDatabase,
		&role.Attributes.CanCreateRole,
		&role.Attributes.CanReplicate,
		&role.Attributes.BypassesRLS,
		&role.Attributes.InheritsByDefault,
		&role.Attributes.ConnectionLimit,
		&validUntil,
		&config,
		&role.IsSystemRole,
		&memberOfJSON,
		&role.Comment,
	)
	if err != nil {
		return role, err
	}

	if validUntil.Valid {
		t := validUntil.Time
		role.Attributes.ValidUntil = &t
	}

	role.Attributes.ConfigParameters = []string(config)

	memberships, err := decodeRoleMemberships(memberOfJSON)
	if err != nil {
		return role, err
	}

	role.MemberOf = memberships

	return role, nil
}

func decodeRoleMemberships(memberOfJSON string) ([]engine.RoleMembership, error) {
	var rows []roleMembershipJSON
	if err := json.Unmarshal([]byte(memberOfJSON), &rows); err != nil {
		return nil, err
	}

	memberships := make([]engine.RoleMembership, 0, len(rows))
	for _, row := range rows {
		memberships = append(memberships, engine.RoleMembership{
			RoleName:      row.RoleName,
			AdminOption:   row.AdminOption,
			InheritOption: row.InheritOption,
			SetOption:     row.SetOption,
			Grantor:       row.Grantor,
		})
	}

	return memberships, nil
}
