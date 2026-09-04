import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, Pressable, View } from "react-native";
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
  note: Note;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onShare: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetry?: () => void;
  onPress?: () => void;
  onShowInfo?: (note: Note) => void;
};

export function NoteCard({ note, isPlaying, onTogglePlay, onShare, onEdit, onDelete, onRetry, onPress, onShowInfo }: Props) {
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const hasAudio = note.audioUri !== null;
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: hovered ? c.hover : c.card, borderColor: c.border }]}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => { setHovered(false); setMenuOpen(false); }}
    >
      {/* Header: date + ⋯ */}
      <View style={styles.cardHeader}>
        <Text style={[styles.date, { color: c.mutedForeground }]}>{formatHeaderDate(note.createdAt)}</Text>

        {/* ⋯ with context menu */}
        <View style={styles.moreWrap}>
          <Pressable
            hitSlop={8}
            style={[styles.moreBtn, menuOpen && { backgroundColor: c.hover }]}
            onPress={() => setMenuOpen((v) => !v)}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={c.mutedForeground} />
          </Pressable>

          {menuOpen && (
            <View style={[styles.contextMenu, { backgroundColor: c.card, borderColor: c.border }]}>
              <Pressable
                style={[styles.menuItem, { borderBottomColor: c.cardBorder }]}
                onPress={() => { setMenuOpen(false); onEdit(); }}
              >
                <Ionicons name="create-outline" size={16} color={c.text} />
                <Text style={[styles.menuItemText, { color: c.text }]}>Editar</Text>
              </Pressable>
              <Pressable
                style={[styles.menuItem, { borderBottomColor: c.cardBorder }]}
                onPress={() => { setMenuOpen(false); onDelete(); }}
              >
                <Ionicons name="trash-outline" size={16} color={c.destructive} />
                <Text style={[styles.menuItemText, { color: c.destructive }]}>Borrar</Text>
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => { setMenuOpen(false); onShowInfo?.(note); }}
              >
                <Ionicons name="information-circle-outline" size={16} color={c.mutedForeground} />
                <Text style={[styles.menuItemText, { color: c.text }]}>Info técnica</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Title + transcript — live transcript + retry for errors */}
      <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{note.title}</Text>
      {note.transcript === "Transcribiendo…" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <Ionicons name="hourglass-outline" size={14} color={c.mutedForeground} />
          <Text style={[styles.transcript, { color: c.mutedForeground, fontStyle: "italic" as const, marginBottom: 0 }]}>
            Transcribiendo…
          </Text>
        </View>
      ) : note.transcript.includes("reintentar") || note.transcript.startsWith("No se") || note.transcript.startsWith("Permiso") || note.transcript.startsWith("Sin conexión") || note.transcript.startsWith("Servicio") ? (
        <Pressable
          onPress={onRetry}
          style={[styles.retryWrap, { backgroundColor: "rgba(229,57,53,0.08)", borderColor: "rgba(229,57,53,0.22)" }]}
        >
          <Ionicons name="refresh" size={14} color={c.destructive} />
          <Text style={[styles.retryText, { color: c.destructive }]} numberOfLines={2}>{note.transcript}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.transcript, { color: c.mutedForeground }]} numberOfLines={2}>{note.transcript}</Text>
      )}

      {/* Player row §3.1: si no hay audio, no mostrar reproductor falso */}
      {hasAudio ? (
        <View style={styles.playerRow}>
          <Pressable
            style={[styles.playBtn, { backgroundColor: c.primary }]}
            onPress={(e) => { e?.stopPropagation?.(); onTogglePlay(); }}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={14} color={c.primaryForeground} style={isPlaying ? undefined : { marginLeft: 1 }} />
          </Pressable>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: c.muted }]}>
            <View style={[styles.progressFill, { backgroundColor: c.primary, width: isPlaying ? "60%" : "0%" }]} />
          </View>

          <Text style={[styles.durationText, { color: c.text }]}>{formatDuration(note.duration)}</Text>

          {/* Right icons */}
          <View style={styles.rightIcons}>
            <Pressable hitSlop={8} onPress={(e) => { e?.stopPropagation?.(); onShare(); }}>
              <Ionicons name="paper-plane-outline" size={18} color={c.mutedForeground} />
            </Pressable>
            <Pressable hitSlop={8} onPress={(e) => { e?.stopPropagation?.(); onDelete(); }}>
              <Ionicons name="trash-outline" size={18} color={c.destructive} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.noAudioWrap, { backgroundColor: c.muted, borderColor: c.border }]}>
          <Ionicons name="alert-circle-outline" size={14} color={c.mutedForeground} />
          <Text style={[styles.noAudioText, { color: c.mutedForeground }]}>Sin audio guardado</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  date: { fontSize: 12, marginLeft: 4, flex: 1 },
  moreWrap: { position: "relative" },
  moreBtn: { padding: 6, borderRadius: 12 },
  contextMenu: {
    position: "absolute",
    top: 32,
    right: 0,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 120,
    zIndex: 100,
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    elevation: 5,
  },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  menuItemText: { fontSize: 14, fontWeight: "500" },
  title: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  transcript: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  retryWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  retryText: { fontSize: 12, fontWeight: "600", flex: 1, lineHeight: 16 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "nowrap" as any },
  playBtn: { width: 32, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", outlineStyle: "none" as any, flexShrink: 0 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, minWidth: 0 } as any,
  progressFill: { height: 4, borderRadius: 2 },
  durationText: { fontSize: 12, fontWeight: "500", flexShrink: 0 },
  rightIcons: { flexDirection: "row", alignItems: "center", gap: 14, flexShrink: 0 },
  noAudioWrap: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginTop: 2 },
  noAudioText: { fontSize: 12, fontWeight: "500", fontStyle: "italic" as const },
});
