import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import { getRailDoneCount } from "@/components/onboarding-wizard/shared/progress-rail-state";
import {
  SetupProgressEventSchema,
  SetupStep,
  StepState,
} from "@/protogen/querylane/console/v1alpha1/onboarding_pb";

const CARD_COUNT = 4;

function event(stepId: SetupStep, state: StepState) {
  return create(SetupProgressEventSchema, { state, stepId });
}

const WATCH_STEPS = [
  SetupStep.WAITING_FOR_CONFIG,
  SetupStep.CONFIG_DETECTED,
  SetupStep.CONNECTING,
  SetupStep.MIGRATING,
  SetupStep.INITIALIZING_SERVICES,
];

function watchEvents(succeededCount: number) {
  return WATCH_STEPS.map((step, index) =>
    event(
      step,
      index < succeededCount ? StepState.SUCCEEDED : StepState.PENDING
    )
  );
}

describe("getRailDoneCount", () => {
  it("claims nothing while the wizard waits for a config file", () => {
    const events = [
      event(SetupStep.WAITING_FOR_CONFIG, StepState.IN_PROGRESS),
      ...watchEvents(0).slice(1),
    ];

    expect(getRailDoneCount(events, CARD_COUNT, false)).toBe(0);
  });

  it("claims nothing before any progress has been reported", () => {
    expect(getRailDoneCount([], CARD_COUNT, false)).toBe(0);
  });

  it("grows as steps succeed", () => {
    expect(getRailDoneCount(watchEvents(2), CARD_COUNT, false)).toBe(1);
    expect(getRailDoneCount(watchEvents(4), CARD_COUNT, false)).toBe(3);
  });

  it("marks everything done on success", () => {
    expect(getRailDoneCount([], CARD_COUNT, true)).toBe(CARD_COUNT);
    expect(getRailDoneCount(watchEvents(5), CARD_COUNT, true)).toBe(CARD_COUNT);
  });

  it("never exceeds the number of cards", () => {
    expect(getRailDoneCount(watchEvents(5), CARD_COUNT, false)).toBe(
      CARD_COUNT
    );
  });
});
