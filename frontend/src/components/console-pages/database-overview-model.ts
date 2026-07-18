import type {
  CatalogObject,
  CatalogSchema,
  DatabaseCatalogResult,
} from "@/hooks/api/database-catalog";

const TOP_OBJECT_ROWS = 8;
const PERCENT = 100;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MS_ROUNDING_FLOOR = 10;

function toTopObjects(
  catalog: DatabaseCatalogResult | undefined
): CatalogObject[] {
  if (!catalog) {
    return [];
  }
  return [...catalog.objects]
    .filter((object) => !object.isSystem)
    .sort((left, right) => Number(right.sizeBytes - left.sizeBytes))
    .slice(0, TOP_OBJECT_ROWS);
}

/** Schemas ordered by how much of the database they occupy. */
function toSortedSchemas(
  catalog: DatabaseCatalogResult | undefined
): CatalogSchema[] {
  if (!catalog) {
    return [];
  }
  return [...catalog.schemas].sort((left, right) =>
    Number(right.totalSizeBytes - left.totalSizeBytes)
  );
}

function widthPercent(ratio: number): string {
  return `${Math.max(0, Math.min(1, ratio)) * PERCENT}%`;
}

function formatMs(ms: number): string {
  if (ms >= MS_PER_MINUTE) {
    return `${(ms / MS_PER_MINUTE).toFixed(1)} min`;
  }
  if (ms >= MS_PER_SECOND) {
    return `${(ms / MS_PER_SECOND).toFixed(1)} s`;
  }
  if (ms >= MS_ROUNDING_FLOOR) {
    return `${Math.round(ms)} ms`;
  }
  return `${ms.toFixed(2)} ms`;
}

export { formatMs, toSortedSchemas, toTopObjects, widthPercent };
