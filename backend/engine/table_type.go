package engine

import api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"

// ParseTableType converts canonical proto enum names and legacy PostgreSQL
// information_schema table type strings into the Table.TableType enum.
func ParseTableType(s string) api.Table_TableType {
	if v, ok := api.Table_TableType_value[s]; ok {
		return api.Table_TableType(v)
	}

	switch s {
	case "BASE TABLE", "BASE_TABLE":
		return api.Table_TABLE_TYPE_BASE_TABLE
	case "FOREIGN":
		return api.Table_TABLE_TYPE_EXTERNAL
	case "LOCAL TEMPORARY":
		return api.Table_TABLE_TYPE_TEMPORARY
	default:
		return api.Table_TABLE_TYPE_UNSPECIFIED
	}
}
