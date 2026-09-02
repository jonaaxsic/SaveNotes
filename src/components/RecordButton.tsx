import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Props = {
  isRecording: boolean;
  isLocked?: boolean;
  recordingTime?: number;
  // New API (Section 3): single toggle
  onPress?: () => void;
  // Legacy compat (will be removed)
  onPressIn?: () => void;
  onPressOut?: () => void;
  onLock?: () => void;
  onCancel?: () => void;
  onSend?: () => void;
  onTogglePause?: () => void;
  isPaused?: boolean;
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordButton({
  isRecording,
  recordingTime = 0,
  onPress,
  onPressIn,
  onPressOut,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const bottomPad = Math.max(insets.bottom, 8);
  const bottom = bottomPad + 4;
  const [hovered, setHovered] = useState(false);

  // Resolve press handler: prefer onPress (toggle), fallback to legacy onPressIn/Out behavior
  const handlePress = () => {
    if (onPress) onPress();
    else if (onPressIn && !isRecording) onPressIn();
    else if (onPressOut && isRecording) onPressOut();
  };

  // Recording state: toggle to stop, with cancel option
  if (isRecording) {
    return (
      <View style={[styles.wrapperFull, { bottom, pointerEvents: "box-none" as any }]}>
        <View style={[styles.separatorFull, { backgroundColor: c.border }]} />
        <Text style={[styles.timer, { color: c.text }]}>{formatTime(recordingTime)}</Text>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", justifyContent: "center" }}>
          <Pressable
            hitSlop={8}
            style={[styles.cancelBtn, { borderColor: c.border, backgroundColor: c.card }]}
            onPress={onCancel}
          >
            <Ionicons name="trash-outline" size={18} color={c.destructive} />
          </Pressable>
          <Pressable
            style={[
              styles.cardBtn,
              {
                backgroundColor: c.destructive,
                borderColor: c.destructive,
                width: "70%",
                maxWidth: 300,
                boxShadow: `0 2px 8px ${c.shadow}`,
              },
            ]}
            onPress={handlePress}
          >
            <Ionicons name="stop" size={20} color={c.primaryForeground} />
            <Text style={[styles.cardText, { color: c.primaryForeground }]}>Grabando — toca para detener</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Idle: tap to start
  return (
    <View style={[styles.wrapperFull, { bottom, pointerEvents: "box-none" as any }]}>
      <View style={[styles.separatorFull, { backgroundColor: c.border }]} />
      <Pressable
        style={[
          styles.cardBtn,
          {
            backgroundColor: c.primary,
            borderColor: c.primary,
            width: "88%",
            maxWidth: 340,
            alignSelf: "center",
            boxShadow: `0 2px 8px ${c.shadow}`,
          },
          hovered && { backgroundColor: c.secondary },
        ]}
        onPress={handlePress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
      >
        <Ionicons name="mic" size={20} color={c.primaryForeground} />
        <Text style={[styles.cardText, { color: c.primaryForeground }]}>Grabar nueva nota</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapperFull: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  separatorFull: {
    height: 1,
    width: "100%",
    marginBottom: 12,
    opacity: 1,
  },
  cardBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    elevation: 3,
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { fontSize: 13, fontWeight: "600" },
  timer: { fontSize: 14, fontWeight: "700", marginBottom: 8, fontVariant: ["tabular-nums"] as any },
});
