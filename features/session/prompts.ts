const INTERNAL_PROMPT_MARKERS = [
  "Strict localized edit constraint:",
  "Preserve all unmasked / opaque-mask regions exactly"
];

export function sanitizeHistoryPrompt(prompt?: string | null): string {
  if (!prompt) return "";

  const markerIndex = INTERNAL_PROMPT_MARKERS
    .map((marker) => prompt.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return (markerIndex === undefined ? prompt : prompt.slice(0, markerIndex)).trim();
}
