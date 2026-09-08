package engine

import (
	"time"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// ReadRowsParams configures a single ReadRows call against a table.
//
// Filter and OrderBy are the public proto types: the engine layer walks the
// filter tree and maps RowOrder entries directly into SQL. SchemaName and
// TableName are bare identifiers (not quoted). ResourceName is the full
// AIP table resource name; it is bound into opaque tokens so a token from
// one table cannot be replayed against another.
type ReadRowsParams struct {
	ResourceName     string
	SchemaName       string
	TableName        string
	PageSize         int
	PageToken        string
	SelectedColumns  []string
	OrderBy          []*api.RowOrder
	Filter           *api.RowFilter
	RowCountMode     api.RowCountMode
	CellValueMode    api.CellValueMode
	MaxCellBytes     int
	MaxResponseBytes int64
}

// ReadRowsResult is what the engine returns for a single page.
//
// RowCount, RowIdentity, PaginationStrategy, and Limits map directly onto
// the corresponding response fields. Implementations that don't yet
// populate these may return zero values; the service layer fills in
// sensible defaults.
type ReadRowsResult struct {
	Columns            []*api.TableResultColumn
	Rows               []*api.TableResultRow
	NextPageToken      string
	RowCount           *api.RowCount
	RowIdentity        *api.RowIdentity
	PaginationStrategy api.PaginationStrategy
	ObservedAt         time.Time
	Limits             *api.ResponseLimits
}

// ReadCellValueParams configures a single ReadCellValue call. Service
// layer decodes the user-supplied token and verifies its HMAC + kind, then
// hands the decoded identity to the engine here.
type ReadCellValueParams struct {
	SchemaName string
	TableName  string

	// Column is the bare column name; not pre-quoted.
	Column string

	// RowIdentity describes how identity was originally derived (PK / ctid).
	RowIdentity *api.RowIdentity

	// IdentityValues are aligned with RowIdentity.column_names.
	IdentityValues []*api.TableValue

	// MaxBytes caps the number of bytes returned in the response cell.
	// 0 means server default (16 MiB).
	MaxBytes int64
}

// ReadCellValueResult is the engine's return shape for ReadCellValue.
type ReadCellValueResult struct {
	Cell *api.TableCell
}

type ExecuteQueryParams struct {
	Statement     string
	RowLimit      int
	DefaultSchema string
	Timeout       time.Duration
}

type ExecuteQueryStats struct {
	RowCount  int64
	Latency   time.Duration
	Notices   []string
	Truncated bool
	// CommandTag is the tag PostgreSQL reported for the statement, such as
	// "SELECT 42" or "SET". Empty when the driver did not report one.
	CommandTag string
	// RowsAffected is the count carried by CommandTag: rows returned for
	// SELECT, rows changed for DML, zero for utility commands.
	RowsAffected int64
}

type ExecuteQueryStream interface {
	Columns() []*api.TableResultColumn
	Next() bool
	Row() *api.TableResultRow
	Err() error
	Stats() ExecuteQueryStats
	Close() error
}

type ExplainQueryParams struct {
	Statement     string
	Format        api.ExplainQueryRequest_Format
	Analyze       bool
	Buffers       bool
	DefaultSchema string
	Timeout       time.Duration
}

type ExplainQueryResult struct {
	Plan    string
	Notices []string
	Latency time.Duration
}

type ValidateQueryParams struct {
	Statement string
	Timeout   time.Duration
}

// ValidateQueryResult reports whether PostgreSQL accepted a statement.
// Diagnostic is nil when it did.
type ValidateQueryResult struct {
	Diagnostic *QueryDiagnostic
}

// QueryDiagnostic is one problem PostgreSQL found in a statement. Text fields
// are bounded server text; Position is a 1-based character offset or 0.
type QueryDiagnostic struct {
	SQLState string
	Message  string
	Detail   string
	Hint     string
	Position int32
}
