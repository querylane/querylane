import type { SVGProps } from "react";

/**
 * Materialized view: an eye plus a refresh tick, so persisted views read
 * differently from plain ones in the object tree. Drawn to lucide
 * conventions (24px viewBox, stroke 2, round caps) to sit next to lucide
 * siblings without visual drift.
 */
function MaterializedViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="m20 4-2 2" />
    </svg>
  );
}

export { MaterializedViewIcon };
