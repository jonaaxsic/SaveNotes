import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

export default function ProfileScreen() {
  const { theme } = useAppTheme();
  const c = Colors[theme];
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.background }]} edges={["top"]}>
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Perfil</Text>
        <Text style={[styles.sub, { color: c.mutedForeground }]}>Tus estadísticas y actividad reciente (spec futura).</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 8 },
});
