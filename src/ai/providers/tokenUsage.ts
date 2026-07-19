/**
 * Adds input and output token counts into a total.
 *
 * Returns undefined when neither count is reported, so a missing
 * total is never misrepresented as zero usage.
 */
export function sumTokens(
  inputTokens?: number,
  outputTokens?: number,
): number | undefined {
  if (
    inputTokens === undefined &&
    outputTokens === undefined
  ) {
    return undefined;
  }

  return (
    (inputTokens ?? 0) +
    (outputTokens ?? 0)
  );
}
