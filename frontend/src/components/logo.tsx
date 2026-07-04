"use client";

import { QuerylaneLogo } from "@/components/branding/querylane-logo";
import type {
  QuerylaneLogoProps,
  QuerylaneLogoVariant,
} from "@/components/branding/querylane-logo.constants";
import { useTheme } from "@/theme-provider";

const AUTO_VARIANTS = {
  boxed: {
    dark: "boxed-inverse",
    light: "boxed",
  },
  flat: {
    dark: "flat-inverse",
    light: "flat",
  },
} satisfies Record<string, Record<"dark" | "light", QuerylaneLogoVariant>>;

type LogoStyle = keyof typeof AUTO_VARIANTS;
type ResolvedAppearance = keyof (typeof AUTO_VARIANTS)[LogoStyle];
type Appearance = ResolvedAppearance | "auto";

type LogoProps = Omit<QuerylaneLogoProps, "variant"> & {
  appearance?: Appearance;
  logoStyle?: LogoStyle;
};

function Logo({
  appearance = "auto",
  logoStyle = "boxed",
  ...props
}: LogoProps) {
  const { resolvedTheme } = useTheme();
  const resolvedAppearance = appearance === "auto" ? resolvedTheme : appearance;

  return (
    <QuerylaneLogo
      {...props}
      variant={AUTO_VARIANTS[logoStyle][resolvedAppearance]}
    />
  );
}

export { Logo };
