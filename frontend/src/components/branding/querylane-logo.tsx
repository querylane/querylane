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
const MIDDLE_ROW_IDLE_OPACITY = 0.5;

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

      {QUERYLANE_ICON_ROWS.map((row, index) => {
        const rowBaseOpacity =
          index === QUERYLANE_ICON_ACTIVE_ROW_INDEX
            ? MIDDLE_ROW_IDLE_OPACITY
            : row.opacity;
        const rowPulseStyle = {
          "--row-pulse-delay": `${(index * ROW_PULSE_DURATION_SECONDS) / QUERYLANE_ICON_ROWS.length}s`,
        } satisfies CSSProperties & Record<`--${string}`, string>;
        const rowSweepStyle = {
          "--row-sweep-delay": `${(index * ROW_SWEEP_STEP_SECONDS).toFixed(2)}s`,
        } satisfies CSSProperties & Record<`--${string}`, string>;

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
