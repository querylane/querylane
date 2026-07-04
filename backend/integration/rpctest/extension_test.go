package rpctest

import (
	"context"

	"connectrpc.com/connect"

	consolev1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func (s *RPCSuite) TestListExtensionsIncludesAvailableAndInstalled() {
	ctx := context.Background()

	db, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)

	defer db.Close()

	_, err = db.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS pg_trgm")
	s.Require().NoError(err)

	resp, err := s.extensionClient.ListExtensions(ctx, connect.NewRequest(&consolev1alpha1.ListExtensionsRequest{
		Parent:   s.databaseName(),
		PageSize: 1000,
		OrderBy:  "name asc",
	}))
	s.Require().NoError(err)

	byDisplayName := make(map[string]*consolev1alpha1.Extension, len(resp.Msg.GetExtensions()))
	for _, extension := range resp.Msg.GetExtensions() {
		byDisplayName[extension.GetDisplayName()] = extension
	}

	pgTrgm, ok := byDisplayName["pg_trgm"]
	s.Require().True(ok, "pg_trgm extension should be listed")
	s.Equal(s.databaseName()+"/extensions/pg_trgm", pgTrgm.GetName())
	s.True(pgTrgm.GetInstalled())
	s.Equal("public", pgTrgm.GetSchema())
	s.NotEmpty(pgTrgm.GetInstalledVersion())
	s.NotEmpty(pgTrgm.GetDefaultVersion())

	uuidOssp, ok := byDisplayName["uuid-ossp"]
	s.Require().True(ok, "uuid-ossp extension should be available on PostgreSQL 18")
	s.Equal(s.databaseName()+"/extensions/uuid-ossp", uuidOssp.GetName())
	s.False(uuidOssp.GetInstalled())
	s.Empty(uuidOssp.GetSchema())
	s.Empty(uuidOssp.GetInstalledVersion())
	s.NotEmpty(uuidOssp.GetDefaultVersion())
}

func (s *RPCSuite) TestListExtensionsFiltersInstalledAndOrdersBySchemaThenName() {
	ctx := context.Background()

	db, err := s.pgContainer.ConnectToDatabase(ctx, externalDBName)
	s.Require().NoError(err)

	defer db.Close()

	_, err = db.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS pg_trgm")
	s.Require().NoError(err)

	resp, err := s.extensionClient.ListExtensions(ctx, connect.NewRequest(&consolev1alpha1.ListExtensionsRequest{
		Parent:   s.databaseName(),
		PageSize: 1000,
		Filter:   "installed = true",
		OrderBy:  "schema asc, name asc",
	}))
	s.Require().NoError(err)
	s.Require().NotEmpty(resp.Msg.GetExtensions())

	seenPgTrgm := false
	previousOrderKey := ""

	for _, extension := range resp.Msg.GetExtensions() {
		s.True(extension.GetInstalled())
		s.NotEmpty(extension.GetSchema())

		orderKey := extension.GetSchema() + "\x00" + extension.GetDisplayName()
		s.LessOrEqual(previousOrderKey, orderKey, "extensions should be sorted by schema asc, name asc")
		previousOrderKey = orderKey

		if extension.GetDisplayName() == "pg_trgm" {
			seenPgTrgm = true
		}
	}

	s.True(seenPgTrgm, "installed pg_trgm extension should match installed filter")
}
