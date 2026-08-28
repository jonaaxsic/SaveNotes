import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

export default function SettingsScreen() {
  const { theme } = useAppTheme();
  const background = Colors[theme].background;
  const textColor = Colors[theme].text;
  const borderColor = Colors[theme].border;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]} edges={["top"]}>
      <View style={[styles.container, { backgroundColor: background }]}>
        <Text style={[styles.title, { color: textColor }]}>Ajustes</Text>
        <Text style={[styles.sub, { color: theme === "dark" ? "#999" : "#666" }]}>Configuración de la app</Text>

        <View style={[styles.card, { borderColor, backgroundColor: theme === "dark" ? "#111" : "#fff" }]}>
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={20} color={textColor} />
            <Text style={[styles.rowText, { color: textColor }]}>Notificaciones</Text>
            <Ionicons name="chevron-forward" size={18} color="#999" style={styles.chevron} />
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.row}>
            <Ionicons name="language-outline" size={20} color={textColor} />
            <Text style={[styles.rowText, { color: textColor }]}>Idioma</Text>
            <Text style={styles.rowValue}>Español</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: borderColor }]} />
          <View style={styles.row}>
            <Ionicons name="information-circle-outline" size={20} color={textColor} />
            <Text style={[styles.rowText, { color: textColor }]}>Acerca de</Text>
            <Text style={styles.rowValue}>SaveNotes 1.0.0</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 4 },
  card: { marginTop: 20, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 },
  rowText: { fontSize: 15, fontWeight: "500", flex: 1 },
  rowValue: { fontSize: 13, color: "#999" },
  chevron: { marginLeft: "auto" },
  divider: { height: 1, opacity: 0.5 },
});
