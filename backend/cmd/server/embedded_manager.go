//go:build !no_embedded_postgres

package server

import "github.com/querylane/querylane/backend/embeddedpg"

func newEmbeddedManager() (*embeddedpg.Manager, error) {
	return embeddedpg.NewManager(embeddedpg.Config{}), nil
}
