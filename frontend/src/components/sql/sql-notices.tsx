"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SqlNoticesProps {
  headingLevel?: 2 | 3 | 4;
  notices: readonly string[];
  title?: string;
}

interface VisibleSqlNotice {
  id: string;
  text: string;
}

function buildVisibleSqlNotices(
  notices: readonly string[]
): VisibleSqlNotice[] {
  const visibleNotices: VisibleSqlNotice[] = [];

  for (const notice of notices) {
    const text = notice.trim();
    if (text.length === 0) {
      continue;
    }

    visibleNotices.push({ id: `notice-${visibleNotices.length + 1}`, text });
  }

  return visibleNotices;
}

export function SqlNotices({
  headingLevel = 2,
  notices,
  title = "Database notices",
}: SqlNoticesProps) {
  const visibleNotices = buildVisibleSqlNotices(notices);
  if (visibleNotices.length === 0) {
    return null;
  }

  return (
    <Alert>
      <TriangleAlert aria-hidden="true" className="size-4" />
      <AlertTitle aria-level={headingLevel} role="heading">
        {title}
      </AlertTitle>
      <AlertDescription>
        <ul
          aria-label={title}
          className="mt-2 flex flex-col gap-1 text-left font-mono text-foreground/85 text-xs"
        >
          {visibleNotices.map((notice) => (
            <li key={notice.id}>{notice.text}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
