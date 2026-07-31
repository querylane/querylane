import { useChartContext } from "@/components/charts/chart-context";
import { formatTooltipTime } from "@/lib/chart-time";
import { cn } from "@/lib/utils";

/** The subset of Recharts tooltip entry fields this content reads. */
interface TooltipEntry {
  dataKey?: string | number;
  value?: number | null;
}

interface ChartTooltipContentProps {
  // Recharts injects `active`, `label`, and `payload` at render time; they are
  // optional here because v3 reads them from context, not the element's props.
  active?: boolean;
  compact?: boolean | undefined;
  label?: number | string;
  payload?: TooltipEntry[];
}

/**
 * The kit's shared tooltip readout: a full timestamp header, then one row per
 * configured series — every series at that X, in config order, so the pointer
 * never has to land on a specific line to get a value. Values lead (strong,
 * mono, tabular) and labels follow; each row is keyed by a short stroke of the
 * series color. Series/formatter come from the enclosing ChartContainer.
 */
export function ChartTooltipContent({
  active,
  compact = false,
  label,
  payload,
}: ChartTooltipContentProps) {
  const { formatDetailedValue, series } = useChartContext();

  if (!(active && payload && payload.length > 0)) {
    return null;
  }

  const entryBySeriesKey = new Map<string, TooltipEntry>();
  for (const entry of payload) {
    if (entry.dataKey !== undefined) {
      entryBySeriesKey.set(String(entry.dataKey), entry);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-popover text-popover-foreground shadow-xl",
        compact
          ? "min-w-28 max-w-[calc(100vw-2rem)] px-2 py-1 text-[11px]"
          : "min-w-36 px-2.5 py-1.5 text-xs"
      )}
    >
      {typeof label === "number" && (
        <div
          className={cn(
            "font-medium text-muted-foreground",
            compact ? "mb-1" : "mb-1.5"
          )}
        >
          {formatTooltipTime(label)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {series.map((item) => {
          const value = entryBySeriesKey.get(item.key)?.value;
          return (
            <div className="flex items-center gap-2" key={item.key}>
              <span
                aria-hidden="true"
                className={cn(
                  "h-3 w-1 shrink-0 rounded-full",
                  item.dotClassName,
                  // A lightened chip marks context series (previous period),
                  // mirroring their translucent dashed stroke on the plot.
                  item.dashed && "opacity-50"
                )}
              />
              <span
                className={cn(
                  "text-muted-foreground",
                  compact && "max-w-20 truncate"
                )}
              >
                {item.label}
              </span>
              <span
                className={cn(
                  "ml-auto font-medium font-mono tabular-nums",
                  compact ? "pl-1.5" : "pl-3"
                )}
              >
                {typeof value === "number" ? formatDetailedValue(value) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
