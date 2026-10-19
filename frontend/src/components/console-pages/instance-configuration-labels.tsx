"use client";
import { Plus } from "lucide-react";

import { useId } from "react";
import {
  createLabelEntry,
  type InstanceLabelEntry,
} from "@/components/console-pages/instance-config-model";
import { InstanceLabelRow } from "@/components/instance-label-row";
import { Button } from "@/components/ui/button";
import { unassignedLabelMessages } from "@/features/instance-label-errors";

export function InstanceConfigurationLabels({
  error,
  rowErrors = {},
  isConfigManaged,
  labels,
  onChange,
}: {
  error?: string | undefined;
  rowErrors?: Record<string, string[]> | undefined;
  isConfigManaged: boolean;
  labels: InstanceLabelEntry[];
  onChange: (labels: InstanceLabelEntry[]) => void;
}) {
  const errorId = useId();
  const generalMessages = unassignedLabelMessages(error, rowErrors);
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
            <InstanceLabelRow
              configurationField="labels"
              disabled={isConfigManaged}
              errorId={`${errorId}-${label.id}`}
              index={index}
              key={label.id}
              label={label}
              messages={rowErrors[label.id]}
              onChange={(updated) =>
                onChange(
                  labels.map((entry) =>
                    entry.id === label.id ? updated : entry
                  )
                )
              }
              onRemove={
                isConfigManaged
                  ? undefined
                  : () =>
                      onChange(labels.filter((entry) => entry.id !== label.id))
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No labels configured.</p>
      )}
      {generalMessages.length > 0 ? (
        <p
          className="whitespace-pre-line text-destructive text-xs"
          id={errorId}
          role="alert"
        >
          {generalMessages.join("\n")}
        </p>
      ) : null}
    </div>
  );
}
