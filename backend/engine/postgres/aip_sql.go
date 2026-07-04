package postgres

import "github.com/querylane/querylane/backend/aip/rawsql"

// withPostgresErrorClassifier composes the live PostgreSQL SQLSTATE classifier
// with any mapper already installed on the AIP SQL query.
func withPostgresErrorClassifier(query rawsql.Query, op string) rawsql.Query {
	previousMapper := query.ErrorMapper
	query.ErrorMapper = func(err error) error {
		mapped := err
		if previousMapper != nil {
			if previousErr := previousMapper(err); previousErr != nil {
				mapped = previousErr
			}
		}

		return classifyQueryError(op, mapped)
	}

	return query
}
