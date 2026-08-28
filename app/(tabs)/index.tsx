import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { EditNoteModal } from "@/components/EditNoteModal";
import { NoteCard } from "@/components/notes/NoteCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";
import { NoteCategory, Note } from "@/types/note";
import { useNotes } from "@/hooks/useNotes";
import { useRecording } from "@/hooks/useRecording";
import { noteRepository } from "@/data/SqliteNoteDataSource";

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
  const { isRecording, toggleRecording } = useRecording(refresh);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

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
          if (Platform.OS === "web") {
            if (window.confirm("¿Cerrar sesión?")) router.replace("/");
          } else {
            Alert.alert("Cerrar sesión", "¿Estás seguro?", [
              { text: "Cancelar", style: "cancel" },
              { text: "Salir", onPress: () => router.replace("/") },
            ]);
          }
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
      Alert.alert("Compartir", `${title}\n\n${transcript}`);
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setEditModalVisible(true);
  };

  const handleDeleteNote = (note: Note) => {
    const doDelete = async () => {
      try {
        await noteRepository.delete(note.id);
        await refresh();
      } catch (e) {
        console.error("Error eliminando nota:", e);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`¿Eliminar "${note.title}"?`)) doDelete();
    } else {
      Alert.alert("Eliminar nota", `¿Eliminar "${note.title}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Eliminar", style: "destructive", onPress: doDelete },
      ]);
    }
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
          contentContainerStyle={styles.listContent}
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
              onTogglePlay={() => setPlayingId((prev) => (prev === item.id ? null : item.id))}
              onShare={() => handleShare(item.transcript, item.title)}
              onEdit={() => handleEditNote(item)}
              onDelete={() => handleDeleteNote(item)}
            />
          )}
        />
      )}

      {/* Record area — fijo arriba de tab bar */}
      <RecordArea isRecording={isRecording} onPress={toggleRecording} theme={theme} />

      <EditNoteModal
        visible={editModalVisible}
        note={editingNote}
        onSave={handleSaveEdit}
        onClose={() => { setEditModalVisible(false); setEditingNote(null); }}
        onCreate={handleCreateNote}
      />
    </View>
  );
}

function RecordArea({ isRecording, onPress, theme }: { isRecording: boolean; onPress: () => void; theme: string }) {
  const [hovered, setHovered] = useState(false);
  const c = Colors[theme as "light" | "dark"];
  const bg = isRecording ? c.destructive : hovered ? c.hover : c.card;
  const borderColor = isRecording ? c.destructive : c.cardBorder;

  return (
    <View style={[styles.recordArea, { backgroundColor: c.background, borderColor: c.border }]}>
      <Pressable
        style={[styles.recordBtn, { backgroundColor: bg, borderColor }]}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
      >
        <Ionicons name={isRecording ? "stop" : "mic"} size={28} color={isRecording ? "#fff" : c.text} />
      </Pressable>
      <Text style={[styles.recordTitle, { color: c.text }]}>{isRecording ? "Grabando..." : "Grabar nueva nota"}</Text>
      <Text style={[styles.recordSub, { color: c.mutedForeground }]}>{isRecording ? "Toca para detener" : "Presiona para empezar"}</Text>
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
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  loadingWrap: { flex: 1, alignItems: "center", paddingTop: 40 },
  loadingText: { fontSize: 13 },
  emptyWrap: { alignItems: "center", paddingTop: 72, paddingHorizontal: 24, paddingBottom: 40 },
  emptyTitle: { fontSize: 16, fontWeight: "600", marginTop: 16, textAlign: "center" },
  emptySub: { fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 18 },
  clearBtn: { marginTop: 20, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  clearText: { fontSize: 13, fontWeight: "600" },
  // Record area — fijo arriba de tabs
  recordArea: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    alignItems: "center",
  },
  recordBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
    outlineStyle: "none" as any,
  },
  recordTitle: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  recordSub: { fontSize: 12, marginTop: 2 },
});
