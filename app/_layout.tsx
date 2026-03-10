import { Stack } from "expo-router";

export default function RootLayout() {
  return (
  <Stack>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    
    <Stack.Screen 
        name="team/[id]" 
        options={{ title: "Team Dashboard", headerBackTitle: "Teams" }} 
    />
    <Stack.Screen 
        name="game/record/[teamId]" 
        options={{ title: "Record Game", headerBackTitle: "Back" }} 
    />
    <Stack.Screen 
        name="game/watch/[teamId]" 
        options={{ title: "Live Feed", headerBackTitle: "Back" }} 
    />
  </Stack>
  );
}
