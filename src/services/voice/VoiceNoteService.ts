import { VoiceSessionError } from "@/types/voice";
import { buildNoteTitle } from "@/utils/buildNoteTitle";
import type { Note } from "@/types/note";
import type { NoteRepository } from "@/data/NoteRepository";
import type { SpeechRecognizer } from "./SpeechRecognitionService";
import * as FileSystem from "expo-file-system";

export class VoiceNoteService {
  constructor(
    private readonly recognizer: SpeechRecognizer,
    private readonly notes: NoteRepository,
  ) {}

  async start(options: { lang?: string; onInterim?: (text: string) => void } = {}): Promise<void> {
    await this.recognizer.start({ lang: options.lang ?? "es-CL", onInterim: options.onInterim });
  }

  async finish(): Promise<Note> {
    const voice = await this.recognizer.stop();

    // Validaciones ya hechas en recognizer, pero doble check
    if (!voice.audioUri) throw new VoiceSessionError("audio-not-saved");
    if (!voice.transcript.trim()) throw new VoiceSessionError("no-speech");

    // Validar archivo una vez más antes de SQLite
    try {
      const info: any = await FileSystem.getInfoAsync(voice.audioUri);
      if (!info?.exists) throw new VoiceSessionError("audio-not-saved", "Audio no existe tras stop");
    } catch (e) {
      if (e instanceof VoiceSessionError) throw e;
      throw new VoiceSessionError("audio-not-saved", "No se pudo verificar audio", e);
    }

    const title = buildNoteTitle(voice.transcript);
    const duration = Math.max(1, Math.round(voice.durationMs / 1000));

    // UNA sola escritura. Si falla, no hay nota duplicada ni fallback getAll()[0]
    let audioSize: number | null = null;
    try {
      const info: any = await FileSystem.getInfoAsync(voice.audioUri);
      if (info?.exists && typeof info.size === "number") audioSize = info.size;
    } catch {}

    const note = await this.notes.create({
      title,
      transcript: voice.transcript,
      audioUri: voice.audioUri,
      category: "Ideas",
      duration,
      audioSize,
      transcriptionEngine: "expo-speech-recognition",
      transcriptionError: null,
    } as any);

    console.info("[voice] note created", { noteId: (note as any).id, title, duration, transcriptLength: voice.transcript.length });
    return note;
  }

  async cancel(): Promise<void> {
    await this.recognizer.abort();
  }
}
