---
name: visual-recap
description: >-
  Turn a PR, branch, commit, or git diff into an interactive visual recap with
  diagrams, file maps, API/schema summaries, annotated diffs, and focused review
  notes.
metadata:
  visibility: exported
---

# Visual recap

`/visual-recap` creates a visual plan built **from** a diff, not toward one. It
is the reverse of forward planning: instead of describing the change you are
about to make, you describe the change that was just made, at a higher altitude
than line-by-line review. The same plan data model serves both directions:
schema, API, file, and architecture changes become the same `data-model`,
`api-endpoint`, `file-tree`, and `diagram` blocks a forward plan would use, only
now they summarize work that exists. A reviewer scans the shape of the change
before spending attention on the literal lines.

## Publish as an Agent-Native Plan, never inline

The deliverable is always a published Agent-Native Plan, created with
`create-visual-recap` on the Plan MCP connector. Never use inline chat content (not
Markdown prose, an ASCII sketch, a table, a fenced "wireframe", or a "here's the
recap" summary). A recap's entire value is the hosted, interactive, annotatable
plan; an inline summary is not a degraded recap, it is the thing a recap
replaces. If the `plan` (or legacy `agent-native-plans`) tools are not visible,
discover them through the host's `tool_search` first; if they are still missing,
stop and give the user the client-specific reconnect step rather than improvising
an inline recap. Before publishing, or whenever a connector or authentication error
appears, read `references/connection.md` in this skill directory. It is the
single source of truth for the never-inline rule, connector discovery, and the
per-client reconnect steps. The "Local-files privacy mode" section describes the
1 exception.

## Local-files privacy mode: read `references/local-files.md`

When the user wants no hosted Plan database writes (no database writes, no Plan MCP
publish, fully local, offline, or private recaps, or `AGENT_NATIVE_PLANS_MODE=local-files`),
do not call any hosted Plan tool except the schema-only `get-plan-blocks`
catalog lookup. Read the diff with the local `recap collect-diff`, `scan`, and
`build-prompt --local-files` helpers, author a local MDX folder (set
`kind: "recap"` and `localOnly: true`), and preview it with `plan local check`,
`plan local serve --kind recap`, and `plan local verify --kind recap`. Before
using local-files mode, read `references/local-files.md` in this skill directory.
It is the single source of truth for the full contract.

## When to use it

Build a recap when a PR or commit is large, multi-file, or touches schema, API
contracts, or architecture, and a reviewer would benefit from seeing the change
mapped to structured blocks before reading the raw diff. A GitHub Action can
generate one automatically from a PR diff; an agent can generate one on request
("recap this PR", "show me what this branch changed"). Skip it for small,
single-file, or obvious diffs. A recap is review overhead, and a tiny change
reviews faster as plain diff.

## Recap the whole work unit

When `/visual-recap` is invoked in a chat thread after work has already happened,
the default scope is the whole current work unit/thread, not only the most recent
user message, tool action, or follow-up fix. Gather the thread-owned changes
across the conversation: original implementation work, later bug fixes, UI
follow-ups, tests, changesets, skill/instruction updates, generated plan/source
artifacts, and any local import/linking fixes needed to make the recap open.

Use the current diff plus conversation context to separate thread-owned changes
from unrelated dirty work that existed before the thread. Exclude unrelated
pre-existing edits. If the scope is genuinely ambiguous and cannot be inferred,
state the assumption or ask a concise question before publishing.

When updating an existing recap after feedback, revise the recap so it still
covers the whole thread/work unit plus the new correction. Do not replace a broad
recap with a narrow recap of only the latest feedback unless the user explicitly
asks for that narrower scope.

## Keep the recap body lean

Do not add boilerplate intro, disclaimer, provenance, or summary prose blocks to
the generated plan body. In particular, do not create a `rich-text` block just to
say the recap is an aid, that the reviewer should still review the diff, how many
files changed, or which ref/working tree generated the recap. The plan title,
brief, and `file-tree` (which carries the per-file change stats) already carry
that context.

Only add prose blocks when they tell the reviewer something specific about the
change that the structured blocks do not: the objective, a real compatibility
risk, an important decision visible in the diff, or a grounded review note.

## Make recaps substantial

Lean is not the same as thin. A recap is not a single wireframe plus 1
sentence. That gives the reviewer too little evidence, while boilerplate adds
too much. Alongside the visual and structural headline (wireframes, `data-model`,
`api-endpoint`, `diagram`), a substantial recap also carries the implementation
evidence:

- A short surface/state inventory before authoring: list the changed routes,
  components, popovers/dialogs, role/access states, empty/error states, and
  shared abstractions visible in the diff. The final recap must either represent
  each meaningful item with a block or intentionally omit it because it is tiny,
  redundant, or not user-visible.
- A `file-tree` of the changed files with each entry's `change` flag, so the
  reviewer sees the footprint of the work at a glance.
- The split `diff` of the key changed files, grouped under a `## Key changes`
  `rich-text` heading in a single horizontal `tabs` block (the default
  orientation, 1 file per tab), with a 1-line `summary` and a few
  `annotations` on each, so the reviewer can move from the high-level shape
  straight into the load-bearing code. Use horizontal file tabs, not a vertical
  side rail, so the selected file has enough width for the side-by-side diff.

Skip the diff appendix only for a genuinely tiny change that reviews faster as
plain diff (see "When to use it"); for any change worth recapping, the file tree and
key-change diffs belong in the plan.

## Use the canonical shape and budgets

A strong recap follows a single skeleton, top to bottom:

1. UI-impact headline, with wireframes first when the diff changed rendered UI.
2. Short outcome narrative (`rich-text`): what changed and why, 1-3 paragraphs.
3. `data-model` or `api-endpoint` blocks for schema and contract changes.
4. `file-tree` of the changed files with `change` flags.
5. `## Key changes`, with 1 horizontal `tabs` block of `diff` or `annotated-code`.

Budgets that keep the recap reviewable:

- 3-8 key-change tabs. Fewer than 3 on a large change under-serves the
  reviewer; more than 8 stops being a summary.
- Keep each diff or annotated-code excerpt focused. Prefer fewer than about 150 lines per
  tab; summarize or link the rest of a long file instead of dumping it.
- Title at most ~70 characters; brief 1-3 sentences.

**Good example.** A 25-file authentication change: before-and-after wireframes of the login surface,
a 2-paragraph narrative, a diff-aware `data-model` of the sessions table, an
`api-endpoint` for the new refresh route, a `file-tree` with change flags, and
`## Key changes` with 5 focused tabs, each with a 1-line `summary` and a
few annotations on the load-bearing hunks.

**Bad example.** A giant unsegmented diff dump with no summaries or annotations, or a
sparse 3-block recap of a 40-file change (1 wireframe, 1 sentence, and 1
file list) that forces the reviewer back into the raw diff anyway.

## Show UI impact with wireframes

When the diff changes rendered UI, layout, density, visual state, interaction
affordances, navigation, controls, menus, dialogs, or design tokens, the recap
must include 1 or more wireframes. Prose and file diffs are not a substitute
for showing what changed visually.

Before choosing wireframes, make a UI coverage pass from the diff:

- Identify the entry surface where the change appears, such as a page header,
  list row, toolbar, route shell, or menu trigger.
- Identify the interaction surface that opens or changes, such as a popover,
  dialog, tab, sheet, dropdown, inline editor, or toast.
- Identify the resulting destination or persistent state, such as a public page,
  read-only view, empty state, error state, loading state, permission-denied
  state, or saved/shared state.
- Identify access or role variants when permissions change. Compare owner,
  admin, and editor views with viewer and non-manager views. These differences
  are visual behavior and need a compact matrix, paired wireframes, or clearly
  labeled state sequence.

For UI-heavy PRs, a single before/after of the entry surface is not enough.
Show the changed entry point, the main changed interaction surface, and the
resulting/destination state. Add more states when the diff adds tabs, role-based
controls, public/private visibility, invite/manage flows, destructive controls,
or empty/error branches.

Choose the smallest visual surface that makes the review clear:

- Use a before-and-after wireframe pair when the reviewer benefits from direct
  comparison, such as a removed or added control, a changed state, layout
  density, ordering, navigation, or a visible component replacement.
  `references/wireframe.md` owns how to lay that pair out (columns or a
  vertical stack, based on geometry).
- Use an after-only wireframe when the change is purely additive or the "before"
  state would only show absence without adding review value.
- Use more than 2 wireframes when the UI change is flow-dependent, responsive,
  or stateful; show the meaningful states in order instead of forcing a single
  before/after pair.
- For tiny surfaces like menus, popovers, dialogs, toasts, or panels, use the
  matching `surface` (such as `popover` or `panel`) and show the focused sub-surface.
  Do not redraw a full page unless placement in the page is itself part of the
  change.

Ground each wireframe in the changed UI behavior, component names, file paths,
and diff-visible labels/states. If exact pixels are inferred rather than
captured, say so in the wireframe caption or a concise annotation. For
local/manual recaps, import or update the plan source that holds the wireframes
so the rendered recap opens with the UI visual available.

## Wireframe quality: read `references/wireframe.md`

UI recap and plan wireframes must meet a strict standard: full-width chrome,
pinned bottom bars, real product content, before/after comparability, the right
`surface` preset, `--wf-*` tokens instead of hex, and no `<html>`/`<style>`/font
tags. Before authoring any wireframe, `<Screen>`, or `WireframeBlock`, read
`references/wireframe.md` in this skill directory. It is the single source of
truth for HTML wireframe quality, shared word for word with `/visual-plan`
and `/visual-recap`. Do not author wireframes from memory.

Use the standard `WireframeBlock` and `<Screen>` format so the Plan viewer owns the
surface frame, theme, and sketchy or clean toggle. HTML wireframes are appropriate
when placement precision matters, especially popovers, menus, dialogs, and dense
forms. For HTML
wireframes, keep `renderMode` unset or `wireframe` unless a design-only editable
mockup is explicitly required, because `renderMode="design"` disables the
sketchy rough overlay.

When a browser tool is available, render a UI-impact recap in the Plan viewer
and visually inspect it at the current theme before sharing. If any label,
annotation, toolbar, or wireframe content overlaps another element, fix the MDX
and re-import before reporting the link. A text-match screenshot is not enough;
visually inspect the captured image. When no browser is available (for example
a headless CI agent), state that in the recap handoff instead.

## Top canvas recaps: read `../visual-plan/references/canvas.md`

When a recap includes a top canvas, storyboard, or flow view, read
`../visual-plan/references/canvas.md` before authoring `canvas.mdx`. Recap
canvas artboards must use the same HTML wireframe path as good document-body
wireframes: `<Screen surface="..." html={...} />` with a semantic HTML fragment.
Do not author fresh kit-tree children such as `<FrameScreen>`, `<Card>`,
`<Row>`, `<Title>`, or `<Btn>` inside canvas `<Screen>` tags. Those components
are legacy compatibility markup for old plans; in new canvas storyboards they
can produce cramped or overlapping layouts even when the inline body wireframe
looks good. If a canvas mockup looks worse than the same document-body screen,
assume it used the legacy kit path and replace it with an HTML screen.

## Open and report the recap

In local-files privacy mode, run `plan local check` first, then report the local
bridge URL from
`npx @agent-native/core@latest plan local serve --dir <plan-dir> --kind recap --open`
or from `<plan-dir>/.plan-url`. It opens the hosted Plan UI but reads from the
localhost bridge on this machine, so it is not shareable across machines. If the
Plan app itself is running locally with the same `PLAN_LOCAL_DIR`, the
`/local-plans/<slug>` route is also valid. Do not invent a hosted database URL
and do not publish just to get an absolute Plan link.

After creating the recap, link the reviewer to the rendered plan with an
**absolute URL on the origin whose database actually holds the plan**. That
origin is the Plan MCP server that created the recap, not whatever
dev server you happen to know is running. The create tool returns the correct
link; report that URL. Never make the primary link a local `plan.mdx` file, a local
mirror folder, or a relative path such as `/plans/<id>`.

When the recap is posted to a PR for a private repository, the plan link is not a
public URL. Make the PR comment and handoff copy explicit: reviewers may need to
sign in to Agent-Native Plans with an account that has access to the owning
organization before the link loads. Use this wording: "Private repository recap:
sign in with access to this organization if the plan does not open." Do not imply the
link is broken or public when access is gated by repository and organization visibility.

A recap lives only in the database of the MCP that created it. A separately
running local development server (for example, `http://localhost:8081`) has its own database and
does not contain a recap created through the hosted MCP, so a hand-built
`localhost` link returns "Plan not found". This is the most common recap
mistake. Do not guess an origin you have not confirmed shares the MCP's data.

Resolve the URL in this order:

1. Use the absolute URL the create tool returns: `openLink.webUrl`, the
   `visualUrl` in the returned `plan.mdx` frontmatter, or `url` or `path`
   resolved against the MCP server's own origin (for the hosted MCP that is
   `https://plan.agent-native.com`). This always points at the database that has
   the plan.
2. Use a localhost development origin only when the recap was created through a Plan
   MCP bound to that same origin. That MCP's URL is
   `http://localhost:<port>/_agent-native/mcp`. Creating through the hosted MCP
   and linking to localhost is the exact mismatch that 404s.
3. If only a plan id is available, build the MCP origin's absolute URL
   (hosted: `https://plan.agent-native.com/plans/<id>`) and say it was inferred.

If the user wants to review on localhost but the recap was created through the
hosted MCP, say so plainly: the local dev server cannot see it. To view a recap
on localhost (for example, to exercise undeployed local renderer changes), they must
connect a local Plan MCP (`http://localhost:<port>/_agent-native/mcp`) and
re-create the recap through it so it lands in the local database. Offer to do
that instead of handing over a localhost URL that does not resolve.

When running in Codex and the Browser or in-app side browser tools are available,
open the returned absolute recap URL there automatically after creation. Still
include the same absolute URL in the final response. Local mirror files like
`plans/<slug>/plan.mdx` may be mentioned only as secondary source-control
artifacts, not as the main way to open the recap.

## Map diffs to blocks

Map each kind of change to the block that carries it, derived mechanically from
the actual diff. The following names are conceptual block types, not JSX
tags. Resolve every conceptual name to its exact tag and prop schema with the
`get-plan-blocks` tool (see "Block reference") before authoring.

- **Schema or migration change** → `data-model` for the resulting entities,
  fields, and relations. Flag what moved for each field or entity with
  `change: "added" | "modified" | "removed" | "renamed"`, and for a changed type
  set `was` to the prior value (for example, the old column type), grounded in the real
  migration diff. That diff-aware `data-model` is the headline; reach for a split
  `diff` of the literal SQL only when the exact statement still matters, not by
  default.
- **API, action, or route change** → `api-endpoint` with the method, path,
  params, request, and responses as they are after the change. Flag each changed
  parameter or response with `change` (and `was` on a parameter whose type or
  shape changed),
  and set `change` on the endpoint root for a wholly added or removed route. Mark
  removed endpoints with `deprecated: true` and explain in prose.
  Keep multiple API endpoints in the normal single-column document flow unless
  they are an explicit before-and-after contract comparison.
  Author each request or response example as exactly 1 valid JSON value: a
  top-level object or array that is parseable on its own. It then renders in the
  collapsible JSON explorer. Do not put `//` or `/* */` comments, prose,
  trailing commas, or 2 or more concatenated top-level objects inside 1
  example. Invalid JSON falls back to flat text and loses the explorer.
  When an endpoint has several distinct message shapes (for example separate
  websocket frame types, or a success body versus an error body), give each its
  own example and label instead of combining them in 1 body.
- **Compatibility-sensitive change** → short `rich-text` notes beside the
  relevant `data-model` or `api-endpoint` block. Name the changed field,
  endpoint, or behavior and mark whether it is breaking, risky, or non-breaking;
  pair that note with a split `diff` for the literal lines.
- **Any meaningful code hunk** → `diff` with `mode: "split"`, carrying the real
  `before` and `after` text and the `filename` and `language`. Split mode is the
  default for recap code review because before/after legibility is the point;
  use `mode: "unified"` only for a genuinely narrow standalone hunk where
  side-by-side would hide the code. Give every `diff` a 1-line `summary`
  saying what the hunk changes and why; it renders as a description before the
  code so the reviewer reads intent first. Never leave a diff unlabeled.
  For the key changed files, attach `annotations` to the `diff` so the recap
  calls out what each important hunk does. This is the primary way to annotate
  the key files. Each annotation anchors to the after-side
  line numbers by default (set `side: "before"` to point at removed lines). Keep
  it to a few high-signal notes per file rather than annotating every line.
  When several key files each need a substantial diff, introduce the group with a
  `rich-text` heading block whose markdown is `## Key changes`, then place the
  `diff` blocks under it in a reusable `tabs` block with horizontal orientation
  (the default; omit `orientation`) so the selected file's split diff gets the
  full document width. Let that heading label the section. Do not also set a
  `title` on the `tabs` block. Keep each tab label to the file path or a short
  basename plus directory hint.
  The renderer's wide document layout is intentionally allowlisted: `diff`,
  `annotated-code`, vertical `tabs`, and `tabs` containing diff-like children
  break out wider than prose. Do not put API endpoints, OpenAPI specs, data
  models, JSON explorers, wireframes, question forms, or custom HTML into tabs
  merely to make them wide.
  If the recap ends with more than 1 supporting diff, that trailing diff
  appendix should be 1 horizontal `tabs` block under its own `## Key changes`
  heading, not a stack of separate `diff` blocks.
- **New file or a substantial added block with no meaningful "before"** →
  `annotated-code` rather than an after-only split `diff`. Carry the real new code
  with its `filename` and `language`, and anchor a few high-signal notes to the lines
  that matter so the reviewer reads what the new code does, not code for code's
  sake. Keep split `diff` for true before/after hunks where the removed lines
  still carry meaning, and group several annotated walkthroughs in a horizontal
  `tabs` block the same way diffs are grouped.
- **Files added, removed, or renamed** → `file-tree` with each entry's `change`
  flag (`added`, `removed`, `modified`, `renamed`) and a short `note`; attach a
  `snippet` only when it tells the reviewer something the path does not.
- **Rendered UI or interaction change** → 1 or more wireframes showing the
  visible UI delta before the reviewer reads code. Use before-and-after
  wireframes when the comparison clarifies the change; otherwise use after-only
  or a short state or flow sequence. Use realistic UI surfaces: for a popover
  change, show a popover with its title row, top-right actions, options and fields,
  tabs, selected and disabled states, people, lists, rows, and any open prompt or menu
  anchored to the correct trigger. If a route was added, show the route body and
  the unavailable or empty state when the diff implements it. If permissions
  changed, show what managers can do and what viewers and non-managers see instead.
  Keep the body lean: the wireframe carries the UI story, while the file tree
  and `diff` blocks carry implementation evidence.
- **Architecture or data-flow shift** → `diagram` with `data.html` and `data.css`
  as a 2-panel before-and-after, layered, or swimlane layout, or `mermaid` for a
  quick graph. Use 2-dimensional layouts; do not reduce a structural change to
  a left-to-right chain. Do not use `diagram` as a stand-in for rendered UI
  controls; UI changes need `wireframe` blocks.
  Author diagram HTML/CSS with the renderer-owned `.diagram-*` primitives
  (`.diagram-panel`, `.diagram-node`, `.diagram-pill`, and `[data-rough]`) and
  the same `--wf-*` theme tokens `references/wireframe.md` defines. Never use
  `font-family`, hex, RGB or HSL literals, or single-use dark and light palettes.
  Choose
  the outer `frame` intentionally: recap diagrams usually benefit from
  `frame: "show"` when they stand alone, but use `frame: "hide"` when columns,
  tabs, a card, or the diagram's own panels already provide the boundary.
- **Outcome-first narrative** → `rich-text` for the "what changed and why" prose:
  the objective the diff served, the key decisions visible in it, and the risks a
  reviewer should weigh. This is the only place the model writes freely.

## Block reference: call `get-plan-blocks`, do not memorize tags

The conceptual block names in "Map diffs to blocks" (`api-endpoint`, `data-model`, `json-explorer`,
`tabs`, and other types) are not the JSX tags you author with. The exact tags,
required fields, and prop shapes change as the block library evolves. Do not author from
memorized tags. They drift and silently produce a wrong tag (`ApiEndpoint`
instead of `Endpoint`, `JsonExplorer` instead of `Json`, `Tabs` instead of
`TabsBlock`) that errors on import.

**Before writing any structured plan content, fetch/read the block catalog.** In
hosted or self-hosted mode, call `get-plan-blocks` on the Plan MCP connector
(`plan` or legacy `agent-native-plans`). If no Plan tools are visible yet in a
lazy-loading client, search/load them through the host's tool discovery surface
first (`tool_search` when available). In local-files mode, or when the skill was
installed as plain text and no MCP tools are registered after discovery, run
`npx @agent-native/core@latest plan blocks --out plan-blocks.md` and read that
file first. The CLI command calls the public no-auth `get-plan-blocks` route and
sends no plan/recap content. If network access is unavailable, use the bundled
references and validate with `plan local check`; run `plan local serve` only
when the hosted Plan UI is reachable or a local Plan app is already running.

The catalog returns the authoritative, always-current block vocabulary generated
live from the app's own block registry. The renderer and MDX round trip use the
same configuration, so the catalog cannot become stale even if this `SKILL.md`
is an old installed copy:

- `get-plan-blocks` (default `format: "reference"`) → a compact table of every
  block's runtime `type`, exact MDX `<Tag>`, placement, and key data fields.
  This maps each conceptual name to its real tag and props.
- `get-plan-blocks` with `format: "schema"` → the full per-block JSON Schema
  plus a worked example for each block, when you need exact field types,
  enums, or nesting (for example, `Diff.annotations`, `Endpoint.params[].in`,
  `DataModel.entities[].fields[]`).

Author the recap source against the tags and schemas that call returns. The
complete set of valid block-level tags is whatever `get-plan-blocks` lists;
any other capitalized tag at the block level is rejected on import with an
"Unknown plan block" or "did you mean" error. Lowercase HTML tags inside
`rich-text` or Markdown prose (`<div>`, `<span>`, `<code>`, `<br>`, …) are always
valid. Only capitalized component-style block tags are validated.

A few recap-specific authoring rules the registry table cannot encode:

- Every structured block requires an `id` (unique across the whole plan)
  plus the shared optional `summary` and `editable` envelope. Ordinary top-level
  Markdown prose imports as rich-text automatically; use `<RichText id="...">`
  only when prose needs explicit metadata or a preserved referenced block id.
- Every capitalized block component must be self-closing (`<Diagram ... />`) or
  explicitly closed around children (`<RichText ...>...</RichText>`). Never
  leave a bare opening tag like `<RichText ...>` in a paragraph; MDX treats it
  as unclosed JSX and import fails before the recap can render.
- Code-bearing blocks (`Code`, `AnnotatedCode`, and `Diff`) are
  whitespace-sensitive. Prefer the exact MDX form from the `get-plan-blocks`
  examples or source exporter, where multiline code is encoded as JSON string
  attributes such as `code={"const x =\n  y"}`. Static template literals are
  accepted only when they are static strings with no `${...}` interpolation.
- `Endpoint`: prose `description` is the MDX **children** (body between the
  tags), not an attribute; for a WebSocket upgrade use `method="GET"`. Each
  request or response `example` is a JSON **string** (the renderer parses it into
  the JSON explorer), so keep it a single parseable JSON value.
- `TabsBlock`: the whole `tabs` array (including nested child blocks) is 1
  JSON `tabs={[…]}` prop. No nested `<Tab>` element.
- `WireframeBlock`: its body is a single `<Screen surface ... html=… />` subtree
  (nested MDX, not a flat prop); `html` must be a single-quoted string or static
  template literal, never a dynamic `html={someVar}` expression. See
  `references/wireframe.md` for the HTML rules.
- `Diagram`: the whole payload is 1 `data={{ html?, css?, nodes?, edges?, … }}`
  attribute and requires either `html` or at least 1 node; `Mermaid` is its
  own separate block (`source` text), not a `Diagram` prop.

## Make before and after the headline

The recap's main focus is the before-and-after comparison. For document-body
2 primitives cover document-body comparisons:

- **`columns`**: the side-by-side container, for **structured** comparisons.
  Use 2 columns labeled `Before` and `After`, each holding a block (commonly a
  `data-model`, `api-endpoint`, or `rich-text`), so the reviewer reads the old
  shape directly against the new shape. This is the right primitive for
  "the schema went from X to Y" or "the endpoint contract changed like this."
  Do not use `columns` simply to compact or group a list of API endpoints.
- **`diff`**: for **code**. It renders the literal removed and added lines. Use
  it for the actual hunks. Use split mode by default for recap code review;
  reserve `mode: "unified"` for genuinely narrow standalone hunks where
  side-by-side would hide the code. Key-file diff groups should use horizontal
  tabs so split diffs get the full document width.

For UI diffs, wireframes are the visual comparison primitive. Use before-and-after
wireframes when the comparison clarifies the change; use after-only or a state
sequence when that better matches the change. The visual headline must show
exact placement, realistic chrome, and adequate padding before any abstract
explanation. Do not stop at the first visible affordance when the diff adds a
flow; show the entry point, the opened surface, and the resulting state or page
so the reviewer can trace the actual user path. `references/wireframe.md` owns
the before-and-after layout choice.
The `columns` renderer keeps narrow surfaces side by side and automatically stacks wide
`desktop` and `browser` frames vertically; never hand-build a side-by-side
wireframe layout in `custom-html`. For document-body
comparisons, no other multi-column primitive is available. `columns` and the
`diff` block are the whole comparison vocabulary. Do not hand-build side-by-side
layouts in `custom-html`, and do not stack 2 `data-model` blocks vertically
and call it a comparison when `columns` exists to put them side by side.

## Ground every block in the diff

Structured blocks are **true by construction** only if they are derived from the
actual changed lines. The `diff`, `data-model`, `api-endpoint`, and `file-tree`
blocks must be built mechanically from the real diff: real paths, real fields,
real methods and paths, and real before-and-after text. Never infer, round, or
invent them. The model writes only the prose: the "why", the narrative, and the
risk assessment. A
confidently wrong recap is dangerous in a review context, because a reviewer who
trusts the summary may skip the very line the summary got wrong. When the diff
does not contain a fact, leave it out rather than guess; mark anything the model
inferred (not extracted) as inferred in prose.

## Security

- **Gate visibility.** Recaps of a private repository require organization or login access. Set the
  plan's visibility to the owning organization or login; never make it public by default. A recap can
  expose unreleased schema, internal endpoints, and architecture; treat it like
  the source it summarizes. Any PR comment or handoff that links to the recap
  must say that private-repository recaps require signing in with access to the owning
  organization if the link does not load.
- **Never transcribe secrets.** A diff can contain API keys, tokens, webhook
  URLs, signing secrets, `.env` values, or credential-looking literals. Do not
  copy any of these into a `diff`, `file-tree` snippet, `api-endpoint`, or prose
  block. Redact them (`sk-•••`, `<redacted>`). This mirrors the repository's
  hardcoded-secret rule: clearly fake placeholders only, never the real value,
  in any block, caption, or note.

## Close the bidirectional loop

In hosted mode, because a recap is a real, editable plan, the same review loop
as forward plans applies: a reviewer can annotate any block, and the coding
agent reads `get-plan-feedback` to drive fixes back into the code: annotation →
agent → diff, the same close-the-loop flow forward plans use. After a reviewer
annotates a block, call `get-plan-feedback` to read the structured feedback,
then either update the recap with `create-visual-recap` (passing the existing
`planId` to replace it in place) or apply targeted changes with
`update-visual-plan`. Feedback can update both the code and the recap. In local-files privacy mode,
do not call those hosted tools; read review notes from chat or local files, edit
`<plan-dir>/*.mdx` directly, and rerun `plan local check`, `serve`, or `verify`
for `<plan-dir>`. The GitHub Action creates an initial recap for each PR, but it
does not rerun automatically when new review feedback is posted in GitHub. That
automatic rerun remains a follow-up.

## Related skills

- **visual-plan**: the canonical command and the source of the shared wireframe, canvas, and document-quality references; a recap follows the same block discipline
  in reverse.
- **comment anchors**: recap comments use the same anchor rules as forward
  plans; see "Interpreting comment anchors" in the visual-plan skill for
  coordinate frames, wireframe node ids, text-quote resolution, detached
  threads, routing through `resolutionTarget`, and 2-axis consumed and resolved state.
- **security**: data scoping, secret handling, and the hardcoded-secret rule the
  recap's redaction and visibility gating mirror.
- **sharing**: organization and login gated visibility for the plan that holds the recap.
