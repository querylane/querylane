"use client";
import grammar from "@shikijs/langs/bash";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";
import styles from "./bash-syntax-highlight-content.module.css";
import { HighlightedCode } from "./highlighted-code";

const config = {
  language: "bash",
  options: { langs: [grammar], themes: [githubLight, githubDark] },
  themes: { dark: "github-dark", light: "github-light" },
} satisfies Parameters<typeof HighlightedCode>[0]["config"];

export function BashSyntaxHighlight({ code }: { code: string }) {
  return (
    <HighlightedCode
      config={config}
      source={code}
      tokenClassName={styles["token"]}
    />
  );
}
