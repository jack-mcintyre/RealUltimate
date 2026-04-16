import { Stack } from "expo-router";
import { ThemeProvider } from "./theme/ThemeContext";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="team/[id]/edit" options={{ headerShown: false }} />
        <Stack.Screen name="game/record/[teamId]" options={{ headerShown: false }} />
        <Stack.Screen name="game/watch/[teamId]" options={{ headerShown: false }} />
        <Stack.Screen name="game/history/[gameId]" options={{ headerShown: false }} />
        <Stack.Screen name="game/scheduled/[teamId]/[gameId]" options={{ headerShown: false }} />
        <Stack.Screen name="team/[teamId]/player/[playerId]" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
