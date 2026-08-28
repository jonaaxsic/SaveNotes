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
};
