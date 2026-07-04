import { ChevronDown, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/features/data-explorer/table-data/selection-formatters";

interface SelectionActionsProps {
  disabled: boolean;
  onCopy: (format: ExportFormat) => void;
  onExport: (format: ExportFormat) => void;
}

const FORMAT_ITEMS: Array<{ format: ExportFormat; label: string }> = [
  { format: "csv", label: "CSV" },
  // jsonb/bytea/timestamp values are emitted as quoted strings without
  // type casts, so the INSERT statements won't round-trip for those types.
  // Surface that caveat in the label until proper casting lands.
  { format: "sql", label: "SQL (plain literals)" },
  { format: "json", label: "JSON" },
];

function SelectionActions({
  disabled,
  onCopy,
  onExport,
}: SelectionActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <FormatDropdown
        disabled={disabled}
        icon={<Copy className="size-3.5" />}
        label="Copy"
        onSelect={onCopy}
      />
      <FormatDropdown
        disabled={disabled}
        icon={<Download className="size-3.5" />}
        label="Export"
        onSelect={onExport}
      />
    </div>
  );
}

interface ExportRowsActionsProps {
  disabled: boolean;
  onExport: (format: ExportFormat) => void;
}

function ExportRowsActions({ disabled, onExport }: ExportRowsActionsProps) {
  return (
    <FormatDropdown
      disabled={disabled}
      icon={<Download className="size-3.5" />}
      label="Export"
      onSelect={onExport}
    />
  );
}

interface FormatDropdownProps {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onSelect: (format: ExportFormat) => void;
}

function FormatDropdown({
  disabled,
  icon,
  label,
  onSelect,
}: FormatDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button disabled={disabled} size="sm" type="button" variant="outline">
            {icon}
            {label}
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-32">
        {FORMAT_ITEMS.map((item) => (
          <DropdownMenuItem
            key={item.format}
            onClick={() => onSelect(item.format)}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ExportRowsActions, SelectionActions };
