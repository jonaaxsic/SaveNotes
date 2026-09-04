import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Note } from "@/types/note";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

function formatHeaderDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) return `Hoy · ${time}`;
  if (isYesterday) return `Ayer · ${time}`;
  return `${d.toLocaleDateString()} · ${time}`;
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  visible: boolean;
  note: Note | null;
  isPlaying: boolean;
  onClose: () => void;
  onTogglePlay: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetry?: () => void;
  onShowInfo?: (note: Note) => void;
};

export function NoteDetailModal({ visible, note, isPlaying, onClose, onTogglePlay, onShare, onEdit, onDelete, onRetry, onShowInfo }: Props) {
  const { theme } = useAppTheme();
  const c = Colors[theme];

  if (!note) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop — tap fuera cierra */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.backdropFill, { backgroundColor: c.overlay }]} />
      </Pressable>

      {/* Card ampliada centrada */}
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, shadowColor: "#000" }]}>
          {/* Header con fecha y cerrar */}
          <View style={styles.header}>
            <Text style={[styles.date, { color: c.mutedForeground }]}>{formatHeaderDate(note.createdAt)}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: c.muted }]}>
              <Ionicons name="close" size={16} color={c.mutedForeground} />
            </Pressable>
          </View>

          <Text style={[styles.title, { color: c.text }]}>{note.title}</Text>

          <ScrollView style={[styles.scroll, { borderColor: c.border }]} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {note.transcript === "Transcribiendo…" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="hourglass-outline" size={14} color={c.mutedForeground} />
                <Text style={[styles.transcript, { color: c.mutedForeground, fontStyle: "italic" as const }]}>Transcribiendo…</Text>
              </View>
            ) : note.transcript.includes("reintentar") || note.transcript.startsWith("No se") || note.transcript.startsWith("Permiso") ? (
              <View>
                <Text style={[styles.transcript, { color: c.text }]}>{note.transcript}</Text>
                {note.audioUri && onRetry && (
                  <Pressable onPress={() => { onClose(); onRetry(); }} style={[styles.retryBtn, { backgroundColor: c.muted, borderColor: c.border, marginTop: 12 }]}>
                    <Ionicons name="refresh" size={14} color={c.primary} />
                    <Text style={[styles.retryText, { color: c.primary }]}>Reintentar transcripción</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={[styles.transcript, { color: c.text }]}>{note.transcript}</Text>
            )}
          </ScrollView>

          {/* Player */}
          <View style={[styles.playerRow, { borderTopColor: c.border }]}>
            <Pressable style={[styles.playBtn, { backgroundColor: c.primary }]} onPress={onTogglePlay}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={14} color={c.primaryForeground} style={isPlaying ? undefined : { marginLeft: 1 }} />
            </Pressable>
            <View style={[styles.progressTrack, { backgroundColor: c.muted }]}>
              <View style={[styles.progressFill, { backgroundColor: c.primary, width: isPlaying ? "60%" : "0%" }]} />
            </View>
            <Text style={[styles.durationText, { color: c.text }]}>{formatDuration(note.duration)}</Text>
            <View style={styles.rightIcons}>
              <Pressable hitSlop={8} onPress={onShare}>
                <Ionicons name="paper-plane-outline" size={18} color={c.mutedForeground} />
              </Pressable>
              <Pressable hitSlop={8} onPress={onDelete}>
                <Ionicons name="trash-outline" size={18} color={c.destructive} />
              </Pressable>
            </View>
          </View>

          {/* Acciones */}
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, { backgroundColor: c.muted, borderColor: c.border }]} onPress={() => { onClose(); onEdit(); }}>
              <Ionicons name="create-outline" size={16} color={c.text} />
              <Text style={[styles.actionText, { color: c.text }]}>Editar</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, { backgroundColor: c.primary }]} onPress={onShare}>
              <Ionicons name="share-outline" size={16} color={c.primaryForeground} />
              <Text style={[styles.actionText, { color: c.primaryForeground }]}>Compartir</Text>
            </Pressable>
          </View>
          {onShowInfo && (
            <Pressable onPress={() => { onClose(); setTimeout(() => onShowInfo(note), 200); }} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Ionicons name="information-circle-outline" size={14} color={c.mutedForeground} />
              <Text style={{ fontSize: 12, color: c.mutedForeground, fontWeight: "500" }}>Ver info técnica</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  backdropFill: { flex: 1 },
  centerWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 16 } as any,
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "78%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    elevation: 10,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  date: { fontSize: 12 },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 12, lineHeight: 24 },
  scroll: { maxHeight: 340, marginBottom: 14 },
  transcript: { fontSize: 15, lineHeight: 22 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginBottom: 14 },
  playBtn: { width: 36, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, minWidth: 0 } as any,
  progressFill: { height: 4, borderRadius: 2 },
  durationText: { fontSize: 12, fontWeight: "500" },
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 14 },
  actions: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  actionText: { fontSize: 14, fontWeight: "600" },
  retryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  retryText: { fontSize: 13, fontWeight: "600" },
});
