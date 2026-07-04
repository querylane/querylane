// Command: go run ./jet_generator.go postgres://user:pass@localhost:5432/dbname
//
// Generates go-jet models & builders with a small set of type-mapping rules.
// Every customization hangs off a handful of helpers so the rest stays stock.

package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-jet/jet/v2/generator/metadata"
	"github.com/go-jet/jet/v2/generator/postgres"
	"github.com/go-jet/jet/v2/generator/template"
	pgdialect "github.com/go-jet/jet/v2/postgres"
	pgconn "github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib" // Register "pgx" driver for database/sql
)

/******************************************************************************
 * Configuration
 ******************************************************************************/

const (
	defaultSchema = "public"
	outputDir     = "./storage/gen"

	typesImport = "github.com/querylane/querylane/backend/storage/types"
)

// table to column to custom Go type.
var columnOverrides = map[string]map[string]template.Type{
	"instance": {
		"config": {ImportPath: typesImport, Name: "types.EngineConfigJSON"},
		"labels": {ImportPath: typesImport, Name: "types.StringMap"},
	},
}

// fallback for any JSONB not listed above.
var genericJSONB = template.Type{ImportPath: typesImport, Name: "types.StringMap"}

// fallback for any array column not listed above.
var genericTextArray = template.Type{ImportPath: typesImport, Name: "types.StringArray"}

// tables we never generate.
var skipTables = map[string]struct{}{
	"goose_db_version": {},
}

/******************************************************************************
 * main
 ******************************************************************************/

func main() {
	if len(os.Args) < 2 {
		slog.Error("Usage: go run jet_generator.go <database_url>")
		os.Exit(1)
	}

	dbURL := os.Args[1]
	if err := run(dbURL); err != nil {
		slog.Error("generation failed", slog.Any("err", err))
		os.Exit(1)
	}

	slog.Info("generation finished")
}

/******************************************************************************
 * pipeline
 ******************************************************************************/

func run(dbURL string) error {
	slog.Info("starting generation",
		slog.String("schema", defaultSchema),
		slog.String("output", outputDir),
	)

	cfg, err := pgconn.ParseConfig(dbURL)
	if err != nil {
		return fmt.Errorf("parse dsn: %w", err)
	}

	if cfg.Database == "" {
		return errors.New("database name is required in dsn")
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	pingCtx, pingCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer pingCancel()

	if err := db.PingContext(pingCtx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	tmpl := template.Default(pgdialect.Dialect).UseSchema(customizeSchema)

	return postgres.GenerateDB(db, defaultSchema, filepath.Join(outputDir, cfg.Database), tmpl)
}

/******************************************************************************
 * schema / table / column customizers
 ******************************************************************************/

func customizeSchema(s metadata.Schema) template.Schema {
	return template.DefaultSchema(s).
		UseModel(template.DefaultModel().UseTable(customizeTableModel)).
		UseSQLBuilder(template.DefaultSQLBuilder().UseTable(customizeTableSQL))
}

func customizeTableModel(t metadata.Table) template.TableModel {
	if skip(t) {
		return template.TableModel{Skip: true}
	}

	return template.DefaultTableModel(t).UseField(func(c metadata.Column) template.TableModelField {
		return mapColumn(t, c)
	})
}

func customizeTableSQL(t metadata.Table) template.TableSQLBuilder {
	if skip(t) {
		return template.TableSQLBuilder{Skip: true}
	}

	return template.DefaultTableSQLBuilder(t)
}

/******************************************************************************
 * helpers
 ******************************************************************************/

func skip(t metadata.Table) bool {
	_, ok := skipTables[t.Name]
	return ok
}

func mapColumn(t metadata.Table, c metadata.Column) template.TableModelField {
	field := template.DefaultTableModelField(c)

	// 1. explicit override
	if typ, ok := override(t.Name, c.Name); ok {
		field.Type = typ

		logMap("override", t.Name, c)

		return field
	}

	// 2. generic array -> types.StringArray
	if c.DataType.IsArray() {
		field.Type = genericTextArray

		logMap("array", t.Name, c)

		return field
	}

	// 3. generic JSONB -> StringMap
	if isJSONB(c) {
		field.Type = genericJSONB

		logMap("jsonb", t.Name, c)
	}

	return field
}

func override(table, column string) (template.Type, bool) {
	if cols, ok := columnOverrides[table]; ok {
		if typ, ok := cols[column]; ok {
			return typ, true
		}
	}

	return template.Type{}, false
}

func isJSONB(c metadata.Column) bool {
	return strings.Contains(strings.ToLower(c.DataType.Name), "jsonb")
}

func logMap(kind, table string, c metadata.Column) {
	slog.Info("mapped column",
		slog.String("kind", kind),
		slog.String("table", table),
		slog.String("column", c.Name),
		slog.String("db_type", c.DataType.Name),
	)
}
