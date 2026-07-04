"use client";

import { Badge } from "@/components/ui/badge";
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
        "inline-flex min-w-0 max-w-full items-center gap-2",
        className
      )}
      title={encodingTitle}
    >
      {trimmedCharacterSet ? (
        <Badge
          className="h-6 rounded-md px-2 font-mono text-[11px] tracking-wide"
          variant="outline"
        >
          {trimmedCharacterSet}
        </Badge>
      ) : null}
      {trimmedCollation ? (
        <span className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          {trimmedCollation}
        </span>
      ) : null}
    </span>
  );
}

export { DatabaseEncodingValue };
