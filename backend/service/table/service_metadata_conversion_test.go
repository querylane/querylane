package table

import (
	"testing"

	"github.com/querylane/querylane/backend/engine"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
	"github.com/querylane/querylane/backend/resource"
)

func TestConvertTableMetadataUsesExplicitObjectNameFields(t *testing.T) {
	t.Parallel()

	columns := convertColumns([]engine.Column{{
		Name:                 "customer_id",
		IsGenerated:          true,
		GenerationExpression: "lower(email)",
		IsIdentity:           true,
		IdentityGeneration:   v1alpha1.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT,
	}})
	if got := columns[0].GetColumnName(); got != "customer_id" {
		t.Fatalf("column name field = %q, want customer_id", got)
	}

	if !columns[0].GetIsGenerated() {
		t.Fatal("generated column flag was not propagated")
	}

	if got := columns[0].GetGenerationExpression(); got != "lower(email)" {
		t.Fatalf("generation expression = %q, want lower(email)", got)
	}

	if !columns[0].GetIsIdentity() {
		t.Fatal("identity column flag was not propagated")
	}

	if got := columns[0].GetIdentityGeneration(); got != v1alpha1.IdentityGeneration_IDENTITY_GENERATION_BY_DEFAULT {
		t.Fatalf("identity generation = %v, want by default", got)
	}

	constraints := convertConstraints([]engine.TableConstraint{{
		Name:                  "customers_pkey",
		Type:                  v1alpha1.ConstraintType_CONSTRAINT_TYPE_PRIMARY_KEY,
		ColumnNames:           []string{"tenant_id", "customer_id"},
		ReferencedColumnNames: []string{"tenant_id", "id"},
	}}, resource.NewSchemaName("prod", "app", "public"))
	if got := constraints[0].GetConstraintName(); got != "customers_pkey" {
		t.Fatalf("constraint name field = %q, want customers_pkey", got)
	}

	if got := constraints[0].GetColumnNames(); len(got) != 2 || got[0] != "tenant_id" || got[1] != "customer_id" {
		t.Fatalf("column names = %v, want [tenant_id customer_id]", got)
	}

	if got := constraints[0].GetReferencedColumnNames(); len(got) != 2 || got[0] != "tenant_id" || got[1] != "id" {
		t.Fatalf("referenced column names = %v, want [tenant_id id]", got)
	}

	indexes := convertIndexes([]engine.TableIndex{{Name: "customers_email_idx"}})
	if got := indexes[0].GetIndexName(); got != "customers_email_idx" {
		t.Fatalf("index name field = %q, want customers_email_idx", got)
	}

	policies := convertPolicies([]engine.TablePolicy{{Name: "tenant_isolation"}})
	if got := policies[0].GetPolicyName(); got != "tenant_isolation" {
		t.Fatalf("policy name field = %q, want tenant_isolation", got)
	}

	triggers := convertTriggers([]engine.TableTrigger{{Name: "audit_customers"}})
	if got := triggers[0].GetTriggerName(); got != "audit_customers" {
		t.Fatalf("trigger name field = %q, want audit_customers", got)
	}
}

func TestConvertConstraintReferencedTableRemainsResourceName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		refSchema string
		refTable  string
		want      string
	}{
		{
			name:      "simple schema",
			refSchema: "billing",
			refTable:  "accounts",
			want:      "instances/prod/databases/app/schemas/billing/tables/accounts",
		},
		{
			name:      "dotted schema",
			refSchema: "my.schema",
			refTable:  "accounts",
			want:      "instances/prod/databases/app/schemas/my.schema/tables/accounts",
		},
		{
			name:      "dotted table",
			refSchema: "billing",
			refTable:  "accounts.archive",
			want:      "instances/prod/databases/app/schemas/billing/tables/accounts.archive",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			constraints := convertConstraints([]engine.TableConstraint{{
				Name:                 "customers_account_id_fkey",
				ReferencedSchemaName: tt.refSchema,
				ReferencedTableName:  tt.refTable,
			}}, resource.NewSchemaName("prod", "app", "public"))

			if got := constraints[0].GetReferencedTable(); got != tt.want {
				t.Fatalf("referenced table = %q, want %q", got, tt.want)
			}
		})
	}
}
