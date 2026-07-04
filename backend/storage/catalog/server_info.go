package catalog

import (
	"context"
	"errors"
	"fmt"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"

	"github.com/querylane/querylane/backend/storage"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/model"
	"github.com/querylane/querylane/backend/storage/gen/querylane/public/table"
)

// GetServerInfo returns the cached server info row for an instance; storage.ErrNotFound when absent.
func (r *PGRepository) GetServerInfo(ctx context.Context, instanceID string) (*model.CatalogServerInfo, error) {
	stmt := postgres.SELECT(table.CatalogServerInfo.AllColumns).
		FROM(table.CatalogServerInfo).
		WHERE(table.CatalogServerInfo.InstanceID.EQ(postgres.String(instanceID)))

	var row model.CatalogServerInfo
	if err := stmt.QueryContext(ctx, r.db, &row); err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, storage.ErrNotFound
		}

		return nil, fmt.Errorf("get server info: %w", err)
	}

	return &row, nil
}

// SyncServerInfo upserts the cached server info row, refreshing every column.
func (r *PGRepository) SyncServerInfo(ctx context.Context, info model.CatalogServerInfo) error {
	stmt := table.CatalogServerInfo.
		INSERT(table.CatalogServerInfo.AllColumns).
		MODEL(info).
		ON_CONFLICT(table.CatalogServerInfo.InstanceID).
		DO_UPDATE(postgres.SET(
			table.CatalogServerInfo.Version.SET(table.CatalogServerInfo.EXCLUDED.Version),
			table.CatalogServerInfo.VersionNum.SET(table.CatalogServerInfo.EXCLUDED.VersionNum),
			table.CatalogServerInfo.StartedAt.SET(table.CatalogServerInfo.EXCLUDED.StartedAt),
			table.CatalogServerInfo.IsInRecovery.SET(table.CatalogServerInfo.EXCLUDED.IsInRecovery),
			table.CatalogServerInfo.MaxConnections.SET(table.CatalogServerInfo.EXCLUDED.MaxConnections),
			table.CatalogServerInfo.SyncedAt.SET(table.CatalogServerInfo.EXCLUDED.SyncedAt),
		))

	if _, err := stmt.ExecContext(ctx, r.db); err != nil {
		return fmt.Errorf("upsert server info: %w", err)
	}

	return nil
}
