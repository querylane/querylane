# Querylane UI

`src/components/ui` owns styled UI SDK primitives. This directory owns Querylane-specific variants and compositions. Both directories receive the full quality gates; neither is vendored registry output.

Use UI SDK parts for interaction behavior and keep existing `variant`, `size`, and finite `presentation` APIs for appearance. Consumers should only pass layout classes. Variant functions and shared types live in separate modules for Fast Refresh.

UI SDK owns `data-slot`. Querylane styling and test hooks use `data-querylane-slot` so they cannot replace the SDK's behavior hooks. State selectors follow the SDK's documented attributes, such as `data-selected` and `data-orientation`.

The sidebar picker uses UI SDK Combobox with an in-popup search field. The navigation drawer uses UI SDK's horizontal Drawer. Specialized CodeMirror, data-grid, chart, and graph engines remain unchanged.

The package-matched API documentation is in `node_modules/@ui-sdk/react/docs/llms.txt`. UI SDK is pinned to `0.1.0-beta.2`; upgrades must rerun keyboard, focus, accessibility, and visual checks.

## Agent access

The header's agent-access control opts the current tab into the SDK's native WebMCP `snapshot`, `query`, and `act` tools via `registerTools` from `@ui-sdk/react/agent`. No separate MCP server or model API key is needed. It is off after every reload. Every `act` step requires approval; read-only SDK discovery may briefly open a popup to inspect its choices. Disabling access cancels pending approval and unregisters the tools. Password and connection-string fields are secret even when a password is visible; Onboarding, the SQL workbench, and row data (including full-value dialogs and query plans) are hidden from the bridge. Saving or creating instance connections, materialized-view refreshes, destructive buttons, and submit buttons carry `data-agent-confirm` and remain human-operated. Mark other sensitive final actions explicitly when adding them.

These permissions govern UI SDK tools, not arbitrary same-origin JavaScript or browser automation. Registration requires browser support for `document.modelContext.registerTool`; browsers without it do not register tools, and the ordinary UI remains usable. The agent client must support discovering and invoking the browser's WebMCP tools. No backend agent endpoint or credential persistence is added.

## Core behaviors and draft review

The instance configuration page coordinates non-secret drafts with the framework-independent `instance-draft` primitive in `features/agent-drafts`. Its explicit agent actions change only the display name, labels, SSL mode, and SSL negotiation. The React form stays the controlled owner; its change callbacks use `details.source` and `details.cancel()` to refuse incomplete agent edits, incompatible TLS settings, or edits during a save. Human draft editing and normal server validation stay intact.

With agent access enabled, **Draft activity** provides:

- Source-attributed revisions with a keyboard/RTL-capable picker composed from `createChange`, `createRovingFocus`, and `definePrimitive`, rendered and styled by the Querylane UI facade.
- **Preview revision** through `stageChanges`, followed by **Keep current draft** or **Revert preview**. Keeping a preview does not save it. Revert checks each field before and after permission resolves and preserves later edits.
- **Restore revision** through `history.seek`, and **Undo agent edits** through `history.undoSource("agent")`. Each bridge step still requires approval. Undo keeps later human revisions; restore intentionally selects the chosen revision and protects edits made while approval is pending. The labels collection is one atomic value.

History is local to the active form and records at most 100 revisions. Saving successfully, leaving the form, disabling access, or reloading clears it; clearing never submits or silently reverts a draft. It never records passwords, connection credentials/strings, SQL, result rows, or saved database operations. The separate page-level `observe` stream starts before app rendering, stores at most 100 provenance-only events while opted in, and excludes secret/hidden regions; it does not retain field values or send telemetry.

Long-lived subscriptions belong to the committed primitive **instance**, not a speculative React rendering handle. The history anchor is the primitive's leaf summary part; keep unrelated interactive controls outside it so only the whitelisted draft keys enter history. Async preview guards also bind to that element, route, and session lifetime.

The opt-in agent/history/review chunk has its own 20 KiB gzip cap. Source-map checks reject mixed chunks or agent modules in the initial download; the eager observer, store, and draft model still count against the existing core budget.

Read the installed `docs/core.md`, `docs/rendering.md`, and `docs/agents.md` before changing these contracts. Custom primitives are checked with `@ui-sdk/core/testing` (`checkPattern`, `checkServer`, `checkDirection`). `e2e/tests/agent-drafts.spec.ts` uses Playwright's native `page.webmcp` client and a disposable Chromium launched with WebMCP enabled; it does not stub browser registration, the SDK, or the app. The launch flag affects only that test browser, not personal browser settings. Normal supported-browser feature detection and explicit tab opt-in remain required in production.
