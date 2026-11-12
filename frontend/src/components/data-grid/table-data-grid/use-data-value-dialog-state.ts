import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";

const DataValueDialogOpenContext = createContext<string | null>(null);
const DataValueDialogSetterContext = createContext<Dispatch<
  SetStateAction<string | null>
> | null>(null);

function useDataValueDialogState() {
  const openDialogId = useContext(DataValueDialogOpenContext);
  const setOpenDialogId = useContext(DataValueDialogSetterContext);
  const dialogId = useId();
  const [localOpen, setLocalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const open = setOpenDialogId ? openDialogId === dialogId : localOpen;

  useEffect(
    function clearOwnedDataValueDialogOnUnmount(): (() => void) | undefined {
      if (!setOpenDialogId) {
        return undefined;
      }

      return function clearOwnedDataValueDialog() {
        setOpenDialogId((current) => (current === dialogId ? null : current));
      };
    },
    [dialogId, setOpenDialogId]
  );

  function openDialog() {
    // Create SDK dialogs lazily, but keep an opened controller mounted while
    // it closes so the SDK can restore focus. Unvisited cells stay lightweight.
    setMounted(true);
    if (!setOpenDialogId) {
      setLocalOpen(true);
      return;
    }

    setOpenDialogId((current) => current ?? dialogId);
  }

  function onOpenChange(nextOpen: boolean) {
    if (!setOpenDialogId) {
      setLocalOpen(nextOpen);
      return;
    }

    if (nextOpen) {
      setOpenDialogId((current) => current ?? dialogId);
      return;
    }

    setOpenDialogId((current) => (current === dialogId ? null : current));
  }

  return { mounted, onOpenChange, open, openDialog };
}

export {
  DataValueDialogOpenContext,
  DataValueDialogSetterContext,
  useDataValueDialogState,
};
