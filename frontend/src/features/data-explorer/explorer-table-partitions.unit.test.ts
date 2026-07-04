import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  derivePartitionTabCount,
  filterChildPartitions,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  partitionBoundKind,
  partitionSchemaName,
} from "@/features/data-explorer/explorer-table-partitions";
import {
  TablePartitionMetadataSchema,
  TablePartitionSchema,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

describe("table partition detail helpers", () => {
  test("detects ordinary tables without partition metadata", () => {
    const metadata = create(TablePartitionMetadataSchema, {});

    expect(hasPartitionMetadata(metadata)).toBe(false);
    expect(derivePartitionTabCount(metadata)).toBeUndefined();
  });

  test("summarizes parent partitioned tables by direct child count", () => {
    const metadata = create(TablePartitionMetadataSchema, {
      childPartitions: [
        create(TablePartitionSchema, {
          partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
          table: "instances/i/databases/d/schemas/analytics/tables/events_2024",
        }),
        create(TablePartitionSchema, {
          partitionBound: "FOR VALUES FROM ('2025-01-01') TO ('2026-01-01')",
          table: "instances/i/databases/d/schemas/analytics/tables/events_2025",
        }),
      ],
      partitionCount: 2,
      partitionKey: "RANGE (occurred_at)",
    });

    expect(hasPartitionMetadata(metadata)).toBe(true);
    expect(derivePartitionTabCount(metadata)).toBe(2);
  });

  test("treats child partition bounds and parent links as partition metadata", () => {
    const metadata = create(TablePartitionMetadataSchema, {
      parentTable: "instances/i/databases/d/schemas/analytics/tables/events",
      partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
    });

    expect(hasPartitionMetadata(metadata)).toBe(true);
    expect(derivePartitionTabCount(metadata)).toBeUndefined();
    expect(formatPartitionResourceLabel(metadata.parentTable)).toBe(
      "analytics.events"
    );
  });

  test("classifies child partition schema and bound kind", () => {
    const rangePartition = create(TablePartitionSchema, {
      partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
      table: "instances/i/databases/d/schemas/analytics/tables/events_2024",
    });

    expect(partitionSchemaName(rangePartition)).toBe("analytics");
    expect(partitionBoundKind(rangePartition)).toBe("range");
    expect(
      partitionBoundKind(
        create(TablePartitionSchema, {
          partitionBound: "FOR VALUES IN ('active', 'pending')",
        })
      )
    ).toBe("list");
    expect(
      partitionBoundKind(
        create(TablePartitionSchema, {
          partitionBound: "FOR VALUES WITH (modulus 4, remainder 1)",
        })
      )
    ).toBe("hash");
    expect(
      partitionBoundKind(
        create(TablePartitionSchema, { partitionBound: "DEFAULT" })
      )
    ).toBe("default");
    expect(partitionBoundKind(create(TablePartitionSchema, {}))).toBe("other");
  });

  test("filters child partitions by schema and bound kind", () => {
    const partitions = [
      create(TablePartitionSchema, {
        partitionBound: "FOR VALUES FROM ('2024-01-01') TO ('2025-01-01')",
        table: "instances/i/databases/d/schemas/analytics/tables/events_2024",
      }),
      create(TablePartitionSchema, {
        partitionBound: "FOR VALUES IN ('enterprise')",
        table:
          "instances/i/databases/d/schemas/archive/tables/events_enterprise",
      }),
      create(TablePartitionSchema, {
        partitionBound: "FOR VALUES IN ('free')",
        table: "instances/i/databases/d/schemas/analytics/tables/events_free",
      }),
    ];

    expect(
      filterChildPartitions(partitions, {
        boundKinds: ["list"],
        schemaNames: ["analytics"],
      }).map((partition) => partition.table)
    ).toEqual(["instances/i/databases/d/schemas/analytics/tables/events_free"]);

    expect(
      filterChildPartitions(partitions, {
        boundKinds: ["list", "range"],
        schemaNames: ["analytics"],
      }).map((partition) => partition.table)
    ).toEqual([
      "instances/i/databases/d/schemas/analytics/tables/events_2024",
      "instances/i/databases/d/schemas/analytics/tables/events_free",
    ]);
  });
});
