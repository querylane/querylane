import {
  type SetupProgressEvent,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

/**
 * How many of the decorative rail cards may be shown as done, derived from
 * the real setup events.
 *
 * The rail is decoration, but it must never claim progress that has not
 * happened: while the wizard waits for a hand-written config file, nothing
 * has run yet, so nothing is done.
 */
export function getRailDoneCount(
  events: SetupProgressEvent[],
  cardCount: number,
  success: boolean
): number {
  if (success) {
    return cardCount;
  }

  if (events.length === 0 || cardCount === 0) {
    return 0;
  }

  const succeeded = events.filter(
    (event) => event.state === StepState.SUCCEEDED
  ).length;

  return Math.min(
    cardCount,
    Math.floor((succeeded / events.length) * cardCount)
  );
}
