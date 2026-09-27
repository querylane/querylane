import { MetricChart, MetricSparkline } from "@/components/charts/metric-chart";
import { METRIC_CHART_SAMPLE_DATA } from "@/visual-harness/chart-scenario-data";

// Shared by metric-chart.rstest-browser.test.tsx and the Playwright visual
// harness, so both runners exercise identical markup.
function MetricChartKitScenario() {
  return (
    <div
      className="w-[760px] space-y-6 rounded-xl border border-border bg-card p-6"
      data-testid="metric-chart-fixture"
    >
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base">Requests</h2>
            <p className="text-muted-foreground text-xs">
              Current and previous five-minute windows
            </p>
          </div>
          <div className="h-12 w-40">
            <MetricSparkline
              color="var(--color-chart-1)"
              data={METRIC_CHART_SAMPLE_DATA}
              seriesKey="requests"
            />
          </div>
        </div>
        <div className="h-72 w-full" data-testid="metric-chart-surface">
          <MetricChart
            data={METRIC_CHART_SAMPLE_DATA}
            formatDetailedValue={(value) => `${value.toFixed(2)} req/s`}
            formatValue={(value) => `${value} req/s`}
            series={[
              {
                color: "var(--color-chart-1)",
                dotClassName: "bg-chart-1",
                key: "requests",
                label: "Current",
              },
              {
                color: "var(--color-chart-1)",
                dashed: true,
                dotClassName: "bg-chart-1",
                key: "previous",
                label: "Previous",
              },
            ]}
            thresholds={[
              { label: "Alert threshold", tone: "critical", value: 20 },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export { MetricChartKitScenario };
