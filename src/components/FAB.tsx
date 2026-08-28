import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

type Props = { onPress: () => void };

export function FAB({ onPress }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const c = Colors[theme];
  // T06: respeta safezone inferior + tabs (60 + insets.bottom)
  const bottom = 16 + 60 + Math.max(insets.bottom, 8);
  return (
    <TouchableOpacity
      style={[styles.fab, { bottom, backgroundColor: c.primary, boxShadow: `0 4px 6px ${c.shadowStrong}` }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <Ionicons name="add" size={28} color={c.primaryForeground} />
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
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
});
