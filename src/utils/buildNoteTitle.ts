export function buildNoteTitle(transcript: string): string {
  const normalized = transcript.trim().replace(/\s+/g, " ");
  if (!normalized) return `Nota de voz ${new Date().toLocaleTimeString()}`;
  const words = normalized.split(" ");
  const firstWords = words.slice(0, 6).join(" ");
  const title = firstWords.charAt(0).toUpperCase() + firstWords.slice(1);
  return words.length > 6 ? `${title}…` : title;
}
