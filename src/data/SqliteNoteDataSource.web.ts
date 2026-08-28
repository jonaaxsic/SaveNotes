import { Note, NoteCategory } from "@/types/note";
import { NoteRepository } from "./NoteRepository";

// Web: no SQLite (evita wa-sqlite.wasm). Memoria vacía hasta grabar — rev4 sin seed.
let inMemoryNotes: Note[] = [];

export class SqliteNoteDataSource implements NoteRepository {
  async init(): Promise<void> {
    // No-op en web
  }
  async getAll(): Promise<Note[]> {
    return [...inMemoryNotes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  async search(query: string): Promise<Note[]> {
    const q = query.toLowerCase();
    return inMemoryNotes.filter((n) => n.title.toLowerCase().includes(q) || n.transcript.toLowerCase().includes(q));
  }
  async filterByCategory(category: NoteCategory | "All"): Promise<Note[]> {
    if (category === "All") return this.getAll();
    return inMemoryNotes.filter((n) => n.category === category);
  }
  async create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
    const now = new Date().toISOString();
    const newNote: Note = { ...note, id: Date.now().toString(), createdAt: now, updatedAt: now };
    inMemoryNotes.unshift(newNote);
    return newNote;
  }
  async update(id: string, data: Partial<Pick<Note, "title" | "transcript" | "category">>): Promise<void> {
    const idx = inMemoryNotes.findIndex((n) => n.id === id);
    if (idx === -1) return;
    const now = new Date().toISOString();
    if (data.title !== undefined) inMemoryNotes[idx].title = data.title;
    if (data.transcript !== undefined) inMemoryNotes[idx].transcript = data.transcript;
    if (data.category !== undefined) inMemoryNotes[idx].category = data.category;
    inMemoryNotes[idx].updatedAt = now;
  }

  async delete(id: string): Promise<void> {
    inMemoryNotes = inMemoryNotes.filter((n) => n.id !== id);
  }

  async clear(): Promise<void> {
    inMemoryNotes = [];
  }
}

export const noteRepository = new SqliteNoteDataSource();
