import { formatDialect, postgresql } from "sql-formatter";

/** Pretty-prints SQL with PostgreSQL rules; returns the input when parsing fails. */
function formatSqlText(text: string) {
  try {
    return {
      ok: true,
      text: formatDialect(text, {
        dataTypeCase: "upper",
        dialect: postgresql,
        functionCase: "lower",
        keywordCase: "upper",
        linesBetweenQueries: 2,
      }),
    } satisfies { ok: boolean; text: string };
  } catch {
    return { ok: false, text } satisfies { ok: boolean; text: string };
  }
}

export { formatSqlText };
