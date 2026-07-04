package catalog

import (
	"database/sql"
)

// PGRepository provides CRUD access to cached catalog data in the meta
// database. Consumers depend on the interface defined in their own package
// (per the consumer-side-interface convention) rather than on a re-exported
// version here.
type PGRepository struct {
	db *sql.DB
}

// New creates a new catalog repository.
func New(db *sql.DB) *PGRepository {
	return &PGRepository{db: db}
}
