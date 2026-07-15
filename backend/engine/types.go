package engine

import (
	"time"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// InstanceOverview holds live health signals for a PostgreSQL instance.
// Each sub-struct pointer is nil when the corresponding query failed
// (e.g., due to insufficient privileges).
type InstanceOverview struct {
	Connections *ConnectionMetrics
	Storage     *StorageMetrics
	Cache       *CacheMetrics
	IO          *IOMetrics

	// PartialErrors carries the classified cause for nil metric fields.
	// PostgreSQL causes may unwrap to postgreserrors.Error.
	PartialErrors []OverviewMetricError
}

// InstanceHealth holds live, actionable health checks for a PostgreSQL
// instance. Each category pointer is nil when that independent query failed.
type InstanceHealth struct {
	ConnectionActivity *ConnectionActivityHealth
	Replication        *ReplicationHealth
	StatsAccess        *StatsAccessHealth
	PGStatStatements   *PGStatStatementsHealth
	Autovacuum         *AutovacuumHealth

	// PartialErrors carries the classified cause for nil health fields or
	// degraded subqueries. PostgreSQL causes may unwrap to postgreserrors.Error.
	PartialErrors []OverviewMetricError
}

type HealthStatus string

const (
	HealthStatusOK            HealthStatus = "ok"
	HealthStatusWarning       HealthStatus = "warning"
	HealthStatusError         HealthStatus = "error"
	HealthStatusUnknown       HealthStatus = "unknown"
	HealthStatusNotApplicable HealthStatus = "not_applicable"
)

// ConnectionActivityHealth describes connection pressure and activity risks
// from pg_stat_activity.
type ConnectionActivityHealth struct {
	Status            HealthStatus
	Summary           string
	Active            int32
	Idle              int32
	IdleInTransaction int32
	Total             int32
	Max               int32
	UtilizationRatio  float64
	WaitingForLocks   int32
	LongRunningTxs    int32
	LongestTxSeconds  int64
	// ByApplication breaks the current client backends down by
	// application_name (top talkers first). Empty when the breakdown query
	// failed; the scalar counts above remain authoritative.
	ByApplication []ApplicationConnections
	// Sessions is a risk-first sample of current client backends. Empty when
	// the session detail query failed; aggregate counts remain authoritative.
	Sessions []ConnectionActivitySession
}

// ApplicationConnections is the connection count for one application_name in
// pg_stat_activity, split by backend state.
type ApplicationConnections struct {
	ApplicationName   string
	Active            int32
	Idle              int32
	IdleInTransaction int32
	Total             int32
}

// ConnectionActivitySession is one live pg_stat_activity client backend row.
type ConnectionActivitySession struct {
	PID             int32
	Username        string
	ApplicationName string
	DatabaseName    string
	State           string
	DurationSeconds int64
	Query           string
	WaitEventType   string
	WaitEvent       string
	BlockedByPID    int32
	// BackendAgeSeconds is how long this client has been connected.
	BackendAgeSeconds int64
	// TransactionAgeSeconds is nil when no transaction is open.
	TransactionAgeSeconds *int64
	// QueryAgeSeconds is the age of the current query for active sessions and
	// of the most recent query otherwise. Nil when none was run yet.
	QueryAgeSeconds *int64
	// ClientAddress and ClientPort are empty/zero for unix-socket clients.
	ClientAddress string
	ClientPort    int32
}

type ReplicationRole string

const (
	ReplicationRolePrimary ReplicationRole = "primary"
	ReplicationRoleReplica ReplicationRole = "replica"
)

// ReplicationHealth describes primary/replica state from pg_is_in_recovery,
// pg_stat_replication, and pg_stat_wal_receiver.
type ReplicationHealth struct {
	Status                 HealthStatus
	Summary                string
	Role                   ReplicationRole
	AttachedReplicas       int32
	StreamingReplicas      int32
	SynchronousReplicas    int32
	MaxReplicationLagBytes int64
	WALReceiverActive      bool
	ReplayLagSeconds       int64
}

// StatsAccessHealth describes whether the connected role has enough catalog
// and statistics visibility for rich diagnostics.
type StatsAccessHealth struct {
	Status                HealthStatus
	Summary               string
	CurrentUser           string
	Superuser             bool
	PGMonitorMember       bool
	PGReadAllStatsMember  bool
	CanReadPGStatActivity bool
	CanReadPGStatDatabase bool
}

// PGStatStatementsHealth describes whether pg_stat_statements is installed,
// loaded, queryable, and accumulating rows.
type PGStatStatementsHealth struct {
	Status                  HealthStatus
	Summary                 string
	ExtensionInstalled      bool
	ExtensionSchema         string
	ExtensionVersion        string
	SharedPreloadConfigured bool
	TrackMode               string
	ViewQueryable           bool
	StatementCount          int64
	StatsResetAt            *time.Time
}

// AutovacuumHealth describes autovacuum worker saturation and the most recent
// auto-maintenance activity. RunningWorkers and MaxWorkers are instance-wide,
// but LastAutovacuumAt is derived from pg_stat_all_tables and therefore
// reflects only the connected database, not the whole cluster.
type AutovacuumHealth struct {
	Status         HealthStatus
	Summary        string
	RunningWorkers int32
	MaxWorkers     int32
	// LastAutovacuumAt is the newest autovacuum/autoanalyze across the connected
	// database's tables. Nil when nothing has ever been auto-maintained here.
	LastAutovacuumAt *time.Time
}

// OverviewMetricError identifies a failed InstanceOverview metric category.
type OverviewMetricError struct {
	Metric string
	Err    error
}

// ConnectionMetrics holds connection utilization from pg_stat_activity.
type ConnectionMetrics struct {
	Active int32
	Idle   int32
	Total  int32
	Max    int32
}

// StorageMetrics holds disk usage across all non-template databases.
type StorageMetrics struct {
	TotalSizeBytes int64
}

// CacheMetrics holds buffer cache performance aggregated across all databases.
type CacheMetrics struct {
	HitRatio   float64
	BlocksHit  int64
	BlocksRead int64
}

// IOMetrics holds pg_stat_io counters aggregated across the instance.
type IOMetrics struct {
	Reads       int64
	ReadBytes   int64
	Writes      int64
	WriteBytes  int64
	Extends     int64
	ExtendBytes int64
	Fsyncs      int64
}

// CacheCounters holds cumulative activity counters aggregated across all
// databases from pg_stat_database: buffer-cache blocks, transaction and tuple
// throughput, contention (conflicts, deadlocks), temp-file spill, and
// PostgreSQL 14+ session tallies (zero on older servers). StatsReset is the
// newest pg_stat_database.stats_reset, so explicit resets and crash recovery
// start a new rate window. Windowing on it is not airtight: DROP DATABASE
// shrinks the sums without a new reset (and can even move the max backward),
// so readers must additionally treat any negative delta as a discontinuity.
type CacheCounters struct {
	BlocksHit         int64
	BlocksRead        int64
	XactCommit        int64
	XactRollback      int64
	TupReturned       int64
	TupFetched        int64
	TupInserted       int64
	TupUpdated        int64
	TupDeleted        int64
	Conflicts         int64
	Deadlocks         int64
	TempFiles         int64
	TempBytes         int64
	Sessions          int64
	SessionsAbandoned int64
	SessionsFatal     int64
	SessionsKilled    int64
	StatsReset        *time.Time
}

// DatabaseSize is the on-disk size of one database at observation time.
type DatabaseSize struct {
	DatabaseName string
	SizeBytes    int64
}

// IOCounters holds cumulative pg_stat_io totals across the instance
// (PostgreSQL 16+). See CacheCounters for the StatsReset semantics.
type IOCounters struct {
	Reads       int64
	ReadBytes   int64
	Writes      int64
	WriteBytes  int64
	Extends     int64
	ExtendBytes int64
	Fsyncs      int64
	StatsReset  *time.Time
}

// VacuumCounters holds vacuum activity aggregated over the connected
// database's user tables. Tuple counts are gauges; vacuum counts are
// cumulative. StatsReset is the connected database's stats_reset — but DROP
// TABLE shrinks the sums without a new reset, so readers must additionally
// treat any negative delta as a discontinuity.
type VacuumCounters struct {
	LiveTuples      int64
	DeadTuples      int64
	VacuumCount     int64
	AutovacuumCount int64
	StatsReset      *time.Time
}

// Role represents a server-level PostgreSQL role within an external instance.
type Role struct {
	Name         string
	Attributes   RoleAttributes
	MemberOf     []RoleMembership
	IsSystemRole bool
	// Comment is the COMMENT ON ROLE description (pg_shdescription via
	// pg_authid), empty when the role has no comment.
	Comment string
}

// RoleAttributes contains PostgreSQL role attributes from pg_roles.
type RoleAttributes struct {
	CanLogin          bool
	IsSuperuser       bool
	CanCreateDatabase bool
	CanCreateRole     bool
	CanReplicate      bool
	BypassesRLS       bool
	InheritsByDefault bool
	ConnectionLimit   int32
	// ValidUntil is the password expiry time, or nil when there is no expiry
	// (including when the catalog stores 'infinity').
	ValidUntil *time.Time
	// ConfigParameters holds per-role default GUC settings ("name=value").
	ConfigParameters []string
}

// RoleMembership represents a direct role membership edge from pg_auth_members.
type RoleMembership struct {
	RoleName      string
	AdminOption   bool
	InheritOption bool
	SetOption     bool
	Grantor       string
}

// RoleGrant represents one object-level privilege granted directly to a role
// within a database, derived from catalog ACLs (pg_database.datacl,
// pg_namespace.nspacl, pg_class.relacl, pg_proc.proacl,
// pg_largeobject_metadata.lomacl).
type RoleGrant struct {
	// ObjectType is the normalized object category: one of "DATABASE",
	// "SCHEMA", "TABLE", "VIEW", "MATERIALIZED_VIEW", "SEQUENCE",
	// "FOREIGN_TABLE", "FUNCTION", "LARGE_OBJECT".
	ObjectType string
	// SchemaName is the containing schema. Empty for DATABASE grants; the
	// schema itself for SCHEMA grants.
	SchemaName string
	// ObjectName is the bare object name (relation/sequence name; database name
	// for DATABASE grants; OID text for LARGE_OBJECT grants). Empty for SCHEMA
	// grants.
	ObjectName string
	// Privilege is the PostgreSQL privilege keyword (e.g. "SELECT", "USAGE").
	Privilege string
	// WithGrantOption reports whether the role may grant this privilege onward.
	WithGrantOption bool
	// Grantor is the exact role name that granted the privilege, empty if unknown.
	Grantor string
}

// OwnedObject represents an object owned by a role within a database. Owners
// implicitly hold every privilege on the objects they own.
type OwnedObject struct {
	// ObjectType is the normalized object category: one of "DATABASE", "SCHEMA",
	// "TABLE", "VIEW", "MATERIALIZED_VIEW", "SEQUENCE", "FOREIGN_TABLE",
	// "FUNCTION", "LARGE_OBJECT". DATABASE denotes ownership of the connected
	// database itself.
	ObjectType string
	// SchemaName is the containing schema; the schema itself for SCHEMA objects;
	// empty for DATABASE.
	SchemaName string
	// ObjectName is the bare object name (database name for DATABASE; includes
	// function identity arguments for FUNCTION; OID text for LARGE_OBJECT). Empty
	// for SCHEMA objects.
	ObjectName string
}

// RoleDefaultPrivilege represents a default privilege (ALTER DEFAULT PRIVILEGES)
// that grants access to a role on objects created later by CreatorRoleName,
// derived from pg_default_acl.
type RoleDefaultPrivilege struct {
	// CreatorRoleName is the role whose newly created objects trigger this grant
	// (pg_default_acl.defaclrole; the FOR ROLE in ALTER DEFAULT PRIVILEGES).
	CreatorRoleName string
	// ObjectType is the future-object category: one of "TABLES", "SEQUENCES",
	// "FUNCTIONS", "TYPES", "SCHEMAS", "LARGE_OBJECTS".
	ObjectType string
	// SchemaName is the schema the default is scoped to, empty when it applies in
	// every schema (defaclnamespace = 0).
	SchemaName string
	// Privilege is the PostgreSQL privilege keyword (e.g. "SELECT").
	Privilege string
	// WithGrantOption reports whether the role may grant this privilege onward.
	WithGrantOption bool
}

// ServerInfo holds live metadata queried from a PostgreSQL instance.
type ServerInfo struct {
	Version        string
	VersionNum     int32
	StartedAt      time.Time
	IsInRecovery   bool
	MaxConnections int32
}

// Database represents a database within an external instance.
type Database struct {
	Name             string
	DisplayName      string
	CharacterSet     string
	Collation        string
	Owner            string
	LastDDLTime      *time.Time
	IsSystemDatabase bool
	CreateTime       *time.Time
}

// Schema represents a schema within a database.
type Schema struct {
	Name           string
	DisplayName    string
	Owner          string
	IsSystemSchema bool
	CreateTime     *time.Time
	LastDDLTime    *time.Time
}

// Extension represents a PostgreSQL extension available in a database.
type Extension struct {
	Name             string
	SchemaName       string
	DefaultVersion   string
	InstalledVersion string
	Comment          string
	Installed        bool
}

// Table represents a table within a schema.
type Table struct {
	Name          string
	DisplayName   string
	TableType     api.Table_TableType
	IsSystemTable bool
	Comment       string
	Owner         string
	RowCount      int64
	SizeBytes     int64
	CreateTime    *time.Time
	LastDDLTime   *time.Time
}

// DatabaseQueryInsights holds live, database-local optimization signals from
// PostgreSQL statistics views. PostgreSQL counters are cumulative since the
// server statistics reset unless the source view documents otherwise.
type DatabaseQueryInsights struct {
	TopQueries             []QueryRuntimeInsight
	SequentialScanHotspots []SequentialScanHotspot
	TableCacheHits         []TableCacheHitInsight
	QueryStatsAvailable    bool
	TableStatsAvailable    bool
	PartialErrors          []OverviewMetricError
}

// QueryRuntimeInsight represents one pg_stat_statements entry.
type QueryRuntimeInsight struct {
	QueryID        int64
	Query          string
	Calls          int64
	TotalTimeMs    float64
	MeanTimeMs     float64
	TotalTimeRatio float64
}

// SequentialScanHotspot represents a table with sequential-read pressure.
type SequentialScanHotspot struct {
	SchemaName           string
	TableName            string
	SequentialScans      int64
	SequentialTuplesRead int64
	IndexScans           int64
	EstimatedLiveRows    int64
	TotalSizeBytes       int64
	SequentialScanRatio  float64
}

// TableCacheHitInsight represents heap block cache locality for one table.
type TableCacheHitInsight struct {
	SchemaName     string
	TableName      string
	HeapBlocksHit  int64
	HeapBlocksRead int64
	HitRatio       float64
	TotalSizeBytes int64
}

type TablePartition struct {
	SchemaName     string
	TableName      string
	PartitionBound string
	EstimatedRows  int64
	TotalSizeBytes int64
}

type TablePartitionMetadata struct {
	PartitionKey     string
	PartitionBound   string
	ParentSchemaName string
	ParentTableName  string
	ChildPartitions  []TablePartition
	PartitionCount   int32
}

// Column represents a column within a table.
type Column struct {
	Name                   string
	OrdinalPosition        int32
	DataType               api.DataType // Abstract type enum (DATA_TYPE_STRING, etc.)
	RawType                string       // Engine-specific type (VARCHAR(255), Int64, etc.)
	IsNullable             bool
	IsPrimaryKey           bool
	DefaultValue           string
	CharacterMaximumLength int32
	Comment                string
	IsUnique               bool
	IsGenerated            bool
	GenerationExpression   string
	IsIdentity             bool
	IdentityGeneration     api.IdentityGeneration
}

// View represents a standard or materialized view within a schema.
type View struct {
	Name         string
	DisplayName  string
	ViewType     api.View_ViewType
	Owner        string
	Comment      string
	IsSystemView bool
	Definition   string
	SizeBytes    int64
	RowCount     int64
	IsPopulated  bool
	CreateTime   *time.Time
	LastDDLTime  *time.Time
}

// TableConstraint represents a constraint on a table.
type TableConstraint struct {
	Name        string
	Type        api.ConstraintType
	ColumnNames []string
	// ReferencedSchemaName and ReferencedTableName identify the table a
	// foreign key points at. They are carried separately because schema and
	// table identifiers may themselves contain dots, so a joined
	// "schema.table" string cannot be split back reliably.
	ReferencedSchemaName  string
	ReferencedTableName   string
	ReferencedColumnNames []string
	OnUpdate              api.ReferentialAction
	OnDelete              api.ReferentialAction
	Definition            string
}

// TableIndex represents an index on a table.
type TableIndex struct {
	Name            string
	Method          string
	IsUnique        bool
	KeyColumns      []string
	KeyParts        []string
	IncludedColumns []string
	Predicate       string
	SizeBytes       int64
	IsValid         bool
	HasExpression   bool
	Definition      string
	ScanCount       int64
	TuplesRead      int64
	TuplesFetched   int64
	BlocksHit       int64
	BlocksRead      int64
	HasUsageStats   bool
}

// TablePolicy represents a row-level security policy on a table.
type TablePolicy struct {
	Name            string
	Mode            api.PolicyMode
	Command         api.PolicyCommand
	Roles           []string
	UsingExpression string
	CheckExpression string
}

// TableTrigger represents a trigger on a table.
type TableTrigger struct {
	Name         string
	Timing       string
	Events       []string
	FunctionName string
	Enabled      bool
	Definition   string
}
