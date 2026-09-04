import { buildNoteTitle } from "./buildNoteTitle";

/**
 * Alias for plan §5 — createNoteTitle is the canonical name.
 * Reuses buildNoteTitle which already implements 6-word title logic.
 */
export function createNoteTitle(transcript: string): string {
  return buildNoteTitle(transcript);
}

export { buildNoteTitle };
