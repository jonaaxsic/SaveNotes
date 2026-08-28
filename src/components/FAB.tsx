import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = { onPress: () => void };

export function FAB({ onPress }: Props) {
  const insets = useSafeAreaInsets();
  // T06: respeta safezone inferior + tabs (60 + insets.bottom)
  const bottom = 16 + 60 + Math.max(insets.bottom, 8);
  return (
    <TouchableOpacity style={[styles.fab, { bottom }]} activeOpacity={0.85} onPress={onPress}>
      <Ionicons name="add" size={28} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    boxShadow: "0 4px 6px rgba(0,0,0,0.25)",
  },
});
