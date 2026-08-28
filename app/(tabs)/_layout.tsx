import { View, StyleSheet, Platform, Alert } from "react-native";
import { Tabs, router } from "expo-router";
import TabBar from "@/components/TabBar";
import HomeDrawer from "@/components/HomeDrawer";
import { useAppTheme } from "@/context/ThemeContext";

export default function TabLayout() {
  const { drawerVisible, setDrawerVisible, onDrawerAction } = useAppTheme();

  const closeDrawer = () => setDrawerVisible(false);

  const handleDrawerAction = (action: string) => {
    setDrawerVisible(false);
    onDrawerAction(action as any);
  };

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" } as any,
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Notas" }} />
        <Tabs.Screen name="ask-Ia" options={{ title: "Ask AI" }} />
        <Tabs.Screen name="profile" options={{ title: "Perfil" }} />
        <Tabs.Screen name="settings" options={{ title: "Ajustes" }} />
        <Tabs.Screen name="two" options={{ href: null }} />
      </Tabs>

      <TabBar />

      <HomeDrawer
        visible={drawerVisible}
        onClose={closeDrawer}
        onOrganize={() => handleDrawerAction("organize")}
        onCalendar={() => handleDrawerAction("calendar")}
        onCreateManual={() => handleDrawerAction("createManual")}
        onSettings={() => handleDrawerAction("settings")}
        onExit={() => handleDrawerAction("exit")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
