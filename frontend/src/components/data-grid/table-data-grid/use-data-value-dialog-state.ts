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
  const open = setOpenDialogId ? openDialogId === dialogId : localOpen;

  useEffect(
    function clearOwnedDataValueDialogOnUnmount() {
      if (!setOpenDialogId) {
        return;
      }

      return function clearOwnedDataValueDialog() {
        setOpenDialogId((current) => (current === dialogId ? null : current));
      };
    },
    [dialogId, setOpenDialogId]
  );

  function openDialog() {
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

  return { onOpenChange, open, openDialog };
}

export {
  DataValueDialogOpenContext,
  DataValueDialogSetterContext,
  useDataValueDialogState,
};
