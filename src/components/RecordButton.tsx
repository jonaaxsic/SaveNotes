import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Props = {
  isRecording: boolean;
  onPress: () => void;
};

export function RecordButton({ isRecording, onPress }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];
  const bottomPad = Math.max(insets.bottom, 12);
  const bottom = 56 + bottomPad + 16;
  const [hovered, setHovered] = useState(false);

  const bg = isRecording ? c.destructive : hovered ? c.hover : c.card;
  const borderColor = isRecording ? c.destructive : c.cardBorder;

  return (
    <View style={[styles.wrapper, { bottom, pointerEvents: "box-none" as any }]}>
      <Pressable
        style={[styles.micBtn, { backgroundColor: bg, borderColor }]}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
      >
        <Ionicons name={isRecording ? "stop" : "mic"} size={28} color={isRecording ? "#fff" : c.text} />
      </Pressable>
      <Text style={[styles.title, { color: c.text }]}>{isRecording ? "Grabando..." : "Grabar nueva nota"}</Text>
      <Text style={[styles.sub, { color: c.mutedForeground }]}>{isRecording ? "Toca para detener" : "Presiona para empezar"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  micBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
  },
  title: { fontSize: 14, fontWeight: "600", marginTop: 10 },
  sub: { fontSize: 12, marginTop: 2 },
});
