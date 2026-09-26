"use client";

import { Plus, X } from "lucide-react";
import {
  createLabelEntry,
  type InstanceLabelEntry,
} from "@/components/console-pages/instance-config-model";
import { FieldError } from "@/components/console-pages/instance-configuration-field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InstanceConfigurationLabels({
  error,
  isConfigManaged,
  labels,
  onChange,
}: {
  error?: string | undefined;
  isConfigManaged: boolean;
  labels: InstanceLabelEntry[];
  onChange: (labels: InstanceLabelEntry[]) => void;
}) {
  return (
    <div className="mt-6 space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-sm">Labels</h4>
          <p className="text-muted-foreground text-xs">
            Key-value pairs for organizing and filtering instances.
          </p>
        </div>
        {isConfigManaged ? null : (
          <Button
            data-instance-config-field={
              labels.length === 0 ? "labels" : undefined
            }
            onClick={() => onChange([...labels, createLabelEntry()])}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus className="size-3" />
            Add label
          </Button>
        )}
      </div>
      {labels.length > 0 ? (
        <div className="space-y-2">
          {labels.map((label, index) => (
            <div className="flex gap-2" key={label.id}>
              <Input
                aria-invalid={Boolean(error && label.key.trim().length === 0)}
                aria-label={`Label key ${index + 1}`}
                data-instance-config-field={index === 0 ? "labels" : undefined}
                disabled={isConfigManaged}
                onChange={(event) => {
                  const next = [...labels];
                  const currentLabel = next[index];
                  if (!currentLabel) {
                    return;
                  }
                  next[index] = {
                    ...currentLabel,
                    key: event.target.value,
                  };
                  onChange(next);
                }}
                placeholder="Key"
                value={label.key}
              />
              <Input
                aria-label={`Label value ${index + 1}`}
                disabled={isConfigManaged}
                onChange={(event) => {
                  const next = [...labels];
                  const currentLabel = next[index];
                  if (!currentLabel) {
                    return;
                  }
                  next[index] = {
                    ...currentLabel,
                    value: event.target.value,
                  };
                  onChange(next);
                }}
                placeholder="Value"
                value={label.value}
              />
              {isConfigManaged ? null : (
                <Button
                  aria-label="Remove label"
                  onClick={() => onChange(labels.filter((_, i) => i !== index))}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-4" />
                  <span className="sr-only">Remove label</span>
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No labels configured.</p>
      )}
      <FieldError error={error} />
    </div>
  );
}
