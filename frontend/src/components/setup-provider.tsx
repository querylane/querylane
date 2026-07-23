import { SetupContext } from "@/components/setup-context";
import { useSetupController } from "@/components/setup-controller";

function SetupProvider({ children }: { children: React.ReactNode }) {
  const value = useSetupController();

  return (
    <SetupContext.Provider value={value}>{children}</SetupContext.Provider>
  );
}

export { SetupProvider };
