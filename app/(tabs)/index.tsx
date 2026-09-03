import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { EditNoteModal } from "@/components/EditNoteModal";
import { NoteCard } from "@/components/notes/NoteCard";
import { NoteDetailModal } from "@/components/notes/NoteDetailModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ModernDialog } from "@/components/ModernDialog";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";
import { NoteCategory, Note } from "@/types/note";
import { useNotes } from "@/hooks/useNotes";
import { useRecording } from "@/hooks/useRecording";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { RecordButton } from "@/components/RecordButton";
import { noteRepository } from "@/data/SqliteNoteDataSource";
import { transcriptionService } from "@/services/transcriptionService";

const FILTERS: (NoteCategory | "All")[] = ["All", "Shared", "Meeting", "Ideas"];
const FILTER_LABELS: Record<string, string> = { All: "Todas", Shared: "Compartidas", Meeting: "Reuniones", Ideas: "Ideas" };

function FilterChip({ label, isActive, theme, onPress }: { label: string; isActive: boolean; theme: string; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  const c = Colors[theme as "light" | "dark"];
  const bg = isActive ? c.primary : hovered ? c.hover : c.muted;
  const textColor = isActive ? c.primaryForeground : c.text;
  return (
    <Pressable
      style={[styles.filterChip, { backgroundColor: bg, borderColor: isActive ? c.primary : c.border }]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Text style={[styles.filterText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

function HeaderBtn({ icon, size, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; size: number; color: string; onPress?: () => void }) {
  const [hovered, setHovered] = useState(false);
  const { theme } = useAppTheme();
  const c = Colors[theme];
  return (
    <Pressable
      style={[styles.headerIconBtn, hovered && { backgroundColor: c.hover }]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const { notes, loading, refresh } = useNotes();
  const insets = useSafeAreaInsets();
  const { theme, toggleDrawer, setDrawerActionHandler } = useAppTheme();
  const {
    isRecording,
    recordingTime,
    interimTranscript,
    dialog: recordingDialog,
    dismissDialog: dismissRecordingDialog,
    toggleRecording,
    cancelRecording,
  } = useRecording(refresh);
  const { playingId, togglePlay } = useAudioPlayback();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Note | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [shareNote, setShareNote] = useState<Note | null>(null);
  const [expandedNote, setExpandedNote] = useState<Note | null>(null);

  const c = Colors[theme];
  const background = c.background;
  const textColor = c.text;

  // Register drawer actions
  useEffect(() => {
    setDrawerActionHandler((action) => {
      switch (action) {
        case "organize":
          setSortOrder((prev) => {
            const next = prev === "newest" ? "oldest" : "newest";
            return next;
          });
          break;
        case "calendar":
          setFilter("Meeting");
          break;
        case "createManual":
          setEditingNote(null);
          setEditModalVisible(true);
          break;
        case "settings":
          router.push("/(tabs)/settings");
          break;
        case "exit":
          setConfirmExit(true);
          break;
      }
    });
  }, []);

  const filtered = useMemo(() => {
    let list = [...notes];
    // Sort
    list.sort((a, b) => {
      const da = new Date(a.createdAt).getTime();
      const db = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
    // Filter by category
    if (filter !== "All") list = list.filter((n) => n.category === filter);
    // Filter by month (YYYY-MM format)
    if (monthFilter) list = list.filter((n) => n.createdAt.startsWith(monthFilter));
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((n) => n.title.toLowerCase().includes(q) || n.transcript.toLowerCase().includes(q));
    }
    return list;
  }, [notes, search, filter, sortOrder, monthFilter]);

  const handleShare = async (transcript: string, title: string) => {
    try {
      await Share.share({ message: `${title}\n\n${transcript}`, title });
    } catch {
      setShareNote({ id: "", title, transcript, audioUri: null, category: "Ideas", duration: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setEditModalVisible(true);
  };

  const handleDeleteNote = (note: Note) => {
    setConfirmDelete(note);
  };
  const doDeleteNote = async () => {
    if (!confirmDelete) return;
    try {
      await noteRepository.delete(confirmDelete.id);
      await refresh();
    } catch (e) {
      console.error("Error eliminando nota:", e);
    }
    setConfirmDelete(null);
  };

  const handleRetryTranscription = async (note: Note) => {
    if (!note.audioUri) return;
    // Optimistic: show transcribing
    try {
      await noteRepository.update(note.id, { transcript: "Transcribiendo…" });
      await refresh();
      const text = await transcriptionService.transcribeAudioFile(note.audioUri, "es-ES");
      const finalTranscript = text?.trim() ? text.trim() : "No se pudo transcribir — toca para reintentar";
      const words = finalTranscript.split(/\s+/).slice(0, 6).join(" ");
      const finalTitle = finalTranscript.startsWith("No se") ? note.title : (words.charAt(0).toUpperCase() + words.slice(1) + (finalTranscript.split(/\s+/).length > 6 ? "…" : ""));
      await noteRepository.update(note.id, { transcript: finalTranscript, title: finalTitle });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      let userMsg = "No se pudo transcribir — toca para reintentar";
      if (msg.includes("language-not-supported")) userMsg = "Idioma no soportado — descarga el paquete es-ES en Ajustes";
      else if (msg.includes("network")) userMsg = "Sin conexión — revisa tu internet";
      else if (note.audioUri.endsWith(".m4a")) userMsg = "Audio antiguo (.m4a) no compatible — regrabá la nota para usar el nuevo formato";
      try { await noteRepository.update(note.id, { transcript: userMsg }); } catch {}
    }
    await refresh();
  };

  const handleSaveEdit = async (id: string, data: { title: string; transcript: string }) => {
    await noteRepository.update(id, data);
    refresh();
  };

  const handleCreateNote = async (title: string, transcript: string) => {
    await noteRepository.create({ title, transcript, audioUri: null, category: "Ideas", duration: 0 });
    refresh();
  };

  const toggleMonthFilter = () => {
    if (monthFilter) {
      setMonthFilter(null);
    } else {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      setMonthFilter(`${yyyy}-${mm}`);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {/* Header + Search + Filters */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: background }}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <HeaderBtn icon="menu-outline" size={24} color={textColor} onPress={toggleDrawer} />
            <Text style={[styles.headerTitle, { color: textColor }]}>SaveNotes</Text>
            <View style={styles.headerRight}>
              <HeaderBtn icon="add" size={24} color={textColor} onPress={() => { setEditingNote(null); setEditModalVisible(true); }} />
              <HeaderBtn icon="calendar-outline" size={22} color={monthFilter ? c.primary : textColor} onPress={toggleMonthFilter} />
              <ThemeToggle style={[styles.headerIconBtn, { width: 32, height: 32, borderRadius: 16 }]} />
            </View>
          </View>

          <View style={[styles.searchBar, { backgroundColor: c.muted, borderColor: c.border, borderWidth: 1 }]}>
            <View style={styles.searchLeft}>
              <Ionicons name="search-outline" size={18} color={c.mutedForeground} />
              <TextInput
                placeholder="Buscar"
                placeholderTextColor={c.mutedForeground}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { color: textColor }]}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={c.mutedForeground} />
                </Pressable>
              )}
            </View>
            <AskAiButton theme={theme} />
          </View>

          <View style={styles.filtersRow}>
            {FILTERS.map((f) => (
              <FilterChip key={f} label={FILTER_LABELS[f]} isActive={filter === f} theme={theme} onPress={() => setFilter(f)} />
            ))}
          </View>
        </View>
      </SafeAreaView>

      {/* FlatList */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <Text style={[styles.loadingText, { color: c.mutedForeground }]}>Cargando notas...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: 140 + insets.bottom }]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="document-outline" size={48} color={c.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: textColor }]}>{search || filter !== "All" ? `Sin resultados para "${search || filter}"` : "Aún no tienes notas"}</Text>
              <Text style={[styles.emptySub, { color: c.mutedForeground }]}>
                {search || filter !== "All" ? "Prueba con otra búsqueda o filtro" : "Toca grabar para crear tu primera nota"}
              </Text>
              {(search || filter !== "All") && (
                <Pressable style={[styles.clearBtn, { backgroundColor: c.primary }]} onPress={() => { setSearch(""); setFilter("All"); }}>
                  <Text style={[styles.clearText, { color: c.primaryForeground }]}>Limpiar filtros</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <NoteCard
              note={item}
              isPlaying={playingId === item.id}
              onTogglePlay={() => togglePlay(item.id, item.audioUri)}
              onShare={() => handleShare(item.transcript, item.title)}
              onEdit={() => handleEditNote(item)}
              onDelete={() => handleDeleteNote(item)}
              onRetry={() => handleRetryTranscription(item)}
              onPress={() => setExpandedNote(item)}
            />
          )}
        />
      )}

      {/* RecordButton tap-to-toggle — Option A live with interim */}
      <RecordButton
        isRecording={isRecording}
        recordingTime={recordingTime}
        interimTranscript={interimTranscript}
        onPress={toggleRecording}
        onCancel={cancelRecording}
      />

      <EditNoteModal
        visible={editModalVisible}
        note={editingNote}
        onSave={handleSaveEdit}
        onClose={() => { setEditModalVisible(false); setEditingNote(null); }}
        onCreate={handleCreateNote}
      />

      {/* Modern dialogs — reemplazan Alert.alert Android 5 */}
      <ModernDialog
        visible={recordingDialog.visible}
        title={recordingDialog.title}
        message={recordingDialog.message}
        variant={recordingDialog.variant}
        confirmLabel={recordingDialog.confirmLabel}
        cancelLabel={recordingDialog.cancelLabel}
        onConfirm={() => { recordingDialog.onConfirm?.(); dismissRecordingDialog(); }}
        onCancel={dismissRecordingDialog}
        onClose={dismissRecordingDialog}
      />
      <ModernDialog
        visible={!!confirmDelete}
        title="Eliminar nota"
        message={confirmDelete ? `¿Eliminar "${confirmDelete.title}"?` : ""}
        variant="destructive"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={doDeleteNote}
        onCancel={() => setConfirmDelete(null)}
        onClose={() => setConfirmDelete(null)}
      />
      <ModernDialog
        visible={confirmExit}
        title="Cerrar sesión"
        message="¿Estás seguro?"
        variant="confirm"
        confirmLabel="Salir"
        cancelLabel="Cancelar"
        onConfirm={() => { setConfirmExit(false); router.replace("/"); }}
        onCancel={() => setConfirmExit(false)}
        onClose={() => setConfirmExit(false)}
      />
      <ModernDialog
        visible={!!shareNote}
        title={shareNote?.title ?? "Compartir"}
        message={shareNote?.transcript ?? ""}
        variant="info"
        confirmLabel="Entendido"
        onConfirm={() => setShareNote(null)}
        onClose={() => setShareNote(null)}
      />

      {/* Expanded card — ver nota completa */}
      <NoteDetailModal
        visible={!!expandedNote}
        note={expandedNote}
        isPlaying={!!expandedNote && playingId === expandedNote.id}
        onClose={() => setExpandedNote(null)}
        onTogglePlay={() => expandedNote && togglePlay(expandedNote.id, expandedNote.audioUri)}
        onShare={() => expandedNote && handleShare(expandedNote.transcript, expandedNote.title)}
        onEdit={() => { if (expandedNote) { const n = expandedNote; setExpandedNote(null); handleEditNote(n); } }}
        onDelete={() => { if (expandedNote) { const n = expandedNote; setExpandedNote(null); handleDeleteNote(n); } }}
      />
    </View>
  );
}

function AskAiButton({ theme }: { theme: string }) {
  const c = Colors[theme as "light" | "dark"];
  return (
    <Pressable
      style={styles.askAi}
      onPress={() => router.push("/(tabs)/ask-Ia")}
    >
      <Ionicons name="sparkles" size={14} color={c.primary} style={styles.askAiIcon} />
      <Text style={[styles.askAiText, { color: c.primary }]}>Ask AI</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: "700", flex: 1, marginLeft: 8 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, outlineStyle: "none" as any },
  searchBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  searchLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 2, outlineStyle: "none" as any },
  askAi: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 10, outlineStyle: "none" as any },
  askAiIcon: { marginRight: 4 },
  askAiText: { fontSize: 13, fontWeight: "600" },
  filtersRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 16, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, outlineStyle: "none" as any },
  filterText: { fontSize: 13, fontWeight: "500" },
  filterIcon: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", marginLeft: 6 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 160 },
  loadingWrap: { flex: 1, alignItems: "center", paddingTop: 40 },
  loadingText: { fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingTop: 72, paddingHorizontal: 24, paddingBottom: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginTop: 16, textAlign: "center" },
  emptySub: { fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 18 },
  clearBtn: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  clearText: { fontSize: 13, fontWeight: "600" },
});
