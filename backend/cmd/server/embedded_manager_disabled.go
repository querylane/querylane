//go:build no_embedded_postgres

package server

import (
	"errors"

	"github.com/querylane/querylane/backend/embeddedpg"
)

func newEmbeddedManager() (*embeddedpg.Manager, error) {
	return nil, errors.New("Embedded PostgreSQL is unavailable in this Querylane image.")
}
