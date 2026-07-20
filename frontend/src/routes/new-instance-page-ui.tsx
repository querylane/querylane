import { ArrowLeft, Loader2, Plus, Unplug } from "lucide-react";
import { useId } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CreateInstanceFormState,
  type CreateInstanceLabel,
  createInstanceLabel,
  type InlineNotice,
} from "@/features/new-instance-workflow";
import { cn } from "@/lib/utils";
import type {
  CreateInstanceFieldName,
  CreateInstanceFormErrors,
} from "@/routes/new-instance-validation";

function LabelsEditor({
  error,
  labels,
  onChange,
}: {
  error?: string | undefined;
  labels: CreateInstanceLabel[];
  onChange: (labels: CreateInstanceLabel[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm">Labels</span>
        <Button
          onClick={() => onChange([...labels, createInstanceLabel()])}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus className="size-3" />
          Add label
        </Button>
      </div>
      {labels.length > 0 ? (
        <div className="space-y-2">
          {labels.map((label, index) => (
            <div className="flex gap-2" key={label.id}>
              <Input
                aria-invalid={
                  error && label.key.trim().length === 0 ? true : undefined
                }
                aria-label={`Label key ${index + 1}`}
                data-label-key-input=""
                onChange={(event) => {
                  const next = [...labels];
                  next[index] = { ...label, key: event.target.value };
                  onChange(next);
                }}
                placeholder="Key"
                value={label.key}
              />
              <Input
                aria-label={`Label value ${index + 1}`}
                onChange={(event) => {
                  const next = [...labels];
                  next[index] = { ...label, value: event.target.value };
                  onChange(next);
                }}
                placeholder="Value"
                value={label.value}
              />
              <Button
                aria-label="Remove label"
                onClick={() => onChange(labels.filter((_, i) => i !== index))}
                size="icon"
                type="button"
                variant="ghost"
              >
                <span className="sr-only">Remove</span>×
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No labels. Labels help organize and filter instances.
        </p>
      )}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function CreateInstancePageHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button aria-label="Back" onClick={onBack} size="icon" variant="ghost">
        <ArrowLeft className="size-4" />
        <span className="sr-only">Back</span>
      </Button>
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Postgres server to manage
        </h1>
        <p className="text-muted-foreground text-sm">
          Step 2: connect an application, production, or analytics PostgreSQL
          server for Querylane to administer.
        </p>
      </div>
    </div>
  );
}

export function CreateInstanceAdvancedSection({
  formErrors,
  formState,
  onToggleAdvanced,
  setLabels,
  showAdvanced,
  updateField,
}: {
  formErrors: CreateInstanceFormErrors;
  formState: CreateInstanceFormState;
  onToggleAdvanced: () => void;
  setLabels: (labels: CreateInstanceLabel[]) => void;
  showAdvanced: boolean;
  updateField: (field: CreateInstanceFieldName, value: string) => void;
}) {
  const instanceIdInputId = useId();
  return (
    <Accordion
      className="border-t"
      multiple={true}
      onValueChange={(value) => {
        const values = Array.isArray(value) ? value : [value].filter(Boolean);
        const nextShowAdvanced = values.includes("advanced-options");
        if (nextShowAdvanced !== showAdvanced) {
          onToggleAdvanced();
        }
      }}
      value={showAdvanced ? ["advanced-options"] : []}
    >
      <AccordionItem value="advanced-options">
        <AccordionTrigger className="py-4">
          {showAdvanced ? "Hide" : "Show"} advanced options
        </AccordionTrigger>
        <AccordionContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm" htmlFor={instanceIdInputId}>
              Instance ID (optional)
            </label>
            <Input
              aria-describedby={`${instanceIdInputId}-help${
                formErrors.instanceId ? ` ${instanceIdInputId}-error` : ""
              }`}
              aria-invalid={formErrors.instanceId ? true : undefined}
              id={instanceIdInputId}
              onChange={(event) =>
                updateField("instanceId", event.target.value)
              }
              placeholder="Auto-generated if left blank"
              value={formState.instanceId}
            />
            <p
              className="text-muted-foreground text-xs"
              id={`${instanceIdInputId}-help`}
            >
              Must start with a letter, may contain letters, digits, hyphens,
              and underscores.
            </p>
            {formErrors.instanceId ? (
              <p
                className="text-destructive text-sm"
                id={`${instanceIdInputId}-error`}
                role="alert"
              >
                {formErrors.instanceId}
              </p>
            ) : null}
          </div>
          <LabelsEditor
            error={formErrors.labels}
            labels={formState.labels}
            onChange={setLabels}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
export function CreateInstanceInlineNotice({
  notice,
}: {
  notice: InlineNotice | null;
}) {
  if (!notice) {
    return null;
  }
  return (
    <div
      aria-live={notice.variant === "success" ? "polite" : "assertive"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        notice.variant === "success"
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-destructive/10 text-destructive"
      )}
      role={notice.variant === "success" ? "status" : "alert"}
    >
      {notice.message}
    </div>
  );
}
export function CreateInstanceActions({
  canCreate,
  handleCreate,
  handleTestConnection,
  isPending,
  isTesting,
}: {
  canCreate: boolean;
  handleCreate: () => Promise<void>;
  handleTestConnection: () => Promise<void>;
  isPending: boolean;
  isTesting: boolean;
}) {
  const createInstanceTestHintId = useId();
  return (
    <div className="flex items-center justify-end gap-2 border-t pt-4">
      <Button
        disabled={isTesting || isPending}
        onClick={handleTestConnection}
        variant="outline"
      >
        {isTesting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Unplug className="size-4" />
        )}
        Test connection
      </Button>
      <Button
        aria-describedby={canCreate ? undefined : createInstanceTestHintId}
        disabled={isPending || isTesting || !canCreate}
        onClick={handleCreate}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        Create instance
      </Button>
      {canCreate ? null : (
        <span className="sr-only" id={createInstanceTestHintId}>
          Test this connection before creating the instance.
        </span>
      )}
    </div>
  );
}
