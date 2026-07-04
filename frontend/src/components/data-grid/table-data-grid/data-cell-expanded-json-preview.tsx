import { useState } from "react";
import {
  JSON_TITLE_MAX_LENGTH,
  maybeFormatPrettyJson,
  truncateForAttribute,
} from "@/components/data-grid/table-data-grid/data-cell-preview-format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function ExpandedJsonPreview({ raw }: { raw: string }) {
  const pretty = maybeFormatPrettyJson(raw);
  const [mode, setMode] = useState<"raw" | "pretty">("pretty");
  const display = mode === "pretty" && pretty ? pretty : raw;
  const title = truncateForAttribute(raw, JSON_TITLE_MAX_LENGTH);

  return (
    <span className="flex min-w-0 flex-1 items-start gap-2">
      <code
        className={cn(
          "min-w-0 flex-1 font-mono text-violet-600 text-xs dark:text-violet-400",
          mode === "pretty" && pretty
            ? "max-h-20 overflow-auto whitespace-pre text-left"
            : "truncate whitespace-nowrap"
        )}
        title={title}
      >
        {display}
      </code>
      {pretty ? (
        <Button
          className="h-5 px-1.5 font-medium uppercase tracking-wide"
          onClick={() => setMode(mode === "pretty" ? "raw" : "pretty")}
          size="xs"
          type="button"
          variant="ghost"
        >
          {mode === "pretty" ? "Raw" : "Pretty"}
        </Button>
      ) : null}
    </span>
  );
}

export { ExpandedJsonPreview };
