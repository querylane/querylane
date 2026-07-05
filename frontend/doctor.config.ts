import { defineConfig } from "react-doctor/api";
import reactDoctorConfig from "./react-doctor.config.json" with {
  type: "json",
};

export const documentedDisabledReactDoctorRules = {
  "react-doctor/forbid-component-props":
    "False positive for this Tailwind/shadcn codebase: className is an intentional component styling API, not a bypassed contract.",
  "react-doctor/hook-use-state":
    "False positive for lazy stable instances where the setter is intentionally unused; changing them to noisier refs would not improve correctness.",
  "react-doctor/jsx-boolean-value":
    "Conflicts with the enforced formatter/linter in this repo; bun run lint:fix rewrites shorthand booleans back to explicit ={true}.",
  "react-doctor/jsx-handler-names":
    "False positive for pass-through event props: forwarding onChange/onSelect props preserves the caller API and renaming locally adds noise.",
  "react-doctor/jsx-props-no-spreading":
    "False positive for adapter and wrapper components that intentionally forward a typed prop surface to framework or UI primitives.",
  "react-doctor/react-in-jsx-scope":
    "False positive with React 19 automatic JSX runtime; adding React imports would create unused imports.",
} as const;

export default defineConfig(reactDoctorConfig);
