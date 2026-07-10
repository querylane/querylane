import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  BrowserFrame,
  Chip,
  GridBackground,
  KenBurns,
  LogoMark,
  SceneFade,
  SceneTitle,
} from "./components";
import { fonts, theme } from "./theme";

const DEMO_HOST = "demo.querylane.net";

// --- Intro ---

export function IntroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const titleIn = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const tagIn = spring({ frame: frame - 26, fps, config: { damping: 200 } });
  return (
    <SceneFade>
      <GridBackground />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.sans,
          gap: 36,
        }}
      >
        <div
          style={{
            transform: `scale(${logoIn})`,
            filter: `drop-shadow(0 24px 80px rgba(96,165,250,0.25))`,
          }}
        >
          <LogoMark size={148} />
        </div>
        <div
          style={{
            color: theme.text,
            fontSize: 92,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            opacity: titleIn,
            transform: `translateY(${interpolate(titleIn, [0, 1], [30, 0])}px)`,
          }}
        >
          Querylane
        </div>
        <div
          style={{
            color: theme.textMuted,
            fontSize: 36,
            fontWeight: 500,
            opacity: tagIn,
            transform: `translateY(${interpolate(tagIn, [0, 1], [24, 0])}px)`,
          }}
        >
          One console for every PostgreSQL server you run
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}

// --- Reusable screenshot / clip scene ---

interface FeatureChip {
  label: string;
}

export function ScreenshotScene({
  kicker,
  title,
  image,
  urlPath,
  chips,
  originY = 20,
  zoomTo = 1.07,
}: {
  kicker: string;
  title: string;
  image: string;
  urlPath: string;
  chips: FeatureChip[];
  originY?: number;
  zoomTo?: number;
}) {
  return (
    <SceneFade>
      <GridBackground />
      <SceneTitle kicker={kicker} title={title} />
      <BrowserFrame
        url={`${DEMO_HOST}${urlPath}`}
        style={{ position: "absolute", left: 96, right: 96, top: 216, height: 820 }}
      >
        <KenBurns to={zoomTo} originY={originY}>
          <Img
            src={staticFile(image)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "top",
            }}
          />
        </KenBurns>
      </BrowserFrame>
      <ChipRow chips={chips} />
    </SceneFade>
  );
}

export function ClipScene({
  kicker,
  title,
  clip,
  urlPath,
  chips,
  startFrom = 0,
  cropTo = "top",
}: {
  kicker: string;
  title: string;
  clip: string;
  urlPath: string;
  chips: FeatureChip[];
  startFrom?: number;
  cropTo?: "top" | "center" | "bottom";
}) {
  return (
    <SceneFade>
      <GridBackground />
      <SceneTitle kicker={kicker} title={title} />
      <BrowserFrame
        url={`${DEMO_HOST}${urlPath}`}
        style={{ position: "absolute", left: 96, right: 96, top: 216, height: 820 }}
      >
        <OffthreadVideo
          muted
          src={staticFile(clip)}
          startFrom={startFrom}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: cropTo,
          }}
        />
      </BrowserFrame>
      <ChipRow chips={chips} />
    </SceneFade>
  );
}

function ChipRow({ chips }: { chips: FeatureChip[] }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 140,
        bottom: 96,
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        maxWidth: 1700,
      }}
    >
      {chips.map((chip, i) => (
        <Chip key={chip.label} label={chip.label} delay={20 + i * 9} />
      ))}
    </div>
  );
}

// --- Config-as-code scene with typed YAML ---

const CONFIG_LINES: Array<{ text: string; indent: number; accent?: boolean }> = [
  { text: "# ~/.querylane/config.yaml", indent: 0 },
  { text: "instances:", indent: 0, accent: true },
  { text: "- id: production", indent: 1 },
  { text: "  host: db.internal.example.com", indent: 1 },
  { text: "  ssl_mode: verify-full", indent: 1 },
  { text: "  password_env: PROD_DB_PASSWORD", indent: 1 },
  { text: "  labels: { env: production }", indent: 1 },
  { text: "- id: staging", indent: 1 },
  { text: "  dsn_env: STAGING_DATABASE_URL", indent: 1 },
];

export function ConfigScene() {
  const frame = useCurrentFrame();
  return (
    <SceneFade>
      <GridBackground />
      <SceneTitle kicker="GitOps-friendly" title="Manage instances as code" />
      <div
        style={{
          position: "absolute",
          left: 300,
          right: 300,
          top: 260,
          borderRadius: 18,
          border: `1.5px solid ${theme.border}`,
          backgroundColor: theme.bgRaised,
          boxShadow: "0 40px 120px rgba(0,0,0,0.65)",
          padding: "44px 56px",
          fontFamily: fonts.mono,
          fontSize: 30,
          lineHeight: 1.85,
        }}
      >
        {CONFIG_LINES.map((line, i) => {
          const appear = interpolate(frame, [14 + i * 8, 22 + i * 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const isComment = line.text.startsWith("#");
          return (
            <div
              key={line.text}
              style={{
                opacity: appear,
                transform: `translateX(${interpolate(appear, [0, 1], [14, 0])}px)`,
                paddingLeft: line.indent * 36,
                color: isComment
                  ? theme.textFaint
                  : line.accent
                    ? theme.accent
                    : theme.text,
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
      <ChipRow
        chips={[
          { label: "Live config hot-reload" },
          { label: "Secrets stay in your environment" },
          { label: "Passwords encrypted at rest" },
        ]}
      />
    </SceneFade>
  );
}

// --- Outro ---

export function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logoIn = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const titleIn = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const ctaIn = spring({ frame: frame - 28, fps, config: { damping: 200 } });
  return (
    <SceneFade>
      <GridBackground />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.sans,
          gap: 34,
        }}
      >
        <div style={{ transform: `scale(${logoIn})` }}>
          <LogoMark size={120} />
        </div>
        <div
          style={{
            color: theme.text,
            fontSize: 62,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            opacity: titleIn,
          }}
        >
          Open source. Self-hosted. Yours.
        </div>
        <div
          style={{
            display: "flex",
            gap: 18,
            opacity: titleIn,
            color: theme.textMuted,
            fontSize: 30,
          }}
        >
          <span>AGPL-3.0</span>
          <span style={{ color: theme.textFaint }}>·</span>
          <span>Single binary</span>
          <span style={{ color: theme.textFaint }}>·</span>
          <span>No agents</span>
        </div>
        <div
          style={{
            marginTop: 26,
            padding: "20px 44px",
            borderRadius: 14,
            backgroundColor: theme.accentDeep,
            color: "#fff",
            fontFamily: fonts.mono,
            fontSize: 34,
            fontWeight: 700,
            opacity: ctaIn,
            transform: `scale(${interpolate(ctaIn, [0, 1], [0.85, 1])})`,
            boxShadow: "0 20px 80px rgba(59,130,246,0.4)",
          }}
        >
          demo.querylane.net
        </div>
      </AbsoluteFill>
    </SceneFade>
  );
}
