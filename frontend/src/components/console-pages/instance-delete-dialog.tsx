"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InlineCode } from "@/components/ui/inline-code";
import { Input } from "@/components/ui/input";

export function InstanceDeleteDialog({
  instanceDisplayName,
  instanceResourceName,
  onConfirm,
  onOpenChange,
  open,
  pending,
}: {
  instanceDisplayName: string;
  instanceResourceName: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
}) {
  const confirmationInputId = useId();
  const [confirmationName, setConfirmationName] = useState("");
  const isConfirmed = confirmationName === instanceResourceName;
  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setConfirmationName("");
        }
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{"Delete instance?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {"Delete instance "}
            <InlineCode>{instanceDisplayName}</InlineCode>
            {" from Querylane? Confirm the stable resource"}{" "}
            <InlineCode>{instanceResourceName}</InlineCode>
            {". This action cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <label className="text-sm" htmlFor={confirmationInputId}>
            {"Type "}
            {instanceResourceName}
            {" to confirm"}
          </label>
          <Input
            autoComplete="off"
            disabled={pending}
            id={confirmationInputId}
            onChange={(event) => setConfirmationName(event.target.value)}
            value={confirmationName}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{"Cancel"}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || !isConfirmed}
            onClick={onConfirm}
            variant="destructive"
          >
            <Trash2 className="size-4" />
            {"Delete instance"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
