const MAX_FIELD_LENGTH = 2000;

/**
 * Neutralizes untrusted event-field text before it is embedded in an LLM prompt.
 *  - drops ASCII control characters,
 *  - strips angle/curly brackets so content cannot forge our `<event_…>` salt
 *    delimiters or look like instruction markup,
 *  - collapses whitespace and truncates, to bound prompt size.
 *
 * This is the first layer of injection defense; salt-prompting (in llmService)
 * is the second. Returns "" for null/undefined.
 */
export function sanitizeForPrompt(input: unknown): string {
  if (input === null || input === undefined) return "";
  const withoutControlChars = Array.from(String(input))
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return code >= 32 && code !== 127; // strip ASCII control chars
    })
    .join("");
  return withoutControlChars
    .replace(/[<>{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}
