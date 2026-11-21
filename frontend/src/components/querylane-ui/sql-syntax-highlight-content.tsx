"use client";
import grammar from "@shikijs/langs/sql";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light-high-contrast";
import { HighlightedCode } from "./highlighted-code";
import styles from "./sql-syntax-highlight-content.module.css";

const config = {
  language: "sql",
  options: { langs: [grammar], themes: [githubLight, githubDark] },
  themes: { dark: "github-dark", light: "github-light-high-contrast" },
} satisfies Parameters<typeof HighlightedCode>[0]["config"];

export function SqlSyntaxHighlight({ sql }: { sql: string }) {
  return (
    <HighlightedCode
      config={config}
      source={sql}
      tokenClassName={styles["token"]}
    />
  );
}
