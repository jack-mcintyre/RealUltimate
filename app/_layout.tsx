import Constants from "expo-constants";
import { Stack, useRouter, useRootNavigationState, useSegments } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth } from "../firebaseConfig";
import { AppConfigService } from "./services/AppConfigService";
import { AppLaunchConfig } from "./services/types";
import { ThemeProvider } from "./theme/ThemeContext";

function useProtectedRoutes() {
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    if (!navigationState?.key) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const root = segments[0];
      const isPublicRoute =
        segments.length === 0 ||
        root === "index" ||
        root === "forgot-password" ||
        root === "demo" ||
        root === "legal" ||
        (root === "game" && segments[1] === "join-observer");

      if (!user && !isPublicRoute) {
        router.replace("/");
      }
    });

    return unsubscribe;
  }, [navigationState?.key, router, segments]);
}

export default function RootLayout() {
  useProtectedRoutes();
  const [launchConfig, setLaunchConfig] = useState<AppLaunchConfig | null>(null);
  const appVersion = Constants.expoConfig?.version || "1.0.0";
  const upgradeRequired = AppConfigService.isUpgradeRequired(appVersion, launchConfig);
  const appStoreUrl = Platform.OS === "ios" ? launchConfig?.appStoreUrl : launchConfig?.playStoreUrl;

  useEffect(() => {
    return AppConfigService.subscribeToLaunchConfig(setLaunchConfig);
  }, []);

  return (
    <ThemeProvider>
      <Modal visible={!!launchConfig?.maintenanceMode || upgradeRequired} transparent animationType="fade">
        <View style={styles.gateOverlay}>
          <View style={styles.gateCard}>
            <Text style={styles.gateKicker}>{launchConfig?.maintenanceMode ? "MAINTENANCE" : "UPDATE REQUIRED"}</Text>
            <Text style={styles.gateTitle}>
              {launchConfig?.maintenanceMode ? "RealUltimate is taking a quick timeout." : "This version needs an upgrade."}
            </Text>
            <Text style={styles.gateCopy}>
              {launchConfig?.maintenanceMode
                ? launchConfig?.maintenanceMessage || "We are updating the app for launch. Please check back shortly."
                : launchConfig?.upgradeMessage || "Install the latest version to keep live scores, tournaments, and player data working correctly."}
            </Text>
            {!!appStoreUrl && !launchConfig?.maintenanceMode && (
              <TouchableOpacity style={styles.gateButton} onPress={() => Linking.openURL(appStoreUrl)} activeOpacity={0.85}>
                <Text style={styles.gateButtonText}>Open Store</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="demo" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="legal/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]/edit" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]/manage" options={{ headerShown: false }} />
        <Stack.Screen name="game/observer-start" options={{ headerShown: false }} />
        <Stack.Screen name="game/join-observer" options={{ headerShown: false }} />
        <Stack.Screen name="game/record/[teamId]" options={{ headerShown: false }} />
        <Stack.Screen name="game/watch/[teamId]" options={{ headerShown: false }} />
        <Stack.Screen name="game/history/[gameId]" options={{ headerShown: false }} />
        <Stack.Screen name="game/scheduled/[teamId]/[gameId]" options={{ headerShown: false }} />
        <Stack.Screen name="team/[teamId]/player/[playerId]" options={{ headerShown: false }} />
        <Stack.Screen name="tournament/[id]" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  gateOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 22 },
  gateCard: { width: "100%", maxWidth: 420, backgroundColor: "#0B1120", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "#2563EB" },
  gateKicker: { color: "#60A5FA", fontSize: 12, fontWeight: "900", letterSpacing: 2, marginBottom: 8 },
  gateTitle: { color: "#FFFFFF", fontSize: 24, lineHeight: 29, fontWeight: "900", marginBottom: 10 },
  gateCopy: { color: "rgba(255,255,255,0.72)", fontSize: 15, lineHeight: 22 },
  gateButton: { marginTop: 18, backgroundColor: "#2563EB", borderRadius: 12, alignItems: "center", paddingVertical: 14 },
  gateButtonText: { color: "#FFFFFF", fontWeight: "800" },
});
