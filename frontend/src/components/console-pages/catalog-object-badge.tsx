import { Badge } from "@/components/ui/badge";

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
}: {
  isMaterialized?: boolean;
  isPopulated?: boolean;
  isSystem: boolean;
  kind: "table" | "view";
}) {
  let label = "TABLE";
  let variant: "default" | "secondary" | "outline" = "secondary";
  if (kind === "view") {
    label = isMaterialized ? "MATERIALIZED" : "VIEW";
    variant = isMaterialized ? "default" : "outline";
  }

  return (
    <span className="flex items-center gap-1.5">
      <Badge className="font-mono text-[10px]" variant={variant}>
        {label}
      </Badge>
      {isSystem ? (
        <Badge className="font-mono text-[10px]" variant="ghost">
          SYS
        </Badge>
      ) : null}
      {isMaterialized && !isPopulated ? (
        <span className="font-mono text-[10px] text-muted-foreground uppercase">
          unpopulated
        </span>
      ) : null}
    </span>
  );
}
