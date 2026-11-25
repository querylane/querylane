# Querylane UI

Base UI 1.9.0 is the foundation for standard controls: buttons, inputs, selection, tabs, menus, dialogs, popovers, tooltips, disclosure, radio, switches, and the navigation drawer. Base UI owns their keyboard, focus, popup, and interaction state. `src/components/ui` styles those foundations; this directory owns Querylane-specific variants and compositions. Both directories are authored code and receive the full quality gates.

UI SDK beta.13 enhances that foundation with its seven public React hooks, source-aware changes, custom non-secret draft primitives, observation/history, native WebMCP, and specialized Command, Toast, Resizable, Field, and textarea compositions. Do not install a second focus, keyboard, or popup state machine over a Base UI control. Preserve the existing `variant`, `size`, and finite `presentation` APIs; consumer classes should describe layout.

UI SDK owns `data-slot`; Querylane styling and test hooks use `data-querylane-slot`. Native state selectors follow their owner: Base UI tabs expose `data-active`, for example, while SDK components may expose `data-selected`. Preserve native ARIA roles rather than forcing the two libraries to produce identical markup.

The sidebar picker uses Base UI Combobox with an in-popup search field and a native item collection. Its focus-out extension invokes Base UI's public `actionsRef.close()` and suppresses focus return only when focus already moved outside. The navigation drawer uses Base UI Drawer. Specialized CodeMirror, data-grid, chart, and graph engines remain unchanged.

Version-matched SDK documentation ships in `node_modules/@ui-sdk/react/docs/llms.txt`; Base UI documentation is at https://base-ui.com/react. Upgrades must rerun keyboard, focus, accessibility, native WebMCP, and visual checks.

## Applying patterns from the SDK gallery

Start with the matching example in the [UI SDK sink](https://ui-sdk.dev/sink) and confirm its API in the installed docs. Reuse the smallest behavior that solves the workflow. For example, Data Explorer uses the SDK's locale-aware number parser under the existing Base UI row input; it keeps row bounds and integer validation in Querylane. Keep database filter values canonical even when the input displays a localized value.

- For a new composition, put reusable behavior in a Core primitive and render it with React parts and Querylane tokens. Name the actual focusable control, retain the SDK part's props and ref when customizing its render, and use the owner's state attributes for styling.
- Use one state owner per interaction. Reflect controlled values and route edits through source-aware, cancelable callbacks. Keep selection, focus return, and scroll locking with the existing Base UI overlay rather than layering an SDK overlay inside it.
- Verify the real consumer with keyboard and pointer input and an invalid or canceled edit. For custom primitives, use `checkPattern`, `checkDirection`, and `checkServer` where applicable; for agent-facing controls, also verify approval/refusal and any secret or hidden boundaries through the native bridge.

## Explicit Base UI agent adapters

SDK discovery does not automatically cover Base UI. `features/ui-agent` binds passive SDK primitives to the actual Base UI DOM using `usePrimitive` and `usePart`, without extra wrapper elements or interaction handlers. Each adapter declares an action allowlist. Reflected value/checked/open state is read-only metadata, not another owner of control state.

Actions invoke the native control's callbacks or enabled item elements; selects support labels and exact multi-selection sets. Invalid values and disabled/read-only targets are refused. Clearing a mixed checkbox is refused rather than toggling it to the opposite requested state. Async actions publish SDK `pending`/`error` state so the bridge waits for completion instead of reporting an unfinished edit as success. Route changes, revocation, and unmounts invalidate pending selection work. Input/Select callbacks retain SDK source attribution and cancellation; canceled uncontrolled input edits restore the last accepted draft.

Secret inputs are masked before their value getter is read. Root safety markers and the trigger's DOM ancestry propagate across Base UI portals, including nested explicit-false markers; mutation observers and refs are cleaned up on unmount. Sensitive final actions remain manual. Generic discovery does not expand the draft-history whitelist.

## Agent access

The header's agent-access control opts the current tab into the SDK's native WebMCP `snapshot`, `query`, and `act` tools via `registerTools` from `@ui-sdk/react/agent`. No separate MCP server or model API key is needed. It is off after every reload. Every `act` step requires approval; the SDK can inspect a closed control’s choices during an approved action, while snapshot/query do not silently open it. Disabling access cancels pending approval and unregisters the tools. Password and connection-string fields are secret even when a password is visible; Onboarding, the SQL workbench, and row data (including full-value dialogs and query plans) are hidden from the bridge. Saving or creating instance connections, materialized-view refreshes, destructive buttons, and submit buttons carry `data-agent-confirm` and remain human-operated. Mark other sensitive final actions explicitly when adding them.

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

## React hook ownership

Application shortcuts use SDK `useShortcut` for key matching, text-entry/IME guards, repeat suppression, latest handlers, and registration cleanup. `useUiShortcut` adds a predicate against actual Base UI modal elements; it does not register a second layer manager. Page shortcuts pause behind Base UI modals, while a binding inside the top modal remains eligible. The app registry still owns action names, native editor/grid help entries, and the one-second two-stroke navigation chords; the chord adapter tracks only the prefix, while the SDK checks both strokes. `useShortcutHint` formats the help sheet's primary modifier and the search button's accessible shortcut metadata for the actual platform. The palette has a page-level opener plus a close binding in its own modal layer, so the primary shortcut still toggles it without escaping unrelated modal guards. Keep CodeMirror and data-grid native keymaps with their existing owners.

`ThemeProvider` uses `createColorScheme`, SDK local storage, and `usePreference`. Keep the `querylane-ui-theme` storage contract, external CSP-safe `theme-init.js`, Tailwind's existing light/dark classes, and `color-scheme` in sync. Preference changes from another tab and unavailable storage must not break the ordinary UI.

All seven public React hooks have production consumers. The custom `SqlSchemaSelect` uses `useFieldControl` to join the workbench's real Field label/description and inherit its invalid/disabled state; the Base UI Input facade uses that same hook to join SDK Fields. Do not stack a second field owner on either control.

Schema-search options have one lifecycle owner: `useAsyncOptions` handles debounce, loading/error announcements through `CommandStatus`, stale-result exclusion, and explicit retry. Its AbortSignal reaches the typed ConnectRPC transport. Closing the popup, changing database or SQL tab, disabling the Field, or unmounting ends that search session and aborts its work. Each request stays bounded to 50 results; server filtering can search beyond the catalog snapshot. This replaces the picker's former query/debounce pair, rather than stacking a second request state machine on it. Resource caches elsewhere remain owned by Connect Query. No schema selection runs SQL or submits a database change.
