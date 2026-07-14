import { Badge } from "@/components/ui/badge";
import { allPredicates } from "@/lib/predicates";
import { Table_TableType } from "@/protogen/querylane/console/v1alpha1/table_pb";

/**
 * Kind badge for a catalog object (table or view), shared by the database
 * overview and the explorer schema page. Materialization is taken strictly
 * from the caller — never inferred.
 */
export function CatalogKindBadge({
  isMaterialized = false,
  isPopulated = true,
  isSystem,
  kind,
  tableType,
}: {
  isMaterialized?: boolean;
  isPopulated?: boolean;
  isSystem: boolean;
  kind: "table" | "view";
  tableType?: Table_TableType | undefined;
}) {
  let label = "TABLE";
  let variant: "default" | "secondary" | "outline" = "secondary";
  if (kind === "view") {
    label = isMaterialized ? "MATERIALIZED" : "VIEW";
    variant = isMaterialized ? "default" : "outline";
  } else if (tableType === Table_TableType.PARTITIONED) {
    label = "PARTITIONED";
    variant = "default";
  } else if (tableType === Table_TableType.EXTERNAL) {
    label = "EXTERNAL";
    variant = "outline";
  } else if (tableType === Table_TableType.TEMPORARY) {
    label = "TEMP";
  }

  return (
    <span className="flex items-center gap-1.5">
      <Badge className="font-mono text-[10px]" variant={variant}>
        {label}
      </Badge>
      {isSystem ? (
        <Badge className="font-mono text-[10px]" variant="ghost">
          {"SYS"}
        </Badge>
      ) : null}
      {allPredicates(
        () => isMaterialized,
        () => !isPopulated
      ) ? (
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          {"unpopulated"}
        </span>
      ) : null}
    </span>
  );
}
