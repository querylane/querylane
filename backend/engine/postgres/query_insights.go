package postgres

import (
	"context"
	"database/sql"
	"log/slog"
	"regexp"
	"strings"

	"github.com/querylane/querylane/backend/engine"
)

const (
	queryInsightsMetricQueryStats = "query_stats"
	tableInsightsMetricTableStats = "table_stats"
	queryPreviewMaxRunes          = 240
)

var postgresSingleQuotedLiteralPattern = regexp.MustCompile(`'([^']|'')*'`)

// GetDatabaseQueryInsights retrieves live database-local query optimization
// signals from PostgreSQL statistics views. The stats are cumulative since the
// PostgreSQL stats reset; time-windowed deltas require Querylane sampling.
func (d *Postgres) GetDatabaseQueryInsights(ctx context.Context, db *sql.DB) (*engine.DatabaseQueryInsights, error) {
	insights := &engine.DatabaseQueryInsights{}

	if err := d.populateTopQueries(ctx, db, insights); err != nil {
		recordQueryInsightsPartialError(ctx, insights, queryInsightsMetricQueryStats, "failed to query pg_stat_statements", "query pg_stat_statements", err)
	}

	if err := d.populateTableInsights(ctx, db, insights); err != nil {
		recordQueryInsightsPartialError(ctx, insights, tableInsightsMetricTableStats, "failed to query table statistics", "query table statistics", err)
	}

	return insights, nil
}

func (d *Postgres) populateTopQueries(ctx context.Context, db *sql.DB, insights *engine.DatabaseQueryInsights) error {
	rows, err := db.QueryContext(ctx, getTopQueriesQuery)
	if err != nil {
		return err
	}
	defer rows.Close()

	var topQueries []engine.QueryRuntimeInsight

	for rows.Next() {
		var (
			query     engine.QueryRuntimeInsight
			queryText sql.NullString
		)
		if err := rows.Scan(
			&query.QueryID,
			&queryText,
			&query.Calls,
			&query.TotalTimeMs,
			&query.MeanTimeMs,
			&query.TotalTimeRatio,
		); err != nil {
			return err
		}

		query.Query = redactQueryPreview(queryText)
		topQueries = append(topQueries, query)
	}

	if err := rows.Err(); err != nil {
		return err
	}

	insights.QueryStatsAvailable = true
	insights.TopQueries = topQueries

	return nil
}

func (d *Postgres) populateTableInsights(ctx context.Context, db *sql.DB, insights *engine.DatabaseQueryInsights) error {
	hotspots, err := d.listSequentialScanHotspots(ctx, db)
	if err != nil {
		return err
	}

	cacheHits, err := d.listTableCacheHits(ctx, db)
	if err != nil {
		return err
	}

	insights.TableStatsAvailable = true
	insights.SequentialScanHotspots = hotspots
	insights.TableCacheHits = cacheHits

	return nil
}

func (d *Postgres) listSequentialScanHotspots(ctx context.Context, db *sql.DB) ([]engine.SequentialScanHotspot, error) {
	rows, err := db.QueryContext(ctx, getTableQueryInsightsQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hotspots []engine.SequentialScanHotspot

	for rows.Next() {
		var hotspot engine.SequentialScanHotspot
		if err := rows.Scan(
			&hotspot.SchemaName,
			&hotspot.TableName,
			&hotspot.SequentialScans,
			&hotspot.SequentialTuplesRead,
			&hotspot.IndexScans,
			&hotspot.EstimatedLiveRows,
			&hotspot.TotalSizeBytes,
			&hotspot.SequentialScanRatio,
		); err != nil {
			return nil, err
		}

		hotspots = append(hotspots, hotspot)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return hotspots, nil
}

func (d *Postgres) listTableCacheHits(ctx context.Context, db *sql.DB) ([]engine.TableCacheHitInsight, error) {
	rows, err := db.QueryContext(ctx, getTableCacheHitInsightsQuery)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cacheHits []engine.TableCacheHitInsight

	for rows.Next() {
		var cacheHit engine.TableCacheHitInsight
		if err := rows.Scan(
			&cacheHit.SchemaName,
			&cacheHit.TableName,
			&cacheHit.HeapBlocksHit,
			&cacheHit.HeapBlocksRead,
			&cacheHit.HitRatio,
			&cacheHit.TotalSizeBytes,
		); err != nil {
			return nil, err
		}

		cacheHits = append(cacheHits, cacheHit)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return cacheHits, nil
}

func redactQueryPreview(queryText sql.NullString) string {
	if !queryText.Valid {
		return ""
	}

	lines := strings.Split(strings.ReplaceAll(queryText.String, "\r\n", "\n"), "\n")
	for index, line := range lines {
		lines[index] = strings.Join(strings.Fields(line), " ")
	}

	query := strings.TrimSpace(strings.Join(lines, "\n"))
	if query == "" {
		return ""
	}

	query = postgresSingleQuotedLiteralPattern.ReplaceAllString(query, "?")

	queryRunes := []rune(query)
	if len(queryRunes) > queryPreviewMaxRunes {
		return string(queryRunes[:queryPreviewMaxRunes]) + "…"
	}

	return query
}

func recordQueryInsightsPartialError(ctx context.Context, insights *engine.DatabaseQueryInsights, metric, logMessage, op string, err error) {
	classified := classifyQueryError(op, err)
	slog.WarnContext(ctx, logMessage, slog.String("error", classified.Error()))

	insights.PartialErrors = append(insights.PartialErrors, engine.OverviewMetricError{
		Metric: metric,
		Err:    classified,
	})
}
