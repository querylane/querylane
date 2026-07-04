import { type ReactNode, useState } from "react";
import {
  DataValueDialogOpenContext,
  DataValueDialogSetterContext,
} from "@/components/data-grid/table-data-grid/use-data-value-dialog-state";

function DataValueDialogProvider({ children }: { children: ReactNode }) {
  const [openDialogId, setOpenDialogId] = useState<string | null>(null);

  return (
    <DataValueDialogSetterContext.Provider value={setOpenDialogId}>
      <DataValueDialogOpenContext.Provider value={openDialogId}>
        {children}
      </DataValueDialogOpenContext.Provider>
    </DataValueDialogSetterContext.Provider>
  );
}

export { DataValueDialogProvider };
