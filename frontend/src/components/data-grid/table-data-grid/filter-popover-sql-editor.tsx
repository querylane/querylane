import { useId } from "react";
import { Input } from "@/components/ui/input";

interface SqlWhereEditorProps {
  onChange: (next: string) => void;
  value: string;
}

function SqlWhereEditor({ onChange, value }: SqlWhereEditorProps) {
  const inputId = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[3.25rem_1fr] items-center gap-2">
        <label
          className="text-right font-mono text-muted-foreground text-xs uppercase"
          htmlFor={inputId}
        >
          WHERE
        </label>
        <Input
          aria-label="SQL WHERE clause"
          className="h-8 rounded-lg bg-background font-mono text-xs"
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          placeholder="status = 'customs_hold' AND weight_kg > 10000"
          value={value}
        />
      </div>
      <p className="pl-[3.75rem] text-[11px] text-muted-foreground leading-relaxed">
        {
          "Supports column comparisons joined with AND: =, <>, >, <, >=, <=, LIKE/ILIKE with %, IS [NOT] NULL. Runs as a parameterized WHERE clause, still through the read guard."
        }
      </p>
    </div>
  );
}

export { SqlWhereEditor };
