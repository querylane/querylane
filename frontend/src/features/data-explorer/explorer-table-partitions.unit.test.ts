import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";
import {
  derivePartitionTabCount,
  derivePartitionViewModel,
  filterPartitionDisplayRows,
  formatPartitionResourceLabel,
  hasPartitionMetadata,
  partitionBoundKind,
  partitionSchemaName,
  summarizePartitionDisplayRows,
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

  test("derives row and size summaries for the partitions tab", () => {
    const partitions = [
      create(TablePartitionSchema, {
        estimatedRows: 1_020_000n,
        partitionBound: "FOR VALUES FROM ('2026-01-01') TO ('2026-04-01')",
        sizeBytes: 960_000_000n,
        table:
          "instances/i/databases/d/schemas/audit/tables/change_log_2026_q1",
      }),
      create(TablePartitionSchema, {
        estimatedRows: 1_180_000n,
        partitionBound: "FOR VALUES FROM ('2026-04-01') TO ('2026-07-01')",
        sizeBytes: 1_100_000_000n,
        table:
          "instances/i/databases/d/schemas/audit/tables/change_log_2026_q2",
      }),
      create(TablePartitionSchema, {
        estimatedRows: 48_000n,
        partitionBound: "FOR VALUES FROM ('2026-07-01') TO ('2026-10-01')",
        sizeBytes: 44_000_000n,
        table:
          "instances/i/databases/d/schemas/audit/tables/change_log_2026_q3",
      }),
      create(TablePartitionSchema, {
        estimatedRows: 1_940_000n,
        partitionBound: "DEFAULT",
        sizeBytes: 1_800_000_000n,
        table:
          "instances/i/databases/d/schemas/audit/tables/change_log_archive",
      }),
    ];

    const model = derivePartitionViewModel({
      currentDate: new Date("2026-07-07T00:00:00Z"),
      partitions,
    });

    expect(model.totalRowsLabel).toBe("4.2M");
    expect(model.totalSizeLabel).toBe("3.6 GB");
    expect(model.defaultPartition?.name).toBe("change_log_archive");
    expect(model.defaultPartition?.shareLabel).toBe("46%");
    expect(model.rows.map((row) => row.rowsLabel)).toEqual([
      "1.02M",
      "1.18M",
      "48k",
      "1.94M",
    ]);
    expect(model.rows.map((row) => row.boundLabel)).toEqual([
      "2026-01-01 → 2026-04-01",
      "2026-04-01 → 2026-07-01",
      "2026-07-01 → 2026-10-01",
      "DEFAULT — catches rows outside every range",
    ]);
    expect(model.rows.map((row) => row.isCurrent)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(
      filterPartitionDisplayRows(model.rows, "archive").map((row) => row.name)
    ).toEqual(["change_log_archive"]);
    expect(filterPartitionDisplayRows(model.rows, "")).toHaveLength(4);
    expect(
      summarizePartitionDisplayRows(
        filterPartitionDisplayRows(model.rows, "archive")
      )
    ).toEqual({
      totalRowsLabel: "1.9M",
      totalSizeLabel: "1.7 GB",
    });
  });

  test("formats whole-million partition row estimates without dangling decimals", () => {
    const model = derivePartitionViewModel({
      currentDate: new Date("2026-01-15T00:00:00Z"),
      partitions: [
        create(TablePartitionSchema, {
          estimatedRows: 2_000_000n,
          partitionBound: "FOR VALUES FROM ('2026-01-01') TO ('2026-02-01')",
          table:
            "instances/i/databases/d/schemas/audit/tables/change_log_2026_01",
        }),
      ],
    });

    expect(model.rows[0]?.rowsLabel).toBe("2M");
  });

  test("parses timestamptz range bounds for labels and current detection", () => {
    const model = derivePartitionViewModel({
      currentDate: new Date("2026-07-19T10:00:00Z"),
      partitions: [
        create(TablePartitionSchema, {
          estimatedRows: 72_000n,
          partitionBound:
            "FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-07-01 00:00:00+00')",
          table: "instances/i/databases/d/schemas/commerce/tables/oe_2026_h1",
        }),
        create(TablePartitionSchema, {
          estimatedRows: 0n,
          partitionBound:
            "FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2027-01-01 00:00:00+00')",
          table: "instances/i/databases/d/schemas/commerce/tables/oe_2026_h2",
        }),
      ],
    });

    expect(model.rows.map((row) => row.boundLabel)).toEqual([
      "2026-01-01 → 2026-07-01",
      "2026-07-01 → 2027-01-01",
    ]);
    expect(model.rows.map((row) => row.isCurrent)).toEqual([false, true]);
  });

  test("shortens non-range bounds instead of repeating the FOR VALUES prefix", () => {
    const model = derivePartitionViewModel({
      partitions: [
        create(TablePartitionSchema, {
          partitionBound: "FOR VALUES IN ('enterprise', 'trial')",
          table: "instances/i/databases/d/schemas/crm/tables/accounts_paid",
        }),
        create(TablePartitionSchema, {
          partitionBound: "FOR VALUES WITH (modulus 4, remainder 1)",
          table: "instances/i/databases/d/schemas/crm/tables/accounts_h1",
        }),
      ],
    });

    expect(model.rows.map((row) => row.boundLabel)).toEqual([
      "IN ('enterprise', 'trial')",
      "WITH (modulus 4, remainder 1)",
    ]);
    expect(model.rows.map((row) => row.isCurrent)).toEqual([false, false]);
  });

  test("marks no partition current when pg_partman precreates only future ranges", () => {
    const model = derivePartitionViewModel({
      currentDate: new Date("2026-07-07T00:00:00Z"),
      partitions: [
        create(TablePartitionSchema, {
          estimatedRows: 48_000n,
          partitionBound: "FOR VALUES FROM ('2026-07-01') TO ('2026-10-01')",
          table:
            "instances/i/databases/d/schemas/audit/tables/change_log_2026_q3",
        }),
        create(TablePartitionSchema, {
          estimatedRows: 0n,
          partitionBound: "FOR VALUES FROM ('2026-10-01') TO ('2027-01-01')",
          table:
            "instances/i/databases/d/schemas/audit/tables/change_log_2026_q4",
        }),
      ],
    });

    expect(model.rows.map((row) => [row.name, row.isCurrent])).toEqual([
      ["change_log_2026_q3", true],
      ["change_log_2026_q4", false],
    ]);

    const futureOnly = derivePartitionViewModel({
      currentDate: new Date("2026-05-01T00:00:00Z"),
      partitions: [
        create(TablePartitionSchema, {
          estimatedRows: 0n,
          partitionBound: "FOR VALUES FROM ('2026-10-01') TO ('2027-01-01')",
          table:
            "instances/i/databases/d/schemas/audit/tables/change_log_2026_q4",
        }),
      ],
    });

    expect(futureOnly.rows.map((row) => row.isCurrent)).toEqual([false]);
  });
});
