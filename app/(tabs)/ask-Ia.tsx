import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AskIAScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <Text style={styles.title}>Ask AI</Text>
        <Text style={styles.sub}>Responde usando primero tus notas (spec 002).</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: "700", color: "#000" },
  sub: { fontSize: 13, color: "#666", marginTop: 8 },
});
