"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { summarizeStatement } from "@/features/sql-workbench/sql-workbench-format";

const STATEMENT_PREVIEW_MAX_LENGTH = 240;

function SqlSaveQueryDialog({
  defaultName,
  onOpenChange,
  onSave,
  open,
  statement,
}: {
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  open: boolean;
  statement: string;
}) {
  const [name, setName] = useState(defaultName);
  const nameId = useId();
  const trimmed = name.trim();
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) {
              onSave(trimmed);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Save query</DialogTitle>
            <DialogDescription>
              Saved queries live in this browser and are scoped to the current
              database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Field>
              <FieldLabel htmlFor={nameId}>Name</FieldLabel>
              <Input
                autoFocus={true}
                id={nameId}
                onChange={(event) => setName(event.target.value)}
                placeholder="Slow orders by customer"
                value={name}
              />
            </Field>
            <p className="line-clamp-3 rounded-md bg-muted px-3 py-2 font-mono text-muted-foreground text-xs leading-relaxed">
              {summarizeStatement(statement, STATEMENT_PREVIEW_MAX_LENGTH)}
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!trimmed} type="submit">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { SqlSaveQueryDialog };
