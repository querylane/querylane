---
"@querylane/frontend": patch
---

Restore registry sync by separating Querylane-owned controls from native shadcn output. Keep the sidebar's popup-search combobox
and horizontal navigation drawer in Querylane's owned UI layer, with unchanged
consumer props, keyboard behavior and layout. Existing imports for these custom
families move from `@/components/ui/{combobox,drawer}` to
`@/components/querylane-ui/{combobox,drawer}`. Unused registry alternatives are not
shipped alongside the owned implementations. No dependency upgrade or visual redesign.

Import the existing `createComboboxItems` helper directly from
`@/components/querylane-ui/combobox-items`.
