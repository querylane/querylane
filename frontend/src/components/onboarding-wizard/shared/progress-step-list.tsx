import { Check, Circle, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
      <span className="flex size-9 items-center justify-center rounded-full border border-emerald-400/45 bg-emerald-500/14 text-emerald-300">
        <Check aria-hidden="true" className="size-4.5" />
      </span>
    );
  }
  if (state === StepState.IN_PROGRESS) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full border border-white/30 bg-white/8 text-white">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      </span>
    );
  }
  if (state === StepState.FAILED) {
    return (
      <span className="flex size-9 items-center justify-center rounded-full border border-red-400/40 bg-red-500/12 text-red-200">
        <X aria-hidden="true" className="size-4" />
      </span>
    );
  }
  return (
    <span className="flex size-9 items-center justify-center rounded-full border border-white/16 bg-white/[0.03] text-white/45">
      <Circle aria-hidden="true" className="size-4 fill-current" />
    </span>
  );
}
function StepStateBadge({ state }: { state: StepState }) {
  if (state === StepState.SUCCEEDED) {
    return (
      <Badge className="border-emerald-400/40 bg-emerald-500/14 px-4 text-emerald-200">
        Done
      </Badge>
    );
  }
  if (state === StepState.IN_PROGRESS) {
    return (
      <Badge
        className="border-white/16 bg-white/10 px-4 text-white"
        variant="outline"
      >
        Running
      </Badge>
    );
  }
  if (state === StepState.FAILED) {
    return (
      <Badge
        className="border-red-400/35 bg-red-500/14 px-4 text-red-100"
        variant="outline"
      >
        Failed
      </Badge>
    );
  }
  return (
    <Badge
      className="border-white/10 bg-white/[0.04] px-4 text-white/62"
      variant="outline"
    >
      Pending
    </Badge>
  );
}
export function ProgressStepList({ events }: { events: SetupProgressEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
        Waiting for setup progress…
      </div>
    );
  }
  return (
    <ol aria-label="Setup progress steps" className="list-none space-y-3">
      {events.map((event, index) => {
        const nextEvent = events[index + 1];
        const hasSucceededConnector =
          event.state === StepState.SUCCEEDED &&
          nextEvent?.state === StepState.SUCCEEDED;

        return (
          <li
            aria-label={`${event.displayName}: ${getStepStateLabel(event.state)}`}
            className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4"
            data-step-card={event.displayName}
            key={event.stepId}
          >
            <div className="relative flex justify-center">
              {index < events.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-11 bottom-[-0.75rem] left-1/2 w-px -translate-x-1/2",
                    hasSucceededConnector ? "bg-emerald-400/70" : "bg-white/12"
                  )}
                />
              ) : null}
              <div className="relative z-10 rounded-full bg-background p-1">
                <StepStateIcon state={event.state} />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-4 pt-1">
              <div className="space-y-2">
                <div className="font-medium text-lg text-white">
                  {event.displayName}
                </div>
                <p className="max-w-3xl text-sm text-white/58 leading-6 md:text-base">
                  {event.error || getStepDescription(event.stepId)}
                </p>
              </div>
              <StepStateBadge state={event.state} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
