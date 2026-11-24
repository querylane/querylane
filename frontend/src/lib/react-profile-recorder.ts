import type { ProfilerOnRenderCallback } from "react";

interface ReactCommit {
  actualDuration: number;
  baseDuration: number;
  commitTime: number;
  id: "application";
  phase: "mount" | "update" | "nested-update";
  startTime: number;
}

const MAX_REACT_PROFILE_COMMITS = 2000;

/** Profile-entry only. Timings describe React render work, not Web Vitals or commit-phase cost. */
function createReactProfileRecorder() {
  let commits: ReactCommit[] | undefined;
  let failure: string | undefined;
  let journey: string | undefined;
  let observed = 0;
  const handleRender: ProfilerOnRenderCallback = (...args) => {
    const [id, phase, actualDuration, baseDuration, startTime, commitTime] =
      args;
    observed += 1;
    if (!commits) {
      return;
    }
    if (commits.length >= MAX_REACT_PROFILE_COMMITS) {
      failure = "React profile commit limit exceeded";
      return;
    }
    if (
      commitTime < startTime ||
      [actualDuration, baseDuration, startTime, commitTime].some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      failure = "Invalid React profile timing";
      return;
    }
    if (id !== "application") {
      failure = "Unexpected profile identity";
      return;
    }
    commits.push({
      id,
      phase,
      actualDuration,
      baseDuration,
      startTime,
      commitTime,
    });
  };
  return {
    handleRender,
    get observed() {
      return observed;
    },
    get count() {
      return commits?.length ?? 0;
    },
    begin(id: string) {
      if (commits || !id.trim()) {
        throw new Error("React profile journey is already active or unnamed");
      }
      journey = id;
      failure = undefined;
      commits = [];
    },
    finish(id: string) {
      const result = commits;
      commits = undefined;
      if (journey !== id || !result || failure !== undefined) {
        throw new Error(failure ?? "React profile journey mismatch");
      }
      if (
        result.length === 0 ||
        result.reduce((sum, commit) => sum + commit.actualDuration, 0) <= 0
      ) {
        throw new Error("No nonzero React profiling callbacks collected");
      }
      return result;
    },
  };
}

type ReactProfileRecorder = ReturnType<typeof createReactProfileRecorder>;

declare global {
  interface Window {
    querylaneProfileControl?: { render: (units: number) => number };
    querylaneReactProfile?: ReactProfileRecorder;
    querylaneReactProfileBuild?: {
      revision: string;
      sourceDigest: string;
      configDigest: string;
    };
  }
}

export type { ReactCommit, ReactProfileRecorder };
export { createReactProfileRecorder, MAX_REACT_PROFILE_COMMITS };
