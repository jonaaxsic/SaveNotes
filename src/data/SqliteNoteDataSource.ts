import * as SQLite from "expo-sqlite";
import { Note, NoteCategory } from "@/types/note";
import { NoteRepository } from "./NoteRepository";

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("savenotes.db");
  return db;
}

export class SqliteNoteDataSource implements NoteRepository {
  async init(): Promise<void> {
    const database = await getDb();
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        transcript TEXT NOT NULL,
        audioUri TEXT,
        category TEXT NOT NULL,
        duration INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_notes_createdAt ON notes(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
    `);
    // Fase 4 — columnas diagnóstico (migración idempotente)
    try { await database.execAsync(`ALTER TABLE notes ADD COLUMN audioSize INTEGER`); } catch {}
    try { await database.execAsync(`ALTER TABLE notes ADD COLUMN transcriptionEngine TEXT`); } catch {}
    try { await database.execAsync(`ALTER TABLE notes ADD COLUMN transcriptionError TEXT`); } catch {}

    // rev4: sin seed harcodeado — COUNT=0 → vacío hasta grabar real
  }

  async getAll(): Promise<Note[]> {
    const database = await getDb();
    const rows = await database.getAllAsync<Note>("SELECT * FROM notes ORDER BY datetime(createdAt) DESC LIMIT 500");
    return rows;
  }

  async search(query: string): Promise<Note[]> {
    const database = await getDb();
    const like = `%${query.toLowerCase()}%`;
    const rows = await database.getAllAsync<Note>(
      "SELECT * FROM notes WHERE lower(title) LIKE ? OR lower(transcript) LIKE ? ORDER BY datetime(createdAt) DESC LIMIT 200",
      [like, like]
    );
    return rows;
  }

  async filterByCategory(category: NoteCategory | "All"): Promise<Note[]> {
    if (category === "All") return this.getAll();
    const database = await getDb();
    const rows = await database.getAllAsync<Note>(
      "SELECT * FROM notes WHERE category = ? ORDER BY datetime(createdAt) DESC LIMIT 500",
      [category]
    );
    return rows;
  }

  async create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
    const database = await getDb();
    const now = new Date().toISOString();
    const id = Date.now().toString();
    const newNote: Note = { ...note, id, createdAt: now, updatedAt: now };
    await database.runAsync(
      "INSERT INTO notes (id, title, transcript, audioUri, category, duration, createdAt, updatedAt, audioSize, transcriptionEngine, transcriptionError) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [newNote.id, newNote.title, newNote.transcript, newNote.audioUri, newNote.category, newNote.duration, newNote.createdAt, newNote.updatedAt, (newNote as any).audioSize ?? null, (newNote as any).transcriptionEngine ?? null, (newNote as any).transcriptionError ?? null]
    );
    return newNote;
  }

  async update(id: string, data: Partial<Pick<Note, "title" | "transcript" | "category" | "audioSize" | "transcriptionEngine" | "transcriptionError">>): Promise<void> {
    const database = await getDb();
    const sets: string[] = [];
    const values: any[] = [];
    if (data.title !== undefined) { sets.push("title = ?"); values.push(data.title); }
    if (data.transcript !== undefined) { sets.push("transcript = ?"); values.push(data.transcript); }
    if (data.category !== undefined) { sets.push("category = ?"); values.push(data.category); }
    if ((data as any).audioSize !== undefined) { sets.push("audioSize = ?"); values.push((data as any).audioSize); }
    if ((data as any).transcriptionEngine !== undefined) { sets.push("transcriptionEngine = ?"); values.push((data as any).transcriptionEngine); }
    if ((data as any).transcriptionError !== undefined) { sets.push("transcriptionError = ?"); values.push((data as any).transcriptionError); }
    if (sets.length === 0) return;
    sets.push("updatedAt = ?");
    values.push(new Date().toISOString());
    values.push(id);
    await database.runAsync(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`, values);
  }

  async delete(id: string): Promise<void> {
    const database = await getDb();
    await database.runAsync("DELETE FROM notes WHERE id = ?", [id]);
  }

  async clear(): Promise<void> {
    const database = await getDb();
    await database.execAsync("DELETE FROM notes");
  }
}

export const noteRepository = new SqliteNoteDataSource();
