import { defineConfig } from "react-doctor/api";
import reactDoctorConfig from "./react-doctor.config.json" with {
  type: "json",
};

export const documentedDisabledReactDoctorRules = {
  "react-doctor/forbid-component-props":
    "False positive for this Tailwind/shadcn codebase: className is an intentional component styling API, not a bypassed contract.",
  "react-doctor/jsx-boolean-value":
    "Permanent false positive/noise for this repo: boolean JSX shorthand is formatter territory, not a correctness rule; enforcing this adds churn without catching bugs.",
  "react-doctor/jsx-props-no-spreading":
    "False positive for adapter and wrapper components that intentionally forward a typed prop surface to framework or UI primitives.",
  "react-doctor/react-in-jsx-scope":
    "Permanent false positive with React 19 automatic JSX runtime; JSX does not require React in scope and adding imports creates unused code.",
} as const;

export default defineConfig(reactDoctorConfig);
