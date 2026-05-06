import React from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import { DarkColors } from "../theme/DesignSystem";
import { useTheme } from "../theme/ThemeContext";

/**
 * Bottom tabs stack inactive routes beneath the focused tab (lower z-index). Transparent
 * navigator scenes let that layer show through — this full-bleed backdrop sits inside each
 * tab so the active screen fully covers whatever is underneath.
 */
export default function TabSceneShell({ children }: { children: React.ReactNode }) {
    const { isDark } = useTheme();

    return (
        <View style={styles.root}>
            <ImageBackground
                source={require("../../assets/images/background.png")}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
            />
            {isDark ? (
                <View
                    pointerEvents="none"
                    style={[StyleSheet.absoluteFill, { backgroundColor: DarkColors.background }]}
                />
            ) : null}
            <View style={styles.foreground}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    foreground: { flex: 1 },
});
