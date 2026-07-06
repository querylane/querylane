import { Button } from "@/components/ui/button";

/** A selectable trailing window; structurally satisfied by lib MetricRange. */
interface ChartRangeOption {
  hours: number;
  key: string;
  shortLabel: string;
}

interface ChartRangePickerProps {
  onRangeChange: (rangeHours: number) => void;
  options: ChartRangeOption[];
  range: ChartRangeOption;
}

/**
 * The kit's time-range control: a compact segmented picker built from Button
 * variants (there is no ToggleGroup primitive) — the active range reads as
 * `secondary`, the rest as `ghost`, so state comes from the variant, not
 * overridden colors. Place it once, above the charts it scopes, so every chart
 * and stat below re-renders against the same window; never embed a range
 * control inside an individual chart.
 */
export function ChartRangePicker({
  onRangeChange,
  options,
  range,
}: ChartRangePickerProps) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5"
      data-slot="button-group"
    >
      {options.map((option) => {
        const isActive = option.hours === range.hours;
        return (
          <Button
            aria-pressed={isActive}
            key={option.key}
            onClick={() => onRangeChange(option.hours)}
            size="sm"
            variant={isActive ? "secondary" : "ghost"}
          >
            {option.shortLabel}
          </Button>
        );
      })}
    </div>
  );
}
