"use client";

import { Badge } from "@/components/querylane-ui/badge";
import { cn } from "@/lib/utils";

interface DatabaseEncodingValueProps {
  characterSet: string;
  className?: string | undefined;
  collation: string;
}

function DatabaseEncodingValue({
  characterSet,
  className,
  collation,
}: DatabaseEncodingValueProps) {
  const trimmedCharacterSet = characterSet.trim();
  const trimmedCollation = collation.trim();

  if (!(trimmedCharacterSet || trimmedCollation)) {
    return "—";
  }

  const encodingTitle =
    trimmedCharacterSet && trimmedCollation
      ? `${trimmedCharacterSet} / ${trimmedCollation}`
      : trimmedCharacterSet || trimmedCollation;

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2",
        className
      )}
      title={encodingTitle}
    >
      {trimmedCharacterSet ? (
        <Badge className="h-6" presentation="encoding" variant="outline">
          {trimmedCharacterSet}
        </Badge>
      ) : null}
      {trimmedCollation ? (
        <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
          {trimmedCollation}
        </span>
      ) : null}
    </span>
  );
}

export { DatabaseEncodingValue };
