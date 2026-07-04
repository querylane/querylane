package engine

// Object-type tokens are the denormalized strings the live catalog queries emit
// for the object_type column (the proto enum name minus its prefix). They are
// the single Go source of truth for two consumers: the bounded FilterValues set
// on the object_type filter field, and the service-layer enum mapping (which is
// test-covered against these slices). The SQL CASE statements in queries/*.sql
// remain the database-side source; keep them in sync with these lists.

// GrantObjectTypeTokens are the singular tokens used by the owned-objects
// and grant queries (e.g. "TABLE", "VIEW").
var GrantObjectTypeTokens = []string{
	"DATABASE",
	"SCHEMA",
	"TABLE",
	"VIEW",
	"MATERIALIZED_VIEW",
	"SEQUENCE",
	"FOREIGN_TABLE",
	"FUNCTION",
	"LARGE_OBJECT",
}

// DefaultPrivilegeObjectTypeTokens are the plural tokens used by the
// default-privileges query (e.g. "TABLES", "SEQUENCES").
var DefaultPrivilegeObjectTypeTokens = []string{
	"TABLES",
	"SEQUENCES",
	"FUNCTIONS",
	"TYPES",
	"SCHEMAS",
	"LARGE_OBJECTS",
}
