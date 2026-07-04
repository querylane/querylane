// Package resource provides utilities for parsing and constructing hierarchical
// resource names following Google AIP patterns used in the Querylane API.
//
// The package supports the following resource types:
//   - Instance: instances/{instance}
//   - Role: instances/{instance}/roles/{role}
//   - Database: instances/{instance}/databases/{database}
//   - Schema: instances/{instance}/databases/{database}/schemas/{schema}
//   - Table: instances/{instance}/databases/{database}/schemas/{schema}/tables/{table}
//
// Each resource type provides:
//   - A typed struct (e.g., InstanceName, RoleName, DatabaseName, SchemaName, TableName)
//   - Constructor function (e.g., NewInstanceName, NewDatabaseName, NewSchemaName)
//   - Parser function (e.g., ParseInstanceName, ParseDatabaseName, ParseSchemaName)
//   - Must parser for tests (e.g., MustParseInstanceName, MustParseSchemaName)
//   - Parent() method for hierarchical navigation
//   - String() method for canonical representation
//   - Text marshaling interfaces for integration with config/JSON
//
// Example usage:
//
//	// Parse a resource name
//	inst, err := resource.ParseInstanceName("instances/my-inst")
//	if err != nil {
//		return err
//	}
//
//	// Access components
//	fmt.Println("Instance:", inst.InstanceID)
//
//	// Construct new names
//	db := resource.NewDatabaseName(inst.InstanceID, "mydb")
//	fmt.Println("Database name:", db.String())
package resource
