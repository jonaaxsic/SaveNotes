export type NoteCategory = "Meeting" | "Ideas" | "Shared";

export type Note = {
  id: string;
  title: string;
  transcript: string;
  audioUri: string | null;
  category: NoteCategory;
  duration: number; // seconds
  createdAt: string; // ISO
  updatedAt: string;
  // Fase 4 — metadata técnica oculta para diagnóstico
  audioSize?: number | null; // bytes
  transcriptionEngine?: string | null; // ej. com.google.android.googlequicksearchbox
  transcriptionError?: string | null; // código error si falló
};
