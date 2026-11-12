# Querylane UI

`src/components/ui` owns styled UI SDK primitives. This directory owns Querylane-specific variants and compositions. Both directories receive the full quality gates; neither is vendored registry output.

Use UI SDK parts for interaction behavior and keep existing `variant`, `size`, and finite `presentation` APIs for appearance. Consumers should only pass layout classes. Variant functions and shared types live in separate modules for Fast Refresh.

UI SDK owns `data-slot`. Querylane styling and test hooks use `data-querylane-slot` so they cannot replace the SDK's behavior hooks. State selectors follow the SDK's documented attributes, such as `data-selected` and `data-orientation`.

The sidebar picker uses UI SDK Combobox with an in-popup search field. The navigation drawer uses UI SDK's horizontal Drawer. Specialized CodeMirror, data-grid, chart, and graph engines remain unchanged.

The package-matched API documentation is in `node_modules/@ui-sdk/react/docs/llms.txt`. UI SDK is pinned to `0.1.0-beta.1`; upgrades must rerun keyboard, focus, accessibility, and visual checks.

## Agent access

The header's agent-access control opts the current tab into WebMCP. It is off after every reload. Every `act` step requires approval; read-only SDK discovery may briefly open a popup to inspect its choices. Disabling access cancels pending approval and unregisters the tools. Password and connection-string fields are secret even when a password is visible; Onboarding, the SQL workbench, and row data (including full-value dialogs and query plans) are hidden from the bridge. Saving or creating instance connections, materialized-view refreshes, destructive buttons, and submit buttons carry `data-agent-confirm` and remain human-operated. Mark other sensitive final actions explicitly when adding them.

These permissions govern UI SDK tools, not arbitrary same-origin JavaScript or browser automation. Browsers without WebMCP do not register tools. No backend agent endpoint or credential persistence is added.
