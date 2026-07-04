import type { ComponentProps } from "react";

const QUERYLANE_LOGO_VARIANTS = [
  "boxed",
  "boxed-inverse",
  "flat",
  "flat-inverse",
] as const;

type QuerylaneLogoVariant = (typeof QUERYLANE_LOGO_VARIANTS)[number];

type QuerylaneLogoProps = Omit<ComponentProps<"svg">, "children" | "title"> & {
  /**
   * Brand-approved visual treatment.
   *
   */
  variant?: QuerylaneLogoVariant;
  /**
   * Accessible name announced by assistive technology.
   *
   * When omitted, the logo is treated as decorative and hidden from screen readers.
   */
  label?: string;
  /** Optional SVG `<title>` content. Defaults to `label` when provided. */
  title?: string;
  /** Convenience prop for square logos. Width and height props still override it. */
  size?: number;
};

interface QuerylaneLogoPalette {
  /** Background rect fill for boxed variants. */
  bg?: string;
  /** Cursor arrow accent color. */
  cursor: string;
  /** Query line fill color. */
  fg: string;
  /** Opacity for the highlight bar behind the active line. */
  highlightOpacity: number;
}

const QUERYLANE_LOGO_PALETTES: Record<
  QuerylaneLogoVariant,
  QuerylaneLogoPalette
> = {
  boxed: {
    bg: "#18181b",
    cursor: "#60a5fa",
    fg: "#fafafa",
    highlightOpacity: 0.08,
  },
  "boxed-inverse": {
    bg: "#fafafa",
    cursor: "#3b82f6",
    fg: "#18181b",
    highlightOpacity: 0.08,
  },
  flat: {
    cursor: "#3b82f6",
    fg: "currentColor",
    highlightOpacity: 0.08,
  },
  "flat-inverse": {
    cursor: "#60a5fa",
    fg: "currentColor",
    highlightOpacity: 0.08,
  },
};

export type { QuerylaneLogoPalette, QuerylaneLogoProps, QuerylaneLogoVariant };
export { QUERYLANE_LOGO_PALETTES };
