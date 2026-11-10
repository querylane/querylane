import { create } from "@bufbuild/protobuf";
import { describe, expect, test } from "@rstest/core";
import { deriveDefinitionSections } from "@/features/data-explorer/explorer-table-detail/definition-model";
import {
  type Column,
  ColumnSchema,
  GeneratedColumnKind,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

function createSection(columns: Column[]) {
  return deriveDefinitionSections({
    columns,
    constraints: [],
    indexes: [],
    partitionMetadata: undefined,
    policies: [],
    qualifiedTableName: '"public"."generated_values"',
    tableComment: "",
    tableType: Table_TableType.BASE_TABLE,
    triggers: [],
  }).find((section) => section.id === "create-table");
}

describe("generated-column definitions", () => {
  test.each([
    [GeneratedColumnKind.STORED, "STORED"],
    [GeneratedColumnKind.VIRTUAL, "VIRTUAL"],
  ])("preserves generation kind %s", (generatedKind, keyword) => {
    const section = createSection([
      create(ColumnSchema, {
        columnName: "derived",
        generatedKind,
        generationExpression: "source * 2",
        isGenerated: true,
        isNullable: true,
        rawType: "int4",
      }),
    ]);

    expect(section?.kind).toBe("code");
    expect(section?.content).toContain(
      `"derived" int4 GENERATED ALWAYS AS (source * 2) ${keyword}`
    );
  });

  test("does not guess a storage kind for an older API response", () => {
    const section = createSection([
      create(ColumnSchema, {
        columnName: "derived",
        generationExpression: "source * 2",
        isGenerated: true,
        rawType: "int4",
      }),
    ]);

    expect(section?.kind).toBe("note");
    expect(section?.content).toContain("pg_dump");
    expect(section?.content).not.toContain("CREATE TABLE");
  });

  test("does not reconstruct an incomplete generation expression", () => {
    const section = createSection([
      create(ColumnSchema, {
        columnName: "derived",
        generatedKind: GeneratedColumnKind.VIRTUAL,
        isGenerated: true,
        rawType: "int4",
      }),
    ]);

    expect(section?.kind).toBe("note");
    expect(section?.content).not.toContain("CREATE TABLE");
  });
});
