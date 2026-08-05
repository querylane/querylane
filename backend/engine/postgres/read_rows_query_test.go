package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	api "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestBuildPredicate_AdvancedOperators(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		predicate *api.RowPredicate
		wantSQL   string
		wantArgs  []any
	}{
		{
			name: "regular expression",
			predicate: &api.RowPredicate{
				Column: "email", Operator: api.RowPredicate_OPERATOR_MATCH,
				Values: []*api.TableValue{strVal(`^[^@]+@example\.com$`)},
			},
			wantSQL:  `"email"::text ~ $1`,
			wantArgs: []any{`^[^@]+@example\.com$`},
		},
		{
			name: "case insensitive regular expression",
			predicate: &api.RowPredicate{
				Column: "email", Operator: api.RowPredicate_OPERATOR_IMATCH,
				Values: []*api.TableValue{strVal(`acme$`)},
			},
			wantSQL:  `"email"::text ~* $1`,
			wantArgs: []any{`acme$`},
		},
		{
			name: "null safe inequality",
			predicate: &api.RowPredicate{
				Column: "status", Operator: api.RowPredicate_OPERATOR_IS_DISTINCT,
				Values: []*api.TableValue{strVal("done")},
			},
			wantSQL:  `"status" IS DISTINCT FROM $1`,
			wantArgs: []any{"done"},
		},
		{
			name:      "boolean identity",
			predicate: &api.RowPredicate{Column: "active", Operator: api.RowPredicate_OPERATOR_IS_TRUE},
			wantSQL:   `"active" IS TRUE`,
		},
		{
			name:      "boolean false identity",
			predicate: &api.RowPredicate{Column: "active", Operator: api.RowPredicate_OPERATOR_IS_FALSE},
			wantSQL:   `"active" IS FALSE`,
		},
		{
			name:      "boolean unknown identity",
			predicate: &api.RowPredicate{Column: "active", Operator: api.RowPredicate_OPERATOR_IS_UNKNOWN},
			wantSQL:   `"active" IS UNKNOWN`,
		},
		{
			name: "generic negation preserves predicate grouping",
			predicate: &api.RowPredicate{
				Column: "email", Operator: api.RowPredicate_OPERATOR_ILIKE, Negated: true,
				Values: []*api.TableValue{strVal("%@example.com")},
			},
			wantSQL:  `NOT ("email" ILIKE $1)`,
			wantArgs: []any{"%@example.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			args := &argList{}
			got, err := buildPredicate(args, tt.predicate)

			require.NoError(t, err)
			assert.Equal(t, tt.wantSQL, got)
			assert.Equal(t, tt.wantArgs, args.values())
		})
	}
}
