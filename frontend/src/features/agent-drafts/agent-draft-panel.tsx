import { type PrimitiveHandle, usePart } from "@ui-sdk/react/primitive";
import { useEffect, useRef, useState } from "react";
import {
  DraftRevision,
  DraftRevisions,
} from "@/components/querylane-ui/draft-revisions";
import { Button } from "@/components/ui/button";
import {
  createAgentDraftSession,
  EMPTY_DRAFT_SESSION,
} from "./agent-draft-session";
import { useAgentDraftStore } from "./agent-draft-state";
import { DRAFT_KEYS, type instanceDraft } from "./instance-draft";

const RECENT_ACTIVITY_COUNT = 10;
const FIELD_NAMES = {
  displayName: "Display name",
  labels: "Labels",
  sslMode: "SSL mode",
  sslNegotiation: "SSL negotiation",
};

function AgentDraftPanel({
  draft,
}: {
  draft: PrimitiveHandle<typeof instanceDraft>;
}) {
  const { instance } = draft;
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY_DRAFT_SESSION);
  const sessionRef = useRef<ReturnType<typeof createAgentDraftSession> | null>(
    null
  );
  const activity = useAgentDraftStore((state) => state.activity);
  const marker = usePart(
    draft,
    "root",
    {},
    {
      "aria-label": "Instance draft",
      className: "text-sm font-medium",
      ref: setAnchor,
      children: "Draft activity",
    },
    "div"
  );
  useEffect(
    function recordInstanceDraft() {
      if (!anchor) {
        return undefined;
      }
      const recording = createAgentDraftSession(
        anchor,
        () => instance.get(),
        setSnapshot
      );
      sessionRef.current = recording;
      return () => {
        sessionRef.current = null;
        recording.destroy();
      };
    },
    [anchor, instance]
  );
  const canRestore =
    !(snapshot.busy || draft.state.disabled || snapshot.preview) &&
    snapshot.entries.length > 0;
  return (
    <section
      aria-label="Agent draft review"
      className="mt-6 space-y-3 rounded-lg border p-4"
    >
      {marker}
      <div className="space-y-3" data-agent-hidden={true}>
        <p className="text-xs text-muted-foreground">
          Names, labels, and TLS settings only. Credentials, SQL, rows, and
          saved database changes are never recorded here.
        </p>
        <p className="text-sm" role="status">
          {snapshot.notice}
        </p>
        <DraftRevisions
          aria-label="Draft revision"
          first="0"
          onValueChange={(value) => sessionRef.current?.select(value)}
          value={snapshot.selected}
        >
          {[
            { value: "0", label: "Start" },
            ...snapshot.entries.map((entry, index) => ({
              value: String(index + 1),
              label: `${index + 1}: ${FIELD_NAMES[DRAFT_KEYS.find((key) => key === entry.key) ?? "displayName"]} (${entry.source === "agent" ? "Agent" : "You"})`,
            })),
          ].map((revision) => (
            <DraftRevision
              disabled={snapshot.busy || snapshot.preview}
              key={revision.value}
              value={revision.value}
            >
              {revision.label}
            </DraftRevision>
          ))}
        </DraftRevisions>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canRestore}
            onClick={(event) =>
              event.isTrusted ? sessionRef.current?.preview() : undefined
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Preview revision
          </Button>
          <Button
            disabled={!canRestore}
            onClick={(event) =>
              event.isTrusted ? sessionRef.current?.seek() : undefined
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Restore revision
          </Button>
          <Button
            disabled={
              !(
                canRestore &&
                snapshot.entries.some(
                  (entry) => entry.source === "agent" && entry.reverted !== true
                )
              )
            }
            onClick={(event) =>
              event.isTrusted ? sessionRef.current?.undoAgent() : undefined
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Undo agent edits
          </Button>
          <Button
            disabled={
              snapshot.busy || draft.state.disabled || !snapshot.preview
            }
            onClick={(event) => {
              if (event.isTrusted) {
                sessionRef.current?.keep();
              }
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Keep current draft
          </Button>
          <Button
            disabled={
              snapshot.busy || draft.state.disabled || !snapshot.preview
            }
            onClick={(event) =>
              event.isTrusted ? sessionRef.current?.revert() : undefined
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Revert preview
          </Button>
          <Button
            disabled={
              snapshot.busy || snapshot.preview || snapshot.entries.length === 0
            }
            onClick={(event) => {
              if (event.isTrusted) {
                sessionRef.current?.clear();
              }
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear draft history
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {activity.length} recent UI changes observed in this tab (provenance
          only; no field values).
        </p>
        <details className="text-xs text-muted-foreground">
          <summary>Recent UI activity</summary>
          <ol className="mt-2 space-y-1 [overflow-wrap:anywhere]">
            {activity.slice(-RECENT_ACTIVITY_COUNT).map((entry) => (
              <li key={entry.id}>
                {entry.source}: {entry.label} · {entry.key} · {entry.reason}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}

export { AgentDraftPanel };
