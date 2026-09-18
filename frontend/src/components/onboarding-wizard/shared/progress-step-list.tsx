import { Check, Circle, Loader2, X } from "lucide-react";
import { Badge } from "@/components/querylane-ui/badge";
import { cn } from "@/lib/utils";
import {
  type SetupProgressEvent,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

function getStepDescription(stepId: SetupStep) {
  if (stepId === SetupStep.STARTING_EMBEDDED) {
    return "Booting the managed PostgreSQL runtime and preparing its data path.";
  }
  if (stepId === SetupStep.CONNECTING) {
    return "Opening a connection to the metadata database and validating reachability.";
  }
  if (stepId === SetupStep.MIGRATING) {
    return "Applying the schema changes Querylane needs before it can boot.";
  }
  if (stepId === SetupStep.INITIALIZING_SERVICES) {
    return "Preparing internal services and baseline metadata for the console.";
  }
  if (stepId === SetupStep.PERSISTING_CONFIG) {
    return "Writing the generated configuration to disk so future boots can reuse it.";
  }
  if (stepId === SetupStep.WAITING_FOR_CONFIG) {
    return "Watching the configured file path and waiting for a valid change to arrive.";
  }
  if (stepId === SetupStep.CONFIG_DETECTED) {
    return "A config update was found and setup can continue with validation.";
  }
  return "Processing this setup step.";
}
function getStepStateLabel(state: StepState): string {
  if (state === StepState.SUCCEEDED) {
    return "Completed";
  }
  if (state === StepState.IN_PROGRESS) {
    return "In progress";
  }
  if (state === StepState.FAILED) {
    return "Failed";
  }
  return "Pending";
}
function StepStateIcon({ state }: { state: StepState }) {
  if (state === StepState.SUCCEEDED) {
    return (
      <span className="flex size-8 items-center justify-center rounded-full border border-positive-400/45 bg-positive-500/14 text-positive-300">
        <Check aria-hidden="true" className="size-4" />
      </span>
    );
  }
  if (state === StepState.IN_PROGRESS) {
    return (
      <span className="flex size-8 items-center justify-center rounded-full border border-white/30 bg-white/8 text-white">
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
      </span>
    );
  }
  if (state === StepState.FAILED) {
    return (
      <span className="flex size-8 items-center justify-center rounded-full border border-negative-400/40 bg-negative-500/12 text-negative-200">
        <X aria-hidden="true" className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-full border border-white/16 bg-white/3 text-white/45">
      <Circle aria-hidden="true" className="size-4 fill-current" />
    </span>
  );
}
function StepStateBadge({ state }: { state: StepState }) {
  if (state === StepState.SUCCEEDED) {
    return <Badge presentation="onboarding-complete">Done</Badge>;
  }
  if (state === StepState.IN_PROGRESS) {
    return (
      <Badge presentation="onboarding-running" variant="outline">
        Running
      </Badge>
    );
  }
  if (state === StepState.FAILED) {
    return (
      <Badge presentation="onboarding-error" variant="outline">
        Failed
      </Badge>
    );
  }
  return (
    <Badge presentation="onboarding-pending" variant="outline">
      Pending
    </Badge>
  );
}
/**
 * Only the step you are waiting on (or one that failed) needs an explanation.
 * Repeating a description for every pending step makes the page scroll
 * without adding information.
 */
function getStepDetail(event: SetupProgressEvent): string | null {
  if (event.error) {
    return event.error;
  }
  if (event.state === StepState.IN_PROGRESS) {
    return getStepDescription(event.stepId);
  }
  return null;
}
function ProgressStepItem({
  connector,
  event,
}: {
  connector: "none" | "pending" | "succeeded";
  event: SetupProgressEvent;
}) {
  const detail = getStepDetail(event);
  return (
    <li
      aria-label={`${event.displayName}: ${getStepStateLabel(event.state)}`}
      className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4"
      data-step-card={event.displayName}
    >
      <div className="relative flex justify-center">
        {connector === "none" ? null : (
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-10 bottom-[-0.75rem] left-1/2 w-px -translate-x-1/2",
              connector === "succeeded" ? "bg-positive-400/70" : "bg-white/12"
            )}
          />
        )}
        <div className="relative z-10 rounded-full bg-background p-1">
          <StepStateIcon state={event.state} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4 pt-2.5">
        <div className="space-y-1.5">
          <div className="font-medium text-sm text-white">
            {event.displayName}
          </div>
          {detail ? (
            <p className="max-w-3xl text-sm text-white/58 leading-6">
              {detail}
            </p>
          ) : null}
        </div>
        <StepStateBadge state={event.state} />
      </div>
    </li>
  );
}
function getConnector(
  event: SetupProgressEvent,
  nextEvent: SetupProgressEvent | undefined
) {
  if (!nextEvent) {
    return "none" as const;
  }
  return event.state === StepState.SUCCEEDED &&
    nextEvent.state === StepState.SUCCEEDED
    ? ("succeeded" as const)
    : ("pending" as const);
}
export function ProgressStepList({ events }: { events: SetupProgressEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/3 p-4 text-sm text-white/55">
        Waiting for setup progress…
      </div>
    );
  }
  return (
    <ol aria-label="Setup progress steps" className="list-none space-y-3">
      {events.map((event, index) => (
        <ProgressStepItem
          connector={getConnector(event, events[index + 1])}
          event={event}
          key={event.stepId}
        />
      ))}
    </ol>
  );
}
