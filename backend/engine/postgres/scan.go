package postgres

import (
	"database/sql"

	"github.com/querylane/querylane/backend/engine"
)

// scanner is satisfied by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

// Core scan functions — used by both Get (via *sql.Row) and List (via *sql.Rows).

func scanDatabaseRow(s scanner) (engine.Database, error) {
	var db engine.Database

	err := s.Scan(&db.Name, &db.CharacterSet, &db.Collation, &db.Owner, &db.IsSystemDatabase)
	db.DisplayName = db.Name

	return db, err
}

func scanSchemaRow(s scanner) (engine.Schema, error) {
	var sch engine.Schema

	err := s.Scan(&sch.Name, &sch.Owner, &sch.IsSystemSchema)
	sch.DisplayName = sch.Name

	return sch, err
}

func scanTableRow(s scanner) (engine.Table, error) {
	var (
		t         engine.Table
		tableType string
	)

	err := s.Scan(&t.Name, &tableType, &t.Comment, &t.Owner, &t.RowCount, &t.SizeBytes)
	t.DisplayName = t.Name
	t.TableType = mapTableType(tableType)

	return t, err
}

func scanViewRow(s scanner) (engine.View, error) {
	var (
		v        engine.View
		viewType string
	)

	err := s.Scan(&v.Name, &viewType, &v.Owner, &v.Comment, &v.IsSystemView, &v.Definition, &v.SizeBytes, &v.RowCount, &v.IsPopulated)
	v.DisplayName = v.Name
	v.ViewType = mapViewType(viewType)

	return v, err
}

// Adapters for rawsql.RowScanner[Model] (used by rawsql.Execute for list endpoints).

func scanDatabase(rows *sql.Rows) (engine.Database, error) { return scanDatabaseRow(rows) }
func scanSchema(rows *sql.Rows) (engine.Schema, error)     { return scanSchemaRow(rows) }
func scanTable(rows *sql.Rows) (engine.Table, error)       { return scanTableRow(rows) }
func scanView(rows *sql.Rows) (engine.View, error)         { return scanViewRow(rows) }
