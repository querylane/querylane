import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface MapFacetFiltersProps<Kind extends string> {
  filters: readonly { kind: Kind; label: string; description: string }[];
  idPrefix: string;
  onToggle: (kind: Kind, checked: boolean) => void;
  visibility: Record<Kind, boolean>;
}

export function MapFacetFilters<Kind extends string>({
  filters,
  idPrefix,
  visibility,
  onToggle,
}: MapFacetFiltersProps<Kind>) {
  return (
    <div className="grid gap-2">
      {filters.map((filter) => {
        const switchId = `${idPrefix}-${filter.kind}`;
        return (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border bg-card/80 p-2"
            key={filter.kind}
          >
            <div className="min-w-0">
              <Label htmlFor={switchId}>{filter.label}</Label>
              <p className="mt-1 truncate text-muted-foreground text-xs">
                {filter.description}
              </p>
            </div>
            <Switch
              checked={visibility[filter.kind]}
              id={switchId}
              onCheckedChange={(checked) => onToggle(filter.kind, checked)}
              size="sm"
            />
          </div>
        );
      })}
    </div>
  );
}
