import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LabelEntry {
  id: string;
  key: string;
  value: string;
}

export function InstanceLabelRow({
  disabled,
  errorId,
  index,
  label,
  messages = [],
  onChange,
  onRemove,
  configurationField,
}: {
  disabled?: boolean;
  errorId: string;
  index: number;
  label: LabelEntry;
  messages?: string[] | undefined;
  onChange: (label: LabelEntry) => void;
  onRemove?: (() => void) | undefined;
  configurationField?: string | undefined;
}) {
  const invalid = messages.length > 0;
  const describedBy = invalid ? errorId : undefined;
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-label={`Label key ${index + 1}`}
          data-instance-config-field={configurationField}
          data-label-key-input=""
          disabled={disabled}
          onChange={(event) => onChange({ ...label, key: event.target.value })}
          placeholder="Key"
          value={label.key}
        />
        <Input
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-label={`Label value ${index + 1}`}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...label, value: event.target.value })
          }
          placeholder="Value"
          value={label.value}
        />
        {onRemove ? (
          <Button
            aria-label="Remove label"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
      {invalid ? (
        <div
          className="text-destructive text-sm [overflow-wrap:anywhere]"
          id={errorId}
          role="alert"
        >
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
