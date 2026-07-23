import type { ReactNode } from "react";
import {
  SetupContext,
  type SetupContextValue,
} from "@/components/setup-context";

function SetupTestProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SetupContextValue;
}) {
  return (
    <SetupContext.Provider value={value}>{children}</SetupContext.Provider>
  );
}

export { SetupTestProvider };
