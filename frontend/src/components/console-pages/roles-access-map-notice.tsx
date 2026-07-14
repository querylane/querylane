"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type RolesAccessMapNoticeProps =
  | { failedRequestCount: number; kind: "failed" }
  | { kind: "partial"; visible: boolean };

function RolesAccessMapNotice(props: RolesAccessMapNoticeProps) {
  if (props.kind === "failed") {
    if (props.failedRequestCount === 0) {
      return null;
    }
    return (
      <p className="text-amber-700 text-sm dark:text-amber-300" role="status">
        {`${props.failedRequestCount} access request${
          props.failedRequestCount === 1 ? "" : "s"
        } could not be loaded. The map shows the available data.`}
      </p>
    );
  }
  if (!props.visible) {
    return null;
  }
  return (
    <Alert role="status">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{"Some access data is not shown"}</AlertTitle>
      <AlertDescription>
        {
          "The access map reached a result or request limit. It shows available results; counts and relationships may be incomplete."
        }
      </AlertDescription>
    </Alert>
  );
}

export { RolesAccessMapNotice };
