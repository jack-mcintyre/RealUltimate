import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { GameService } from '../../services/GameService';
import { GameState } from '../../services/types';

export default function GameHistoryScreen() {
    const { gameId } = useLocalSearchParams<{ gameId: string }>();
    const [game, setGame] = useState<GameState | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!gameId) return;
        const fetchGame = async () => {
            const data = await GameService.getGameById(gameId);
            setGame(data);
            setLoading(false);
        };
        fetchGame();
    }, [gameId]);

    const formatEventMessage = (event: any) => {
        // Since we don't have the full team objects populated in history statics,
        // we'll rely on the DB structure. If name resolution requires team fetch, let's keep it simple:
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'G': return `${time} - 🥏 GOAL!`;
            case 'D': return `${time} - 🛑 DEFENSE BLOCK`;
            case 'T': return `${time} - 🔄 TURNOVER (Throwaway)`;
            case 'Drop': return `${time} - 🔄 TURNOVER (Drop)`;
            case 'Callahan': return `${time} - 🔥 CALLAHAN!`;
            case 'Undo': return `${time} - ⏪ Action undone.`;
            case 'End Halftime': return `${time} - ⏳ Halftime Ended`;
            default: return `${time} - Game Event: ${event.type}`;
        }
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ marginTop: 10, color: '#666' }}>Loading Game History...</Text>
            </View>
        );
    }

    if (!game) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 18, color: '#888' }}>Game not found.</Text>
                <TouchableOpacity style={{ marginTop: 20 }} onPress={() => router.back()}>
                    <Text style={{ color: '#007AFF', fontSize: 16 }}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerCard}>
                <Text style={styles.teamName}>Final Score</Text>
                
                <View style={styles.scoreboard}>
                    <View style={styles.scoreBox}>
                        <Text style={styles.scoreNumber}>{game.score1}</Text>
                    </View>
                    <View style={styles.divider}>
                        <Text style={{ color: '#555', fontWeight: 'bold' }}>-</Text>
                    </View>
                    <View style={styles.scoreBox}>
                        <Text style={styles.scoreNumber}>{game.score2}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.feedContainer}>
                <Text style={styles.sectionTitle}>Game Timeline</Text>
                <ScrollView style={styles.scrollFeed}>
                    {/* Render history chronologically if preferred or reversed. Reversed is standard for feeds, chronological for history *reading* */}
                    {game.history && game.history.length > 0 ? (
                        [...game.history].map((event, index) => (
                            <View key={event.id || index} style={styles.feedItem}>
                                <View style={styles.feedDot} />
                                <Text style={styles.feedText}>{formatEventMessage(event)}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.emptyFeed}>No event history tracked.</Text>
                    )}
                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5', padding: 20 },
    centerContainer: { flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center', alignItems: 'center', padding: 20 },

    headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4, marginBottom: 20, alignItems: 'center' },
    teamName: { fontSize: 16, fontWeight: 'bold', color: '#888', letterSpacing: 1, marginBottom: 15, textTransform: 'uppercase' },

    scoreboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
    scoreBox: { alignItems: 'center', flex: 1 },
    scoreNumber: { color: '#111', fontSize: 48, fontWeight: 'bold' },
    divider: { paddingHorizontal: 20 },

    feedContainer: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 15 },
    scrollFeed: { flex: 1 },
    feedItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
    feedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#007AFF', marginTop: 6, marginRight: 10 },
    feedText: { flex: 1, fontSize: 16, color: '#333', lineHeight: 24 },
    emptyFeed: { textAlign: 'center', color: '#999', marginTop: 30, fontStyle: 'italic' }
});
