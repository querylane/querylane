import {
  type SetupProgressEvent,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

const PERCENT_SCALE = 100;
const MAX_IN_FLIGHT_PERCENT = 99;

/**
 * Step weights reflect relative duration. Heavier steps (like migration or
 * starting embedded PG) get more weight so the progress bar moves more
 * evenly instead of jumping in equal increments.
 */
const STEP_WEIGHTS: Partial<Record<SetupStep, number>> = {
  [SetupStep.STARTING_EMBEDDED]: 30,
  [SetupStep.CONNECTING]: 15,
  [SetupStep.MIGRATING]: 30,
  [SetupStep.INITIALIZING_SERVICES]: 10,
  [SetupStep.PERSISTING_CONFIG]: 5,
  [SetupStep.WAITING_FOR_CONFIG]: 5,
  [SetupStep.CONFIG_DETECTED]: 5,
};

const DEFAULT_STEP_WEIGHT = 10;

function getStepWeight(stepId: SetupStep): number {
  return STEP_WEIGHTS[stepId] ?? DEFAULT_STEP_WEIGHT;
}

/**
 * For in-progress steps, count them as partially complete so the bar
 * doesn't sit at 0% while the first step is running.
 */
const IN_PROGRESS_FRACTION = 0.35;

export function getProgressSummary(events: SetupProgressEvent[]) {
  const totalSteps = events.length;

  if (totalSteps === 0) {
    return {
      activeStep: null,
      percentage: 0,
      statusLabel: "Preparing setup",
      succeededSteps: 0,
      totalSteps: 0,
    };
  }

  let totalWeight = 0;
  let completedWeight = 0;
  let succeededSteps = 0;

  for (const event of events) {
    const weight = getStepWeight(event.stepId);
    totalWeight += weight;

    if (event.state === StepState.SUCCEEDED) {
      completedWeight += weight;
      succeededSteps += 1;
    } else if (event.state === StepState.IN_PROGRESS) {
      completedWeight += weight * IN_PROGRESS_FRACTION;
    }
  }

  const activeStep =
    [...events]
      .reverse()
      .find((event) => event.state === StepState.IN_PROGRESS) ??
    events.find((event) => event.state === StepState.PENDING) ??
    events.at(-1) ??
    null;

  const percentage =
    totalWeight === 0
      ? 0
      : Math.min(
          Math.floor((completedWeight / totalWeight) * PERCENT_SCALE),
          MAX_IN_FLIGHT_PERCENT
        );

  return {
    activeStep,
    percentage,
    statusLabel: activeStep?.displayName ?? "Preparing setup",
    succeededSteps,
    totalSteps,
  };
}
