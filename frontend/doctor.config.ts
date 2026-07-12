import { defineConfig } from "react-doctor/api";
import reactDoctorConfig from "./react-doctor.config.json" with {
  type: "json",
};

export const documentedDisabledReactDoctorRules = {
  "react-doctor/forbid-component-props":
    "False positive for this Tailwind/shadcn codebase: className is an intentional component styling API, not a bypassed contract.",
  "react-doctor/jsx-boolean-value":
    "Permanent false positive/noise for this repo: boolean JSX shorthand is formatter territory, not a correctness rule; enforcing this adds churn without catching bugs.",
  "react-doctor/jsx-handler-names":
    "False positive for callback props forwarded through an intermediary controls/slot object: renaming forwarded on… props to handle… would itself break the on…-prop half of this same convention.",
  "react-doctor/jsx-no-constructed-context-values":
    "React Compiler (enabled repo-wide) auto-memoizes inline context values; manual useMemo is banned here, so this rule has no actionable, compliant fix.",
  "react-doctor/jsx-no-jsx-as-prop":
    "React Compiler (enabled repo-wide) auto-memoizes JSX passed as props; manual memoization is banned here, so element props do not cause the re-renders this rule guards against.",
  "react-doctor/jsx-props-no-spreading":
    "False positive for adapter and wrapper components that intentionally forward a typed prop surface to framework or UI primitives.",
  "react-doctor/no-adjust-state-on-prop-change":
    "False positive for intentional time-based debouncing (e.g. useCalmLoadingPhase): a setTimeout-driven effect is the correct tool for a delayed loading transition, not a stale-state bug.",
  "react-doctor/react-in-jsx-scope":
    "Permanent false positive with React 19 automatic JSX runtime; JSX does not require React in scope and adding imports creates unused code.",
} as const;

export default defineConfig(reactDoctorConfig);
