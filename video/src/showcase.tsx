import { AbsoluteFill, Sequence } from "remotion";
import {
  ClipScene,
  ConfigScene,
  IntroScene,
  OutroScene,
  ScreenshotScene,
} from "./scenes";
import { theme } from "./theme";

// Scene timeline at 30 fps. Durations in frames.
const SCENES = [
  { duration: 120, element: <IntroScene /> }, // 4s
  {
    duration: 240, // 8s
    element: (
      <ScreenshotScene
        kicker="Multi-instance"
        title="Every Postgres server, one console"
        image="instance-overview.png"
        urlPath="/instances/demo-seed-neon"
        chips={[
          { label: "Live connection health" },
          { label: "Built-in metrics — no agent" },
          { label: "UI- or config-managed" },
        ]}
      />
    ),
  },
  {
    duration: 210, // 7s
    element: (
      <ScreenshotScene
        kicker="Observability"
        title="Health checks and time-series metrics"
        image="instance-health.png"
        urlPath="/instances/demo-seed-neon"
        originY={70}
        chips={[
          { label: "Connections · Replication · Autovacuum" },
          { label: "TPS, cache hit, disk I/O history" },
        ]}
      />
    ),
  },
  {
    duration: 300, // 10s — real interaction clip
    element: (
      <ClipScene
        kicker="Data Explorer"
        title="Explore every schema, table, and view"
        clip="clip-explorer.webm"
        urlPath="/instances/demo-seed-neon/databases/demo_ecommerce/explorer"
        startFrom={75}
        chips={[
          { label: "Columns · Keys · Indexes · Constraints" },
          { label: "Row-level security policies & triggers" },
        ]}
      />
    ),
  },
  {
    duration: 210, // 7s
    element: (
      <ScreenshotScene
        kicker="Live data"
        title="Browse production data, read-only"
        image="table-data-filter.png"
        urlPath="/instances/demo-seed-neon/databases/demo_ecommerce/explorer?name=customers"
        chips={[
          { label: "Server-side filters & sorting" },
          { label: "Keyset pagination" },
          { label: "Export CSV · JSON · SQL" },
        ]}
      />
    ),
  },
  {
    duration: 210, // 7s
    element: (
      <ScreenshotScene
        kicker="Query insights"
        title="Spot slow queries and hot tables"
        image="database-overview.png"
        urlPath="/instances/demo-seed-neon/databases/demo_ecommerce"
        originY={45}
        chips={[
          { label: "Sequential-scan hotspots" },
          { label: "Cache hit by table" },
          { label: "Powered by pg_stat_statements" },
        ]}
      />
    ),
  },
  {
    duration: 270, // 9s — access map interaction clip
    element: (
      <ClipScene
        kicker="Roles & access"
        title="See exactly who can touch what"
        clip="clip-access-map.webm"
        urlPath="/instances/demo-seed-neon/roles/demo_readonly?tab=access-map"
        startFrom={45}
        cropTo="bottom"
        chips={[
          { label: "Grants · Memberships · Ownership" },
          { label: "PUBLIC access & default privileges" },
        ]}
      />
    ),
  },
  { duration: 240, element: <ConfigScene /> }, // 8s
  { duration: 180, element: <OutroScene /> }, // 6s
];

export const SHOWCASE_DURATION = SCENES.reduce((sum, s) => sum + s.duration, 0);

export function Showcase() {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      {SCENES.map((scene, i) => {
        const from = offset;
        offset += scene.duration;
        return (
          <Sequence durationInFrames={scene.duration} from={from} key={i}>
            {scene.element}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
