import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LiveFeedService } from '../../services/LiveFeedService';
import { TeamService } from '../../services/TeamService';
import { GameState, Team } from '../../services/types';

export default function LiveFeedScreen() {
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [activeGame, setActiveGame] = useState<GameState | null>(null);

    useEffect(() => {
        if (!teamId) return;

        let unsubGame: (() => void) | undefined;

        // Fetch team details for names & its tracked active game
        const unsubTeam = TeamService.subscribeToTeam(teamId, (t) => {
            setTeam(t);

            // Once the team loads and has an active game, hook the live feed to exactly that ID
            if (t?.activeGameId) {
                if (unsubGame) unsubGame(); // clear old sub if exists
                unsubGame = LiveFeedService.subscribeToActiveGame(t.activeGameId, (game) => {
                    setActiveGame(game);
                });
            } else {
                setActiveGame(null);
                if (unsubGame) unsubGame();
            }
        });

        return () => {
            unsubTeam();
            if (unsubGame) unsubGame();
        };
    }, [teamId]);

    const formatEventMessage = (event: any) => {
        const playerName = team?.players?.[event.playerId]?.name || 'Unknown Player';
        const assistName = team?.players?.[event.assistantId]?.name;
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'G': return `${time} - 🥏 GOAL! ${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`;
            case 'D': return `${time} - 🛑 DEFENSE BLOCK by ${playerName}.`;
            case 'T': return `${time} - 🔄 TURNOVER (Throwaway) by ${playerName}.`;
            case 'Drop': return `${time} - 🔄 TURNOVER (Drop) by ${playerName}.`;
            case 'Callahan': return `${time} - 🔥 CALLAHAN! ${playerName} intercepted for a goal!`;
            case 'Undo': return `${time} - ⏪ Last action undone.`;
            default: return `${time} - Game Event: ${event.type}`;
        }
    };

    if (team) {
        return (
            <View style={styles.container}>
                <View style={styles.headerCard}>
                    <Text style={styles.teamName}>Watching: {team.name}</Text>

                    {activeGame ? (
                        <View style={styles.scoreboard}>
                            <View style={styles.scoreBox}>
                                <Text style={styles.scoreLabel}>US</Text>
                                <Text style={styles.scoreNumber}>{activeGame.score1}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.scoreBox}>
                                <Text style={styles.scoreLabel}>THEM</Text>
                                <Text style={styles.scoreNumber}>{activeGame.score2}</Text>
                            </View>
                        </View>
                    ) : (
                        <Text style={styles.noGameText}>Waiting for game to start...</Text>
                    )}
                </View>

                {activeGame && (
                    <View style={styles.feedContainer}>
                        <Text style={styles.sectionTitle}>🔴 Live Feed</Text>
                        <ScrollView style={styles.scrollFeed}>
                            {/* Render history in reverse order so newest is at the top */}
                            {[...(activeGame.history || [])].reverse().map((event, index) => (
                                <View key={event.id || index} style={styles.feedItem}>
                                    <View style={styles.feedDot} />
                                    <Text style={styles.feedText}>{formatEventMessage(event)}</Text>
                                </View>
                            ))}
                            {(!activeGame.history || activeGame.history.length === 0) && (
                                <Text style={styles.emptyFeed}>No events recorded yet.</Text>
                            )}
                        </ScrollView>
                    </View>
                )}
            </View>
        );
    }

    return (
        <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={{ marginTop: 10, color: '#666' }}>Loading Live Feed...</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
    centerContainer: { flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center', padding: 20 },

    welcomeTitle: { fontSize: 28, fontWeight: 'bold', color: '#111', marginBottom: 10 },
    subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
    formContainer: { width: '100%', maxWidth: 350 },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, color: '#333', marginBottom: 20 },
    primaryButton: { backgroundColor: '#ff4444', padding: 15, borderRadius: 10, alignItems: 'center', width: '100%', shadowColor: '#ff4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5 },
    primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4, marginBottom: 20, alignItems: 'center' },
    teamName: { fontSize: 18, fontWeight: '600', color: '#555', marginBottom: 15 },

    scoreboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 30, width: '100%' },
    scoreBox: { alignItems: 'center', flex: 1 },
    scoreLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginBottom: 5 },
    scoreNumber: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
    divider: { width: 2, height: 40, backgroundColor: '#333', marginHorizontal: 20 },

    noGameText: { fontSize: 16, color: '#888', fontStyle: 'italic', marginTop: 10 },

    feedContainer: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 15 },
    scrollFeed: { flex: 1 },
    feedItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
    feedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#007AFF', marginTop: 6, marginRight: 10 },
    feedText: { flex: 1, fontSize: 16, color: '#333', lineHeight: 24 },
    emptyFeed: { textAlign: 'center', color: '#999', marginTop: 30, fontStyle: 'italic' }
});
