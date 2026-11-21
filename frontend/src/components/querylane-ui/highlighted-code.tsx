import { type CSSProperties, Fragment } from "react";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { PlaintextCode } from "./plaintext-code";
import { getHighlightTokens } from "./syntax-highlight-cache";
import { canHighlightSource } from "./syntax-highlight-policy";

type HighlighterOptions = Parameters<typeof createHighlighterCoreSync>[0];
interface HighlightConfig {
  highlighter?: ReturnType<typeof createHighlighterCoreSync>;
  language: "sql" | "bash";
  options: Pick<HighlighterOptions, "langs" | "themes">;
  themes: { dark: string; light: string };
}
function highlight(config: HighlightConfig, source: string) {
  return getHighlightTokens(config.language, source, () => {
    let { highlighter } = config;
    if (!highlighter) {
      highlighter = createHighlighterCoreSync({
        ...config.options,
        engine: createJavaScriptRegexEngine(),
      });
      config.highlighter = highlighter;
    }
    return highlighter.codeToTokensWithThemes(source, {
      lang: config.language,
      themes: config.themes,
      tokenizeTimeLimit: 200,
    });
  });
}

interface HighlightedCodeProps {
  config: HighlightConfig;
  source: string;
  tokenClassName: string | undefined;
}

function renderLines(
  lines: NonNullable<ReturnType<typeof getHighlightTokens>["lines"]>,
  newlines: RegExpMatchArray | null,
  tokenClassName: string | undefined
) {
  return lines.map((line, index) => (
    <Fragment key={line.key}>
      {line.tokens.map((token) => (
        <span
          className={tokenClassName}
          data-shiki-token=""
          key={token.key}
          style={
            {
              "--querylane-sql-token-dark": token.dark,
              "--querylane-bash-token-dark": token.dark,
              "--querylane-sql-token-light": token.light,
              "--querylane-bash-token-light": token.light,
            } satisfies CSSProperties &
              Record<`--querylane-${string}`, string | undefined>
          }
        >
          {token.content}
        </span>
      ))}
      {newlines?.[index]}
    </Fragment>
  ));
}

/** Share token DOM construction without importing either optional grammar. */
export function HighlightedCode({
  config,
  source,
  tokenClassName,
}: HighlightedCodeProps) {
  const { language } = config;
  if (!canHighlightSource(source)) {
    return <PlaintextCode language={language} source={source} />;
  }
  const highlighted = highlight(config, source);
  if (!highlighted.lines) {
    return (
      <PlaintextCode
        failed={highlighted.failed}
        language={language}
        source={source}
      />
    );
  }
  const newlines = source.match(/\r?\n/gu);
  return (
    <code
      className={language === "sql" ? "language-sql" : "language-bash"}
      data-language={language}
      data-syntax-highlighter="shiki"
    >
      {renderLines(highlighted.lines, newlines, tokenClassName)}
    </code>
  );
}
