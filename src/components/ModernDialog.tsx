import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Variant = "info" | "confirm" | "destructive";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: Variant;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  onClose: () => void;
};

export function ModernDialog({
  visible,
  title,
  message,
  variant = "info",
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
  onClose,
}: Props) {
  const { theme } = useAppTheme();
  const c = Colors[theme];

  const isDestructive = variant === "destructive";
  const isConfirm = variant === "confirm" || variant === "destructive";

  const confirmText = confirmLabel ?? (isDestructive ? "Eliminar" : isConfirm ? "Confirmar" : "Entendido");
  const iconName: keyof typeof Ionicons.glyphMap = isDestructive ? "warning-outline" : variant === "confirm" ? "help-circle-outline" : "information-circle-outline";
  const iconColor = isDestructive ? c.destructive : c.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.backdropFill, { backgroundColor: c.overlay }]} />
      </Pressable>
      <View style={styles.centerWrap} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, shadowColor: "#000" }]}>
          <View style={styles.header}>
            <View style={[styles.iconWrap, { backgroundColor: isDestructive ? "rgba(229,57,53,0.12)" : "rgba(14,165,166,0.12)" }]}>
              <Ionicons name={iconName} size={22} color={iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: c.text }]}>{title}</Text>
              {message ? <Text style={[styles.message, { color: c.mutedForeground }]}>{message}</Text> : null}
            </View>
          </View>

          <View style={styles.actions}>
            {isConfirm ? (
              <>
                <Pressable
                  style={[styles.btn, styles.btnGhost, { borderColor: c.border, backgroundColor: c.card }]}
                  onPress={() => {
                    onCancel?.();
                    onClose();
                  }}
                >
                  <Text style={[styles.btnGhostText, { color: c.text }]}>{cancelLabel}</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, isDestructive ? { backgroundColor: c.destructive } : { backgroundColor: c.primary }]}
                  onPress={() => {
                    onConfirm();
                    onClose();
                  }}
                >
                  <Text style={[styles.btnPrimaryText, { color: c.primaryForeground }]}>{confirmText}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={[styles.btn, { backgroundColor: c.primary, flex: 1 }]} onPress={() => { onConfirm(); onClose(); }}>
                <Text style={[styles.btnPrimaryText, { color: c.primaryForeground }]}>{confirmText}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill },
  backdropFill: { flex: 1 },
  centerWrap: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 24 } as any,
  card: { width: "100%", maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 20, elevation: 8, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  header: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", lineHeight: 22 },
  message: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  btn: { flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnGhost: { borderWidth: 1 },
  btnGhostText: { fontSize: 14, fontWeight: "600" },
  btnPrimaryText: { fontSize: 14, fontWeight: "700" },
});
