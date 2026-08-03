# HTML wireframe quality: single source of truth

This file is the canonical standard for HTML wireframes, `<Screen>`, and
`WireframeBlock` content, shared word for word by `/visual-plan` and
`/visual-recap`. Read it in full before authoring any wireframe; do not
author wireframes from memory or paraphrase these rules per command.

<!-- SHARED-CORE:wireframe-quality START -->

**A wireframe is an HTML mockup. The renderer owns the look; you write the
content.** Set `data.html` to a self-contained, semantic HTML fragment of the
screen and set `data.surface`. The renderer owns the surface footprint and
aspect ratio, the dark and light theme, the hand-drawn font, and the rough.js
sketch overlay. You never write `<html>`, `<body>`, `<script>`, or `<style>` tags
or any width, height, or coordinates. You write real HTML layout and real
product content; the renderer styles and roughens it.

**A wireframe block's data is an HTML screen plus a surface:**

```json
{
  "surface": "browser",
  "html": "<div style=\"display:flex;flex-direction:column;gap:10px;padding:16px;height:100%\"><h1>Sign in</h1><p class=\"wf-muted\">Use your work email to continue.</p><div class=\"wf-card\" style=\"display:flex;flex-direction:column;gap:10px\"><label>Email<input value=\"jane@acme.co\" /></label><label>Password<input value=\"••••••••\" /></label><label style=\"display:flex;align-items:center;gap:8px\"><input type=\"checkbox\" checked /> Remember me</label><button class=\"primary\">Sign in</button></div><a href=\"#\">Forgot password?</a></div>"
}
```

**Write plain semantic HTML and let the renderer style it.** Bare elements
(`h1`, `h2`, `h3`, `p`, `button`, `input`, `<input type="checkbox">`, `a`, and `hr`)
are automatically themed. No classes are needed. Helper classes carry the rest:

- `.wf-card` or `.wf-box`: a bordered, padded container (a panel, a list item).
- `.wf-pill` or `.wf-chip`: a rounded tag or filter; add `.accent`
  (`<span class="wf-pill accent">`) for the accent-filled variant.
- `.wf-muted`: secondary or muted text (or use `<small>`).
- `button.primary` or any element with `[data-primary]`: the accent-filled
  primary button.

**No decorative shadows around mockups.** Do not put `box-shadow`, `filter:
drop-shadow(...)`, Tailwind `shadow-*` classes, or other fake depth effects on a
wireframe frame, root container, `.wf-card` or `.wf-box`, or canvas artboard.
Mockups should read as flat, bordered surfaces; use spacing, borders, labels,
and annotations for separation. Only show a shadow when the real product UI
already has that shadow and it is essential to the change being reviewed.

**Use renderer icons, not visible icon words.** For icon-only buttons or leading
icons inside fields, chips, menu items, and toolbars, write an empty marker such
as `<span data-icon="mail" aria-label="Email"></span>` or
`<i data-icon="lock"></i>`. The renderer replaces it with a Tabler-style SVG and
the `.wf-icon` class sizes it to the surrounding text. Supported names and
aliases: `mail` or `email`, `lock` or `password`, `search`, `plus` or `add`, `x` or `close`,
`check`, `chevronDown`, `chevronUp`, `chevronLeft`, `chevronRight`, `dots` or `more`,
`chevron`, `caret`, or `dropdown` (down chevron), `user`, `settings`, `calendar`,
`bell`, `send`, `edit`, `arrowLeft`, and `arrowRight`. Do not put visible words
like "email", "lock", "search", "chevron", or "more" where the product UI would
show an icon; use text only when it is a real label a user would read.

**Use the `--wf-*` tokens for any custom color, never hex.** The renderer flips
these on light and dark, so reading them is what keeps a mockup correct in both
themes. For any inline border, background, or text color, reference a token:
`style="border:1.4px solid var(--wf-line)"`. The tokens are `--wf-ink` (text),
`--wf-muted` (secondary text), `--wf-line` (borders/dividers), `--wf-paper`
(page background), `--wf-card` (container surface), `--wf-accent`,
`--wf-accent-fg`, and `--wf-accent-soft` (brand action), `--wf-warn`, `--wf-ok`,
and `--wf-radius`. Never hard-code a hex color and never set `font-family`. The
renderer owns the sketch or clean font.

**Never use host/Tailwind theme classes in wireframe HTML.** Classes such as
`bg-white`, `bg-zinc-50`, `bg-slate-950`, `text-zinc-950`,
`text-slate-400`, `border-zinc-200`, `hover:bg-slate-800`, `shadow-xl`,
or arbitrary color utilities like `bg-[#fff]` leak the host app's CSS into the
mockup and can make dark-mode canvas frames unreadable. Use bare semantic
elements, `.wf-*` helper classes, and `--wf-*` color tokens instead. Before
publishing, scan every wireframe `class` and `style` attribute: if a class sets
background, text, border, ring, fill, stroke, gradient, placeholder, decoration,
or shadow color, rewrite it to renderer tokens or remove it. Layout-only classes
are still discouraged; inline flex or grid styles are safer and easier to review.

**Keep Rough.js sparse.** The renderer sketches the outer frame, standard
`.wf-*` primitives, controls, and inline border dividers by default. Do not add
`data-rough` to broad root wrappers, dialog shells, page panels, grid cells, or
nested containers unless that single container is the visual point. Use
`data-rough` only for a deliberate single shape. If a mockup starts looking
like stacked or overlapping sketch lines, remove rough targets from parent
containers and let backgrounds and spacing separate the surfaces.

**Use literal CSS lengths for spacing.** The `--wf-*` tokens are for colors and
renderer-owned visual styling, not layout spacing. Do not use guessed spacing
tokens such as `var(--wf-space-4)`, Tailwind spacing classes, or theme spacing
variables inside wireframe HTML; if a token is unavailable in the Plan renderer,
padding collapses and content hugs the border. Use explicit CSS lengths for
layout: `padding:16px`, `gap:12px`, `margin-top:18px`, `minmax(0,1fr)`.

**Lay out with inline `style` flex or grid.** You write the real layout:
`display:flex; flex-direction:column; gap:10px; padding:16px` and similar values. The
renderer never repositions anything. Compose the actual product: reproduce the
current screen, then show the modification. Real labels, real counts, real dates,
real button text grounded in the screen you read; not lorem or gray bars.

**Surface presets must match the real footprint; never default to desktop and mobile.**
Pick the `surface` that matches what the user sees:

- `browser`: a web page that needs a browser chrome frame around it.
- `desktop`: a full desktop app page or app shell.
- `mobile`: a phone screen, only when the work is genuinely mobile.
- `popover`: a small floating menu, dropdown, or inline popover.
- `panel`: a side panel, inspector, or sidebar widget.

A sidebar popover renders as a small surface, not a desktop page and a phone
frame. Do not emit `desktop` and `mobile` variants unless responsive behavior
changes the layout. For a component or widget, show a broader
app-context frame only when placement affects understanding, then the focused
component states.

**Model the actual component shell for small surfaces.** A rendered UI change
belongs in a wireframe; reserve `diagram` for architecture, dependency, state,
or data-flow relationships. Popovers, dropdown menus, command palettes, and
context menus use `surface: "popover"` unless the surrounding page placement is
the point of the change. Dialogs, sheets, inspectors, sidebars, and long
property panels use the matching `panel` or `desktop` surface as appropriate.
Show the real chrome: trigger or anchor when it matters, title or header row,
top-right actions, separators, fields, options, selected states, body content,
and footer actions that are visible in the workflow.

**Modify, don't redesign.** When the task changes an existing screen, reproduce
the current screen's real layout and footprint first, then change only the delta
and call it out with a single annotation. Do not restack the page into a new
layout. For net-new surfaces, compose from the real app shell. Inspect the
actual app components before drawing an existing product: sidebar density,
toolbar actions, overflow menus, property panels, and framework chrome should
match the product unless the plan intentionally changes them.

**Keep product screens pure.** A product wireframe shows the app state a user
would see. Do not embed file contracts, architecture arrows, repository pills,
mode explanations, or implementation callouts inside the screen just to explain
the plan. Put those in canvas annotations, a separate diagram, or the document
body. Secondary UI such as properties, history, sync, export, or agent controls
should appear where the real product would put them: an overflow popover, sheet,
panel, or separate framework sidebar state, not a generic permanent right
inspector unless that inspector is the actual design.

**Classify mockup scope before implementation.** Before turning a plan mockup
into source code, decide whether each artboard represents the whole page or app
shell, a route body inside an existing shell, or a component or sub-surface. If an
artboard includes navigation, sidebars, authentication banners, or a sign-up or
login form, map those pieces to the real shared shell and authentication
components instead of nesting the entire mockup inside the current page. When a
mockup references the product's standard sign-up or login page, find and reuse
that existing implementation; do not approximate it from the wireframe.

**Zoom in on sub-surfaces, don't redraw the page.** For a small sub-surface (a
popover, menu, dialog, toast), show the full screen once, then add a small
separate artboard whose `html` contains only that sub-surface. Do not redraw
the whole page around it, and do not scale a duplicate up. Pick the matching
`surface` (for example, `popover`) so the footprint is right; never widen a
popover to page width.

**Loading and skeleton states.** Set `data.skeleton: true` on the wireframe and
fill the `html` with neutral, textless placeholder geometry, using boxes and bars
built as `<div>`s with `background:var(--wf-line)` and explicit heights and widths,
no labels or copy. The renderer drops borders, sketch, and color into the
skeleton register automatically. Never escape to a `custom-html` document block
to fake a loader.

**Editing an existing mockup.** In hosted mode, to change a single element,
text, or color in an existing HTML mockup, do not regenerate the frame. Call
`update-visual-plan` with
`contentPatches: [{ op: "patch-wireframe-html", blockId, edits: [{ find,
replace }] }]`. Each `find` is a unique snippet of the current html (read it
first with `get-visual-plan`); set `all: true` on an edit to replace every
occurrence. The result is re-sanitized. In local-files privacy mode, do not call
hosted Plan tools; edit the local MDX source directly and rerun the local
check, serve, or verify command for `<plan-dir>`.

**Choose the outer frame deliberately.** Wireframe and diagram data accept
`frame: "auto" | "show" | "hide"` in block data (`<Screen frame="hide">` in
MDX wireframes, `<Diagram frame="hide">` for MDX diagrams). Leave it unset or
`auto` when the host context should decide: Plan and recap surfaces default to a
drawn outer frame; docs surfaces default to no outer frame. Use `show` for
standalone product screens and before-and-after recap comparisons,
screenshot-like artifacts, and visuals that need containment from surrounding prose. Use `hide`
when a docs page, tab, column, card, canvas artboard, or the visual's own
internal chrome already supplies the boundary. Do not use `hide` to compensate
for cramped content; fix the layout instead.

**Inner padding and borders still matter.** Always wrap HTML wireframe content
in a root container with real inner padding before drawing cards, fields, pills,
labels, or controls. Use at least 14px to 16px of padding, `box-sizing: border-box`,
`height: 100%`, and `gap` between child rows on the root node itself so the
first row never sits flush against the screen edge. Do not rely on padding on a
nested page section as the first visible inset; the outermost element must
create the inner space. Keep text away from borders: every container, field,
button, menu item, and annotation needs enough padding and line-height to read
cleanly in the rendered Plan view.

**For feature-cloud or abundance visuals, prioritize composition over
line-by-line reading.** Some marketing or product sections need to feel like a
large surface area of capability rather than a precise app workflow. In those
cases, use a padded root with a short headline and a dense cloud of short feature labels,
chips, rings, or columns. Vary scale and opacity with tokens, cluster by meaning,
and let many labels be scannable rather than individually essential. Do not
force dozens of features into equal cards with long wrapped sentences; that
usually creates a messy unreadable mockup.

**Lay out children safely so they never collide.** Use HTML flex or grid with
`gap`, `min-width: 0`, and sensible overflow. Avoid negative margins, absolute
positioning, or fixed child widths that can collide when the renderer switches
between light and dark, sketch and clean, or different zoom levels.

**Do not wrap intentionally single-line labels.** For toolbars, tab rails,
breadcrumbs, chip or filter rows, branch and file names, file chips, and code
filenames, or any deliberately single-line row, do not let long text wrap. Put
`white-space: nowrap` on the row (and `overflow: hidden; text-overflow: ellipsis`
on the individual labels that can grow), so the wireframe demonstrates the actual
layout behavior instead of producing unintended stacked or vertical text. Use
horizontally scrollable or clipped rails for overflow.

**Fill the frame; keep labels short.** Each artboard is a fixed-size surface.
Compose enough realistic HTML to fill it from top to bottom with even vertical
rhythm; never leave a large empty band. In desktop or app-shell sidebars, let
the navigation stack fill the available space (`flex:1`) and add any persistent
bottom action or status after it so the rail reads as complete in taller frames.
On mobile, flow real rows down the whole screen (status bar, header, then list or
detail content) rather than leaving a header followed by a gap. Keep every label
short enough to fit on 1 line within its column. Shorten the copy rather than relying
on the frame to absorb it because long labels wrap or clip.

**Persistent chrome bars span the full frame width.** Top bars, app headers,
toolbars, and bottom tab/nav bars are full-width chrome, not centered content.
Lay each one out as a single flex row that fills the frame
(`style="display:flex;align-items:center;width:100%"`) and push trailing actions
to the right edge with a flex spacer (`<div style="flex:1"></div>`) between the
leading group and the trailing group. Never center a bar inside a narrow,
centered block, and never let it collapse to the width of its contents. In a
before-and-after pair, the bar stays full-width in both states even when one
state has fewer controls; the spacer absorbs the difference so the remaining controls hold
their edge alignment instead of sliding to the center.

**Pin bottom bars to the bottom of the frame.** For mobile tab bars, footers, and
any persistent bottom action row, make the frame itself a flex column at
`height:100%` (`style="display:flex;flex-direction:column;height:100%"`), give the
scrolling body `flex:1` so it absorbs the slack, and place the bar as the last
child of the frame (or set `margin-top:auto` on it). The bar then sits flush at
the bottom of the surface instead of floating directly under the content with an
empty band beneath it.

**Before and after must be comparable.** When showing a state change, preserve the
unchanged controls in both states so the reviewer can see exactly what moved or
appeared; do not show an added control as a generic box floating elsewhere in
the surface. Place the new or changed affordance where the implementation puts
it. For example, a new `Edit with AI` action in a popover header belongs in the
top-right header slot, aligned with the title, not in the body or footer. Use
the same frame size, scale, outer padding, border radius, and visual density on
both sides unless the change itself alters those properties, and let the frame
height fit the content rather than leaving a tall empty lower half.

**Name the states with the column header, never inside the frame.** For
document-body wireframes (recaps), put the 2 states in a `columns` block and set
each column's `label` to `Before` and `After`. The renderer draws that label as
an `h4` heading for each frame. Do not bake a `Before` or `After` pill, title, or
heading into the wireframe `html`: a
label placed inside reads as part of the product UI, lands in a random corner,
and clutters the comparison. The column header is the only place the
state name belongs. On a canvas, place the 2 state artboards as neighbors with
frame labels. Never encode `Before` or `After` inside the HTML.

**Let the surface choose side-by-side or stacked layouts.** For document-body
wireframes (recaps), the `columns` renderer lays
narrow surfaces (`mobile`, `popover`, `panel`) out side by side, and
automatically stacks wide surfaces (`desktop`, `browser`) vertically at full
document width so a large frame is never compressed into a half-width column and
cropped. Author both wireframes with the real `surface` and the matching
`Before` and `After` column labels; do not hand-stack the pair into separate
top-level wireframes or duplicate the state name as body content.

**Good example: a contacts list with the `browser` surface.** A small, real screen
composed from the helper classes and tokens, layout in inline flex, no fonts or
hex colors:

```html
<div
  style="display:flex;flex-direction:column;gap:12px;padding:16px;height:100%"
>
  <div style="display:flex;align-items:center;justify-content:space-between">
    <h1>Contacts</h1>
    <button class="primary">New contact</button>
  </div>
  <div style="display:flex;gap:6px">
    <span class="wf-pill accent">All 128</span>
    <span class="wf-pill">Favorites</span>
    <span class="wf-pill">Archived</span>
  </div>
  <div
    class="wf-card"
    style="display:flex;flex-direction:column;gap:0;padding:0"
  >
    <div
      style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1.4px solid var(--wf-line)"
    >
      <div
        style="width:32px;height:32px;border-radius:999px;background:var(--wf-accent-soft)"
      ></div>
      <div style="flex:1">
        <strong>Jane Cooper</strong><br /><small>jane@acme.co</small>
      </div>
      <span class="wf-pill">Lead</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
      <div
        style="width:32px;height:32px;border-radius:999px;background:var(--wf-accent-soft)"
      ></div>
      <div style="flex:1">
        <strong>Marcus Lee</strong><br /><small>marcus@globex.io</small>
      </div>
      <span class="wf-pill">Customer</span>
    </div>
  </div>
</div>
```

<!-- SHARED-CORE:wireframe-quality END -->
