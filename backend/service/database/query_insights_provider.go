package database

import (
	"context"
	"fmt"

	"github.com/querylane/querylane/backend/engine"
	"github.com/querylane/querylane/backend/resource"
)

type instanceSessionOpener interface {
	OpenInstance(ctx context.Context, instanceName resource.InstanceName) (engine.InstanceSession, error)
}

// QueryInsightsProvider fetches live query insights from user databases.
type QueryInsightsProvider struct {
	sessions instanceSessionOpener
}

// NewQueryInsightsProvider creates a provider backed by the engine session resolver.
func NewQueryInsightsProvider(sessions instanceSessionOpener) *QueryInsightsProvider {
	return &QueryInsightsProvider{sessions: sessions}
}

// GetDatabaseQueryInsights fetches live database-local query insights.
func (p *QueryInsightsProvider) GetDatabaseQueryInsights(ctx context.Context, db resource.DatabaseName) (*engine.DatabaseQueryInsights, error) {
	instanceSession, err := p.sessions.OpenInstance(ctx, resource.NewInstanceName(db.InstanceID))
	if err != nil {
		return nil, fmt.Errorf("open instance: %w", err)
	}
	defer instanceSession.Close()

	databaseSession, err := instanceSession.OpenDatabase(ctx, db.DatabaseID)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	defer databaseSession.Close()

	insights, err := databaseSession.GetDatabaseQueryInsights(ctx)
	if err != nil {
		return nil, fmt.Errorf("get database query insights: %w", err)
	}

	return insights, nil
}
