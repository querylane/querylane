package pgconv

import (
	"testing"

	"github.com/stretchr/testify/assert"

	serverconfig "github.com/querylane/querylane/backend/config/server"
	v1alpha1 "github.com/querylane/querylane/backend/protogen/querylane/console/v1alpha1"
)

func TestDatabaseConfigToProto(t *testing.T) {
	t.Parallel()

	db := &serverconfig.Database{
		Host:     "db.example.com",
		Port:     5433,
		Database: "querylane",
		Username: "admin",
		SSLMode:  "require",
		Password: "super-secret",
	}

	got := DatabaseConfigToProto(db)

	assert.Equal(t, "db.example.com", got.GetHost())
	assert.Equal(t, int32(5433), got.GetPort())
	assert.Equal(t, "querylane", got.GetDatabase())
	assert.Equal(t, "admin", got.GetUsername())
	assert.Equal(t, v1alpha1.PostgresConfig_SSL_MODE_REQUIRE, got.GetSslMode())
	assert.Empty(t, got.GetPassword(), "password must never be copied into the proto")
}

func TestDatabaseConfigToProtoPortRange(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		port int
		want int32
	}{
		{name: "common port", port: 5432, want: 5432},
		{name: "zero port is kept", port: 0, want: 0},
		{name: "max valid port", port: 65535, want: 65535},
		{name: "above range falls back", port: 65536, want: 5432},
		{name: "negative falls back", port: -1, want: 5432},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := DatabaseConfigToProto(&serverconfig.Database{Port: tt.port})
			assert.Equal(t, tt.want, got.GetPort())
		})
	}
}
