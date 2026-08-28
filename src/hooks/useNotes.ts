import { useEffect, useState, useCallback } from "react";
import { Note } from "@/types/note";
import { noteRepository } from "@/data/SqliteNoteDataSource";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await noteRepository.init();
      const data = await noteRepository.getAll();
      setNotes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando notas");
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return { notes, loading, error, refresh };
}
