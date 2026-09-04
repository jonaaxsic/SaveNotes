/**
 * voiceNoteService — orchestrates Grabar → Guardar → Validar → Transcribir → Título → UNA nota SQLite
 *
 * Single SQLite create, no placeholder, no getAll()[0] guess, no transcript.startsWith error-code fallback.
 * Validates 10-recording criteria via audioStorageService before STT.
 */

import { VoiceSessionError } from "@/types/voice";
import { createNoteTitle } from "@/utils/createNoteTitle";
import { validateRecordingFile, persistRecording, getAudioFileSize } from "@/services/audio/audioStorageService";
import { transcribeAudioFile } from "@/services/speech/speechRecognitionService";
import type { NoteRepository } from "@/data/NoteRepository";
import type { Note } from "@/types/note";

type CreateArgs = {
  tempUri: string;
  durationMs: number;
};

export class VoiceNoteService {
  constructor(private readonly notes: NoteRepository) {}

  async createFromRecording(args: CreateArgs): Promise<Note> {
    const { tempUri, durationMs } = args;

    if (!tempUri) throw new VoiceSessionError("audio-not-saved", "AUDIO_URI_MISSING", "AUDIO_URI_MISSING");

    // 1. Validate source file deterministically
    await validateRecordingFile(tempUri, durationMs);

    // 2. Persist to documents/voice_*.wav and verify
    const finalUri = await persistRecording(tempUri);

    // 3. Transcribe AFTER stop (post-stop), single retry for transient only
    const { text: transcript, engine } = await transcribeAudioFile(finalUri, "es-CL");

    if (!transcript || !transcript.trim()) {
      throw new VoiceSessionError("no-speech", "No se detectó voz — intenta hablar más cerca del micrófono", "no-speech");
    }

    // 4. Title from transcript (first 6 words)
    const title = createNoteTitle(transcript);

    // 5. ONE SQLite create — no duplicate, no fallback getAll()[0]
    const durationSec = Math.max(1, Math.round(durationMs / 1000));
    let audioSize: number | null = null;
    try {
      audioSize = await getAudioFileSize(finalUri);
    } catch {
      // size is diagnostic, not critical — keep null if fails, but log
      console.warn("[VOICE] getAudioFileSize failed for", finalUri.slice(-30));
    }

    const note = await this.notes.create({
      title,
      transcript: transcript.trim(),
      audioUri: finalUri,
      category: "Ideas",
      duration: durationSec,
      audioSize,
      transcriptionEngine: engine,
      transcriptionError: null,
    } as unknown as Omit<Note, "id" | "createdAt" | "updatedAt">);

    console.info("[VOICE] note created", {
      noteId: (note as unknown as { id: string }).id,
      title,
      duration: durationSec,
      transcriptLength: transcript.length,
      audioSize,
      engine: engine ?? "(default)",
    });

    return note;
  }
}
