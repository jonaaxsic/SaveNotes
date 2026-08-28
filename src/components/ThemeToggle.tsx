import { TouchableOpacity, StyleSheet } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import Colors from "@/constants/Colors";
import { useAppTheme } from "@/context/ThemeContext";

function SunIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="5" stroke={color} strokeWidth="2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 12 + 7 * Math.cos(rad);
        const y1 = 12 + 7 * Math.sin(rad);
        const x2 = 12 + 10 * Math.cos(rad);
        const y2 = 12 + 10 * Math.sin(rad);
        return <Line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round" />;
      })}
    </Svg>
  );
}

function MoonIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ThemeToggle({ style }: { style?: any }) {
  const { isDark, toggle, theme } = useAppTheme();
  const c = Colors[theme];
  const background = c.background;
  const borderColor = c.border;
  const iconColor = c.text;

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: background, borderColor }, style]}
      activeOpacity={0.7}
      onPress={toggle}
      accessibilityLabel="Cambiar tema"
    >
      {isDark ? <MoonIcon color={iconColor} /> : <SunIcon color={iconColor} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
