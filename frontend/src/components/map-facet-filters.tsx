import { FilterToggle } from "@/components/querylane-ui/filter-toggle";

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
      {filters.map((filter) => (
        <FilterToggle
          checked={visibility[filter.kind]}
          description={filter.description}
          id={`${idPrefix}-${filter.kind}`}
          key={filter.kind}
          label={filter.label}
          onCheckedChange={(checked) => onToggle(filter.kind, checked)}
        />
      ))}
    </div>
  );
}
