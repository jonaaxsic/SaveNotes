import { Note, NoteCategory } from "@/types/note";

export interface NoteRepository {
  init(): Promise<void>;
  getAll(): Promise<Note[]>;
  search(query: string): Promise<Note[]>;
  filterByCategory(category: NoteCategory | "All"): Promise<Note[]>;
  create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note>;
  update(id: string, data: Partial<Pick<Note, "title" | "transcript" | "category" | "audioSize" | "transcriptionEngine" | "transcriptionError">>): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}
