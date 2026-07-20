import { deriveConstraintKeyRows } from "@/features/data-explorer/explorer-table-detail/keys-model";
import { IDENTITY_GENERATION_LABELS } from "@/features/data-explorer/explorer-table-detail/options";
import { derivePartitionTabCount } from "@/features/data-explorer/explorer-table-partitions";
import { parseTableQualifiedName } from "@/lib/console-resources";
import type {
  Column as TableColumn,
  TableConstraint,
  TableIndex,
  TablePartitionMetadata,
  TablePolicy,
  TableTrigger,
} from "@/protogen/querylane/console/v1alpha1/table_pb";
import {
  type IdentityGeneration,
  Table_TableType,
} from "@/protogen/querylane/console/v1alpha1/table_pb";

interface DefinitionSection {
  content: string;
  detail: string;
  id: string;
  kind: "code" | "note";
  title: string;
}

/** Always quotes identifiers used in copy-paste DDL. */
function formatSqlIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function formatQualifiedTableName(schemaName: string, tableName: string) {
  return `${formatSqlIdentifier(schemaName)}.${formatSqlIdentifier(tableName)}`;
}

function formatTableResourceName(tableResourceName: string) {
  const { schema, table } = parseTableQualifiedName(tableResourceName);
  return formatQualifiedTableName(schema, table);
}

function formatSqlStringLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function commentSql({
  columns,
  qualifiedTableName,
  tableComment,
}: {
  columns: TableColumn[];
  qualifiedTableName: string;
  tableComment: string;
}) {
  const statements: string[] = [];
  if (tableComment.trim()) {
    statements.push(
      `COMMENT ON TABLE ${qualifiedTableName} IS ${formatSqlStringLiteral(tableComment)};`
    );
  }
  for (const column of columns) {
    if (column.comment.trim()) {
      statements.push(
        `COMMENT ON COLUMN ${qualifiedTableName}.${formatSqlIdentifier(
          column.columnName
        )} IS ${formatSqlStringLiteral(column.comment)};`
      );
    }
  }
  return statements;
}

function formatIdentityGeneration(generation: IdentityGeneration) {
  return IDENTITY_GENERATION_LABELS[generation] || "BY DEFAULT";
}

function formatColumnDefinition(column: TableColumn) {
  const parts = [
    formatSqlIdentifier(column.columnName),
    column.rawType || "unknown",
  ];
  if (column.isIdentity) {
    parts.push(
      `GENERATED ${formatIdentityGeneration(column.identityGeneration)} AS IDENTITY`
    );
  }
  if (column.isGenerated && column.generationExpression) {
    parts.push(`GENERATED ALWAYS AS (${column.generationExpression}) STORED`);
  }
  if (!column.isNullable) {
    parts.push("NOT NULL");
  }
  if (column.defaultValue && !(column.isGenerated || column.isIdentity)) {
    parts.push(`DEFAULT ${column.defaultValue}`);
  }
  return parts.join(" ");
}

function createTableSql({
  columns,
  partitionMetadata,
  qualifiedTableName,
  tableType,
}: {
  columns: TableColumn[];
  partitionMetadata: TablePartitionMetadata | undefined;
  qualifiedTableName: string;
  tableType: Table_TableType;
}) {
  if (partitionMetadata?.parentTable && partitionMetadata.partitionBound) {
    return `CREATE TABLE ${qualifiedTableName} PARTITION OF ${formatTableResourceName(
      partitionMetadata.parentTable
    )}\n  ${partitionMetadata.partitionBound};`;
  }
  if (columns.length === 0) {
    return `CREATE TABLE ${qualifiedTableName} (\n  -- Column metadata unavailable\n);`;
  }
  const columnLines = columns
    .slice()
    .sort((left, right) => left.ordinalPosition - right.ordinalPosition)
    .map((column, index, sortedColumns) => {
      const suffix = index < sortedColumns.length - 1 ? "," : "";
      return `  ${formatColumnDefinition(column)}${suffix}`;
    })
    .join("\n");
  const createPrefix =
    tableType === Table_TableType.TEMPORARY
      ? "CREATE TEMPORARY TABLE"
      : "CREATE TABLE";
  const partitionClause = partitionMetadata?.partitionKey
    ? ` PARTITION BY ${partitionMetadata.partitionKey}`
    : "";
  return `${createPrefix} ${qualifiedTableName} (\n${columnLines}\n)${partitionClause};`;
}

function constraintSql(
  constraints: TableConstraint[],
  qualifiedTableName: string
) {
  return constraints
    .flatMap((constraint) => {
      if (!constraint.definition) {
        return [];
      }
      if (!constraint.constraintName) {
        return [
          `ALTER TABLE ${qualifiedTableName} ADD ${constraint.definition};`,
        ];
      }
      return [
        `ALTER TABLE ${qualifiedTableName} ADD CONSTRAINT ${formatSqlIdentifier(
          constraint.constraintName
        )} ${constraint.definition};`,
      ];
    })
    .join("\n");
}

function partitionSql({
  metadata,
  qualifiedTableName,
}: {
  metadata: TablePartitionMetadata | undefined;
  qualifiedTableName: string;
}) {
  const lines: string[] = [];
  if (!metadata) {
    return "";
  }
  for (const partition of metadata.childPartitions) {
    lines.push(
      `CREATE TABLE ${formatTableResourceName(
        partition.table
      )} PARTITION OF ${qualifiedTableName}`
    );
    lines.push(`  ${partition.partitionBound};`);
  }
  return lines.join("\n");
}

function triggerSql(triggers: TableTrigger[], qualifiedTableName: string) {
  return triggers
    .flatMap((trigger) => {
      if (!trigger.triggerName) {
        return [];
      }
      const definition = trigger.definition.trim();
      if (definition.toUpperCase().startsWith("CREATE TRIGGER")) {
        const createStatement = definition.endsWith(";")
          ? definition
          : `${definition};`;
        if (trigger.enabled) {
          return [createStatement];
        }
        return [
          `${createStatement}\nALTER TABLE ${qualifiedTableName} DISABLE TRIGGER ${formatSqlIdentifier(
            trigger.triggerName
          )};`,
        ];
      }
      // The backend returns pg_get_triggerdef output, so this branch only
      // sees unexpected data. A statement cannot be reconstructed faithfully
      // from the remaining metadata (row vs statement level is not exposed),
      // so surface that instead of guessing FOR EACH ROW.
      return [
        `-- Trigger ${formatSqlIdentifier(trigger.triggerName)}: full definition unavailable`,
      ];
    })
    .join("\n");
}

function appendPolicyDefinitionSection(
  sections: DefinitionSection[],
  policies: TablePolicy[]
) {
  if (policies.length > 0) {
    sections.push({
      content:
        "Policy definitions are available, but row-level security enablement and forced mode are not. Use the pg_dump command to reproduce policies safely.",
      detail: `${policies.length.toLocaleString()} policies require table-level RLS state`,
      id: "policies",
      kind: "note",
      title: "Policies",
    });
    return;
  }
  sections.push({
    content:
      "No row-level policies are returned for this table. Visibility is governed by grants unless row-level security is enabled outside this metadata response.",
    detail: "no policies returned",
    id: "row-level-security",
    kind: "note",
    title: "Row-level security",
  });
}

function deriveDefinitionSections({
  columns,
  constraints,
  indexes,
  partitionMetadata,
  policies,
  qualifiedTableName,
  tableComment,
  tableType,
  triggers,
}: {
  columns: TableColumn[];
  constraints: TableConstraint[];
  indexes: TableIndex[];
  partitionMetadata: TablePartitionMetadata | undefined;
  policies: TablePolicy[];
  qualifiedTableName: string;
  tableComment: string;
  tableType: Table_TableType;
  triggers: TableTrigger[];
}): DefinitionSection[] {
  const { backingConstraintNames } = deriveConstraintKeyRows(constraints);
  const isForeignTable = tableType === Table_TableType.EXTERNAL;
  const sections: DefinitionSection[] = [
    {
      content: isForeignTable
        ? "Exact foreign-table DDL is unavailable. Use the pg_dump command to preserve its server and options."
        : createTableSql({
            columns,
            partitionMetadata,
            qualifiedTableName,
            tableType,
          }),
      detail: isForeignTable
        ? "foreign server and options are not exposed"
        : `${qualifiedTableName} · ${columns.length.toLocaleString()} columns · reconstructed from pg_catalog`,
      id: "create-table",
      kind: isForeignTable ? "note" : "code",
      title: isForeignTable ? "Foreign table" : "Create table",
    },
  ];
  const constraintsText = constraintSql(constraints, qualifiedTableName);
  if (constraintsText) {
    sections.push({
      content: constraintsText,
      detail: `${constraints.length.toLocaleString()} from pg_constraint`,
      id: "constraints",
      kind: "code",
      title: "Constraints",
    });
  }
  const standaloneIndexCount = indexes.filter(
    (index) => !backingConstraintNames.has(index.indexName)
  ).length;
  if (standaloneIndexCount > 0) {
    sections.push({
      content:
        "Exact index definitions are unavailable. Use the pg_dump command to preserve expressions, operator classes, and ordering.",
      detail: `${standaloneIndexCount.toLocaleString()} indexes require pg_get_indexdef`,
      id: "indexes",
      kind: "note",
      title: "Indexes",
    });
  }
  const partitionText = partitionSql({
    metadata: partitionMetadata,
    qualifiedTableName,
  });
  if (partitionText) {
    sections.push({
      content: partitionText,
      detail: `${(derivePartitionTabCount(partitionMetadata) ?? 0).toLocaleString()} from pg_partitioned_table`,
      id: "partitions",
      kind: "code",
      title: "Partitions",
    });
  }
  const commentStatements = commentSql({
    columns,
    qualifiedTableName,
    tableComment,
  });
  if (commentStatements.length > 0) {
    sections.push({
      content: commentStatements.join("\n"),
      detail: `${commentStatements.length.toLocaleString()} from pg_description`,
      id: "comments",
      kind: "code",
      title: "Comments",
    });
  }
  appendPolicyDefinitionSection(sections, policies);
  const triggerText = triggerSql(triggers, qualifiedTableName);
  if (triggerText) {
    sections.push({
      content: triggerText,
      detail: `${triggers.length.toLocaleString()} from pg_trigger`,
      id: "triggers",
      kind: "code",
      title: "Triggers",
    });
  }
  return sections;
}

export type { DefinitionSection };
export { deriveDefinitionSections, formatQualifiedTableName };
