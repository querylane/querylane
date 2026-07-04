import { parseTableQualifiedName } from "@/lib/console-resources";
import type {
  TablePartition,
  TablePartitionMetadata,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

type PartitionBoundKind = "default" | "hash" | "list" | "other" | "range";

interface ChildPartitionFilters {
  boundKinds?: PartitionBoundKind[] | undefined;
  schemaNames?: string[] | undefined;
}

function hasPartitionMetadata(
  metadata: TablePartitionMetadata | undefined
): metadata is TablePartitionMetadata {
  return Boolean(
    metadata &&
      (metadata.partitionKey ||
        metadata.partitionBound ||
        metadata.parentTable ||
        metadata.childPartitions.length > 0)
  );
}

function derivePartitionTabCount(
  metadata: TablePartitionMetadata | undefined
): number | undefined {
  if (!metadata || metadata.partitionCount <= 0) {
    return;
  }
  return metadata.partitionCount;
}

function formatPartitionResourceLabel(resourceName: string): string {
  if (!resourceName) {
    return "—";
  }
  try {
    const { schema, table } = parseTableQualifiedName(resourceName);
    return `${schema}.${table}`;
  } catch {
    return resourceName;
  }
}

function partitionSchemaName(partition: TablePartition): string {
  if (!partition.table) {
    return "—";
  }
  try {
    return parseTableQualifiedName(partition.table).schema;
  } catch {
    return "—";
  }
}

function partitionBoundKind(partition: TablePartition): PartitionBoundKind {
  const bound = partition.partitionBound.trim().toUpperCase();
  if (bound === "DEFAULT" || bound.includes(" DEFAULT")) {
    return "default";
  }
  if (bound.startsWith("FOR VALUES FROM")) {
    return "range";
  }
  if (bound.startsWith("FOR VALUES IN")) {
    return "list";
  }
  if (bound.startsWith("FOR VALUES WITH")) {
    return "hash";
  }
  return "other";
}

function filterChildPartitions(
  partitions: TablePartition[],
  filters: ChildPartitionFilters
): TablePartition[] {
  const schemaNames = filters.schemaNames ?? [];
  const boundKinds = filters.boundKinds ?? [];
  return partitions.filter((partition) => {
    if (
      schemaNames.length > 0 &&
      !schemaNames.includes(partitionSchemaName(partition))
    ) {
      return false;
    }
    if (
      boundKinds.length > 0 &&
      !boundKinds.includes(partitionBoundKind(partition))
    ) {
      return false;
    }
    return true;
  });
}

export type { ChildPartitionFilters, PartitionBoundKind };
export {
  derivePartitionTabCount,
  filterChildPartitions,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  partitionBoundKind,
  partitionSchemaName,
};
