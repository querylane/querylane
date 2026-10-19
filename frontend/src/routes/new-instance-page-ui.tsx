import { ArrowLeft, Loader2, Plus, Unplug } from "lucide-react";
import { useId } from "react";
import { InstanceLabelRow } from "@/components/instance-label-row";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/querylane-ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { unassignedLabelMessages } from "@/features/instance-label-errors";
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
  rowErrors = {},
  labels,
  onChange,
}: {
  error?: string | undefined;
  rowErrors?: Record<string, string[]> | undefined;
  labels: CreateInstanceLabel[];
  onChange: (labels: CreateInstanceLabel[]) => void;
}) {
  const errorId = useId();
  const generalMessages = unassignedLabelMessages(error, rowErrors);
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
            <InstanceLabelRow
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
              onRemove={() =>
                onChange(labels.filter((entry) => entry.id !== label.id))
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No labels. Labels help organize and filter instances.
        </p>
      )}
      {generalMessages.length > 0 ? (
        <p
          className="whitespace-pre-line text-destructive text-sm"
          id={errorId}
          role="alert"
        >
          {generalMessages.join("\n")}
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
      multiple={true}
      onValueChange={(value) => {
        const values = Array.isArray(value) ? value : [value].filter(Boolean);
        const nextShowAdvanced = values.includes("advanced-options");
        if (nextShowAdvanced !== showAdvanced) {
          onToggleAdvanced();
        }
      }}
      presentation="separated"
      value={showAdvanced ? ["advanced-options"] : []}
    >
      <AccordionItem value="advanced-options">
        <AccordionTrigger presentation="spacious">
          {showAdvanced ? "Hide" : "Show"} advanced options
        </AccordionTrigger>
        <AccordionContent presentation="stacked">
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
            rowErrors={formErrors.labelRows}
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
          ? "bg-positive-500/10 text-positive-700 dark:text-positive-300"
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
  const showCreateDisabledReason = !(canCreate || isPending || isTesting);
  const createButton = (
    <Button
      aria-describedby={canCreate ? undefined : createInstanceTestHintId}
      disabled={isPending || isTesting || !canCreate}
      onClick={handleCreate}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Plus className="size-4" />
      )}
      Create instance
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      <Button
        disabled={isTesting || isPending}
        onClick={handleTestConnection}
        variant="outline"
      >
        {isTesting ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Unplug className="size-4" />
        )}
        Test connection
      </Button>
      {showCreateDisabledReason ? (
        <Tooltip>
          <TooltipTrigger
            render={<span className="inline-flex cursor-not-allowed" />}
          >
            {createButton}
          </TooltipTrigger>
          <TooltipContent>
            Test this connection before creating the instance.
          </TooltipContent>
        </Tooltip>
      ) : (
        createButton
      )}
      {canCreate ? null : (
        <span className="sr-only" id={createInstanceTestHintId}>
          Test this connection before creating the instance.
        </span>
      )}
    </div>
  );
}
