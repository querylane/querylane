import {
  type Token,
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
  type TokenInputValue,
} from "@ui-sdk/react/token-input";
import { X } from "lucide-react";
import { useState } from "react";

function filterToken(raw: string): Token[] {
  const value = raw.trim();
  return value ? [{ type: "filter-value", value, label: value }] : [];
}

function tokenize(values: TokenInputValue, commit: boolean): TokenInputValue {
  return values.flatMap<string | Token>((segment) => {
    if (typeof segment !== "string") {
      return [segment];
    }
    const parts = segment.split(",");
    if (commit) {
      return parts.flatMap((part) => filterToken(part));
    }
    const draft = parts.pop() ?? "";
    return [...parts.flatMap((part) => filterToken(part)), draft];
  });
}

function serialize(values: TokenInputValue): string {
  return values
    .map((segment) => (typeof segment === "string" ? segment : segment.value))
    .join(",");
}

const filterCodec = {
  format: (token: Token) => `${token.value},`,
  parse: (value: string): TokenInputValue => [value],
};

function FilterTokenInput({
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  onApply,
  onBlur,
  onChange,
  value,
}: {
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  onApply: (value: string) => void;
  onBlur: () => void;
  onChange: (value: string) => void;
  value: string;
}) {
  const [draft, setDraft] = useState(() => ({
    serialized: value,
    segments: tokenize([value], true),
  }));
  if (draft.serialized !== value) {
    setDraft({ serialized: value, segments: tokenize([value], true) });
  }

  return (
    <div
      className="col-span-full col-start-1 row-start-3 min-w-0 @lg/filter-popover:row-start-2"
      data-agent-hidden={true}
    >
      <TokenInput
        codec={filterCodec}
        onSubmit={(next) => {
          const segments = tokenize(next, true);
          const serialized = serialize(segments);
          setDraft({ serialized, segments });
          onApply(serialized);
        }}
        onValueChange={(next, details) => {
          const segments = tokenize(next, details.reason === "paste");
          const serialized = serialize(segments);
          setDraft({ serialized, segments });
          onChange(serialized);
        }}
        renderToken={(token) => (
          <TokenInputToken className="me-1 inline-flex max-w-full items-center gap-1 rounded-sm bg-secondary px-1.5 align-baseline text-secondary-foreground data-selected:bg-accent">
            <span className="truncate">{token.label}</span>
            <TokenInputTokenRemove className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground">
              <X aria-hidden="true" className="size-3" />
            </TokenInputTokenRemove>
          </TokenInputToken>
        )}
        value={draft.segments}
      >
        <TokenInputEditor
          aria-describedby={describedBy}
          aria-description="Separate values with commas. Press Enter to apply."
          aria-invalid={invalid}
          aria-label="Filter values"
          className="min-h-8 min-w-0 rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-xs break-all whitespace-pre-wrap shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive data-empty:before:text-muted-foreground data-empty:before:content-[attr(aria-placeholder)] dark:bg-input/30"
          onBlur={onBlur}
          placeholder="pending, failed"
        />
      </TokenInput>
    </div>
  );
}

export { FilterTokenInput };
