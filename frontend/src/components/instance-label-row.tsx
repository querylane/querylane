import type { ChangeSource } from "@ui-sdk/core";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LabelEntry {
  id: string;
  key: string;
  value: string;
}

const EMPTY_LABEL_MESSAGES: string[] = [];

export function InstanceLabelRow({
  disabled,
  errorId,
  index,
  label,
  messages = EMPTY_LABEL_MESSAGES,
  onChange,
  onRemove,
  configurationField,
}: {
  disabled?: boolean;
  errorId: string;
  index: number;
  label: LabelEntry;
  messages?: string[] | undefined;
  onChange: (label: LabelEntry, source: ChangeSource) => unknown;
  onRemove?: ((source: ChangeSource) => void) | undefined;
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
          onValueChange={(value, details) => {
            if (onChange({ ...label, key: value }, details.source) === false) {
              details.cancel();
            }
          }}
          placeholder="Key"
          value={label.key}
        />
        <Input
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-label={`Label value ${index + 1}`}
          disabled={disabled}
          onValueChange={(value, details) => {
            if (onChange({ ...label, value }, details.source) === false) {
              details.cancel();
            }
          }}
          placeholder="Value"
          value={label.value}
        />
        {onRemove ? (
          <Button
            aria-label="Remove label"
            onClick={(_event, details) => {
              onRemove(details.source);
            }}
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
          className="text-sm [overflow-wrap:anywhere] text-destructive"
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
