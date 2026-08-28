import { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Note } from "@/types/note";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Props = {
  visible: boolean;
  note: Note | null;
  onSave: (id: string, data: { title: string; transcript: string }) => void;
  onCreate?: (title: string, transcript: string) => void;
  onClose: () => void;
};

export function EditNoteModal({ visible, note, onSave, onCreate, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];

  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (visible) {
      if (note) {
        setTitle(note.title);
        setTranscript(note.transcript);
      } else {
        setTitle("");
        setTranscript("");
      }
    }
  }, [visible, note?.id]);

  const handleSave = () => {
    if (!title.trim()) return;
    if (note) {
      onSave(note.id, { title: title.trim(), transcript: transcript.trim() });
    } else {
      onCreate?.(title.trim(), transcript.trim());
    }
    onClose();
  };

  const isEditing = !!note;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: insets.top + 12 }]}>
        {/* Header — con < volver atrás, sin duplicar X/✓ (evita repetición) */}
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: c.text }]}>{isEditing ? "Editar nota" : "Crear nota"}</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* Fields */}
        <View style={styles.fields}>
          <Text style={[styles.label, { color: c.text }]}>Título</Text>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.muted }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Título de la nota"
            placeholderTextColor={c.mutedForeground}
          />

          <Text style={[styles.label, { color: c.text }]}>Contenido</Text>
          <TextInput
            style={[styles.input, styles.textArea, { color: c.text, borderColor: c.border, backgroundColor: c.muted }]}
            value={transcript}
            onChangeText={setTranscript}
            placeholder="Escribe tu nota..."
            placeholderTextColor={c.mutedForeground}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />
        </View>

        {/* Actions — más arriba, fuera de safeArea */}
        <View style={[styles.actions, { paddingBottom: 32 + insets.bottom, marginBottom: 8 }]}>
          <Pressable style={[styles.cancelBtn, { borderColor: c.border }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: c.text }]}>Cancelar</Text>
          </Pressable>
          <Pressable style={[styles.saveBtn, { backgroundColor: c.primary }]} onPress={handleSave}>
            <Text style={[styles.saveText, { color: c.primaryForeground }]}>{isEditing ? "Guardar" : "Crear"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  fields: { flex: 1, paddingHorizontal: 16 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 160 },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontWeight: "500" },
  saveBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveText: { fontSize: 15, fontWeight: "600" },
});
