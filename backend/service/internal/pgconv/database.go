package pgconv

import (
	serverconfig "github.com/querylane/querylane/backend/config/server"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

// DatabaseConfigToProto converts a server-side Database config to its protobuf
// representation. The password is intentionally omitted for security. Port
// values outside the valid range (0–65535) fall back to 5432.
func DatabaseConfigToProto(db *serverconfig.Database) *v1alpha1.PostgresConfig {
	port := int32(db.Port) //nolint:gosec // port range guarded below
	if db.Port > 65535 || db.Port < 0 {
		port = 5432
	}

	return &v1alpha1.PostgresConfig{
		Host:     db.Host,
		Port:     port,
		Database: db.Database,
		Username: db.Username,
		SslMode:  SSLModeToProto(db.SSLMode),
	}
}
