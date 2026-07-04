import type { ComponentProps, CSSProperties } from "react";

import { cn } from "@/lib/utils";
import {
  QUERYLANE_LOGO_PALETTES,
  type QuerylaneLogoPalette,
  type QuerylaneLogoProps,
} from "./querylane-logo.constants";

interface QuerylaneIconRowGeometry {
  height: number;
  opacity: number;
  rx: number;
  width: number;
  x: number;
  y: number;
}

type QuerylaneLogoAnimatedProps = Omit<ComponentProps<"svg">, "children"> & {
  alt?: string;
};

const DEFAULT_SIZE = 32;
const DEFAULT_LOADING_ALT = "Loading Querylane";
const QUERYLANE_ICON_ROWS: readonly QuerylaneIconRowGeometry[] = [
  {
    height: 2.2,
    opacity: 0.35,
    rx: 1,
    width: 12,
    x: 9,
    y: 6.5,
  },
  {
    height: 2.2,
    opacity: 0.5,
    rx: 1,
    width: 14,
    x: 12,
    y: 10.5,
  },
  {
    height: 2.2,
    opacity: 1,
    rx: 1,
    width: 10,
    x: 12,
    y: 14.2,
  },
  {
    height: 2.2,
    opacity: 0.5,
    rx: 1,
    width: 15,
    x: 12,
    y: 18,
  },
  {
    height: 2.2,
    opacity: 0.35,
    rx: 1,
    width: 8,
    x: 9,
    y: 22,
  },
];
const QUERYLANE_ICON_ACTIVE_ROW_INDEX = 2;
const QUERYLANE_ICON_CHEVRON_PATH = "M4.5 13.3L8 15.2L4.5 17.1Z";
const QUERYLANE_ICON_VIEWBOX = "0 0 32 32";
const ROW_SWEEP_DURATION_SECONDS = 2.5;
const ROW_SWEEP_STEP_SECONDS =
  ROW_SWEEP_DURATION_SECONDS / QUERYLANE_ICON_ROWS.length;
const ROW_PULSE_DURATION_SECONDS = 1.4;
const CURSOR_SCAN_DURATION_SECONDS = 0.5;
const ACTIVE_ROW_OPACITY = 1;
const ACTIVE_ROW_BLINK_OPACITY = 0.58;
const CHEVRON_TRACK_X_OFFSET = -1.4;
const MIDDLE_ROW_IDLE_OPACITY = 0.5;
const CHEVRON_BLUE = "#60a5fa";

function QuerylaneLogoLines({ palette }: { palette: QuerylaneLogoPalette }) {
  return (
    <>
      {palette.bg ? (
        <rect fill={palette.bg} height="32" rx="7" width="32" />
      ) : null}
      <rect
        fill={palette.fg}
        height="4.5"
        opacity={palette.highlightOpacity}
        rx="1.5"
        width="26"
        x="3"
        y="13"
      />
      <rect
        fill={palette.fg}
        height="2.2"
        opacity="0.35"
        rx="1"
        width="12"
        x="9"
        y="6.5"
      />
      <rect
        fill={palette.fg}
        height="2.2"
        opacity="0.5"
        rx="1"
        width="14"
        x="12"
        y="10.5"
      />
      <rect fill={palette.fg} height="2.2" rx="1" width="10" x="12" y="14.2" />
      <rect
        fill={palette.fg}
        height="2.2"
        opacity="0.5"
        rx="1"
        width="15"
        x="12"
        y="18"
      />
      <rect
        fill={palette.fg}
        height="2.2"
        opacity="0.35"
        rx="1"
        width="8"
        x="9"
        y="22"
      />
      <path d={QUERYLANE_ICON_CHEVRON_PATH} fill={palette.cursor} />
    </>
  );
}

function QuerylaneLogo({
  variant = "boxed",
  label,
  title,
  size = DEFAULT_SIZE,
  width = size,
  height = size,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: QuerylaneLogoProps) {
  const accessibleName = ariaLabel ?? label;
  const titleContent = title ?? accessibleName;
  const isDecorative = !(accessibleName || ariaLabelledBy);

  return (
    <svg
      {...props}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : accessibleName}
      aria-labelledby={isDecorative ? undefined : ariaLabelledBy}
      fill="none"
      focusable="false"
      height={height}
      role={isDecorative ? undefined : "img"}
      viewBox="0 0 32 32"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!isDecorative && titleContent ? <title>{titleContent}</title> : null}
      <QuerylaneLogoLines palette={QUERYLANE_LOGO_PALETTES[variant]} />
    </svg>
  );
}

function QuerylaneLogoAnimated({
  alt = DEFAULT_LOADING_ALT,
  className,
  height = DEFAULT_SIZE,
  width = DEFAULT_SIZE,
  ...props
}: QuerylaneLogoAnimatedProps) {
  const accessibilityLabel = alt?.trim() || DEFAULT_LOADING_ALT;

  return (
    <svg
      aria-label={accessibilityLabel}
      className={cn("shrink-0", className)}
      data-testid="querylane-logo-animated"
      fill="none"
      focusable="false"
      height={height}
      role="img"
      viewBox={QUERYLANE_ICON_VIEWBOX}
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{accessibilityLabel}</title>
      <style>{`
        .querylane-logo-row-track {
          transform-box: fill-box;
          transform-origin: left center;
          animation: querylane-row-shift ${ROW_PULSE_DURATION_SECONDS}s ease-in-out infinite;
        }

        .querylane-logo-row {
          fill: currentColor;
        }

        .querylane-logo-active-row {
          fill: currentColor;
          opacity: 0;
          animation: querylane-row-sweep-cursor ${ROW_SWEEP_DURATION_SECONDS}s linear infinite;
        }

        .querylane-logo-chevron-track {
          animation: querylane-chevron-track ${ROW_SWEEP_DURATION_SECONDS}s linear infinite;
        }

        .querylane-logo-chevron {
          fill: ${CHEVRON_BLUE};
          opacity: 0.9;
          animation:
            querylane-chevron-scan ${CURSOR_SCAN_DURATION_SECONDS}s ease-in-out infinite,
            querylane-chevron-blink 0.85s steps(1, end) infinite;
        }

        @keyframes querylane-row-shift {
          0%,
          100% {
            transform: translateX(-0.35px);
          }

          50% {
            transform: translateX(0.45px);
          }
        }

        @keyframes querylane-row-sweep-cursor {
          0%,
          100% {
            opacity: 0;
          }

          4% {
            opacity: 0;
          }

          7% {
            opacity: ${ACTIVE_ROW_OPACITY};
          }

          10% {
            opacity: ${ACTIVE_ROW_BLINK_OPACITY};
          }

          13% {
            opacity: ${ACTIVE_ROW_OPACITY};
          }

          17% {
            opacity: 0;
          }
        }

        @keyframes querylane-chevron-track {
          0%,
          16% {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, -7.6px);
          }

          20%,
          36% {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, -3.6px);
          }

          40%,
          56% {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, 0px);
          }

          60%,
          76% {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, 3.8px);
          }

          80%,
          96% {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, 7.8px);
          }

          100% {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, -7.6px);
          }
        }

        @keyframes querylane-chevron-scan {
          0%,
          100% {
            transform: translateX(0px);
          }

          50% {
            transform: translateX(1.6px);
          }
        }

        @keyframes querylane-chevron-blink {
          0%,
          47% {
            opacity: 1;
          }

          48%,
          55% {
            opacity: 0.45;
          }

          56%,
          100% {
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .querylane-logo-row-track,
          .querylane-logo-active-row,
          .querylane-logo-chevron-track,
          .querylane-logo-chevron {
            animation: none !important;
          }

          .querylane-logo-active-row {
            opacity: 0;
          }

          .querylane-logo-active-row[data-row="${QUERYLANE_ICON_ACTIVE_ROW_INDEX}"] {
            opacity: ${ACTIVE_ROW_OPACITY};
          }

          .querylane-logo-chevron-track {
            transform: translate(${CHEVRON_TRACK_X_OFFSET}px, 0px);
          }

          .querylane-logo-chevron {
            opacity: 1;
            transform: translateX(0.8px);
          }
        }
      `}</style>

      {QUERYLANE_ICON_ROWS.map((row, index) => {
        const rowBaseOpacity =
          index === QUERYLANE_ICON_ACTIVE_ROW_INDEX
            ? MIDDLE_ROW_IDLE_OPACITY
            : row.opacity;
        const rowPulseStyle = {
          animationDelay: `${(index * ROW_PULSE_DURATION_SECONDS) / QUERYLANE_ICON_ROWS.length}s`,
        } satisfies CSSProperties;
        const rowSweepStyle = {
          animationDelay: `${(index * ROW_SWEEP_STEP_SECONDS).toFixed(2)}s`,
        } satisfies CSSProperties;

        return (
          <g
            className="querylane-logo-row-track"
            key={`${row.x}-${row.y}-${row.width}`}
            style={rowPulseStyle}
          >
            <rect
              className="querylane-logo-row"
              data-row={index}
              data-testid="querylane-logo-row"
              height={row.height}
              opacity={rowBaseOpacity}
              rx={row.rx}
              width={row.width}
              x={row.x}
              y={row.y}
            />
            <rect
              className="querylane-logo-active-row"
              data-row={index}
              data-testid="querylane-logo-active-row"
              height={row.height}
              rx={row.rx}
              style={rowSweepStyle}
              width={row.width}
              x={row.x}
              y={row.y}
            />
          </g>
        );
      })}

      <g className="querylane-logo-chevron-track">
        <path
          className="querylane-logo-chevron"
          d={QUERYLANE_ICON_CHEVRON_PATH}
          data-testid="querylane-logo-chevron"
        />
      </g>
    </svg>
  );
}

export { QuerylaneLogo, QuerylaneLogoAnimated };
