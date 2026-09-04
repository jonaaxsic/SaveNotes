/**
 * RecordingBar — pill 48-56px with solid background, NO interim transcript, NO "Escuchando…"
 *
 * Layout: [X] [waveform centered] [■] [↑]
 * - X: cancel/discard
 * - waveform: AudioWaveform with real audioLevel (dB -160..0) at 10-20fps
 * - ■: stop → processing (creates single SQLite note)
 * - ↑: send (alias to stop, per WhatsApp-style)
 * Solid background prevents cards showing behind (§3.1 opaque dock fix).
 * FlatList paddingBottom must be >= bottom dock height + safe area.
 */

import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";
import { AudioWaveform } from "./AudioWaveform";

type Props = {
  audioLevel: number;
  isProcessing?: boolean;
  onCancel: () => void;
  onStop: () => void;
  onSend: () => void;
};

export function RecordingBar({ audioLevel, isProcessing = false, onCancel, onStop, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <View
      style={[
        styles.dock,
        {
          backgroundColor: c.background,
          paddingBottom: bottomPad + 12,
          borderTopColor: c.border,
        },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.shadow }]}>
        {/* X — cancel */}
        <Pressable
          hitSlop={8}
          style={[styles.iconBtn, { backgroundColor: c.muted }]}
          onPress={onCancel}
          disabled={isProcessing}
          accessibilityLabel="Cancelar grabación"
        >
          <Ionicons name="close" size={18} color={c.mutedForeground} />
        </Pressable>

        {/* Waveform centered — real metering, 40-70 samples, no Math.random */}
        <View style={styles.waveWrap} pointerEvents="none">
          {isProcessing ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <AudioWaveform audioLevel={audioLevel} barCount={60} width={150} height={28} color={c.primary} isRecording={!isProcessing} />
          )}
        </View>

        {/* ■ — stop */}
        <Pressable
          hitSlop={8}
          style={[styles.iconBtn, styles.stopBtn, { backgroundColor: c.destructive }]}
          onPress={onStop}
          disabled={isProcessing}
          accessibilityLabel="Detener grabación"
        >
          <View style={styles.stopSquare} />
        </Pressable>

        {/* ↑ — send */}
        <Pressable
          hitSlop={8}
          style={[styles.iconBtn, styles.sendBtn, { backgroundColor: c.primary }]}
          onPress={onSend}
          disabled={isProcessing}
          accessibilityLabel="Enviar grabación"
        >
          <Ionicons name="arrow-up" size={18} color={c.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 10,
    zIndex: 10,
  },
  pill: {
    height: 52, // 48-56px spec
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 8,
    // shadow for depth, but solid background already opaque
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: {
    width: 36,
    height: 36,
  },
  sendBtn: {
    width: 36,
    height: 36,
  },
  waveWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 36,
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
});
