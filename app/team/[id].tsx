import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { GameService } from '../services/GameService';
import { TeamService } from '../services/TeamService';
import { GameState, Team } from '../services/types';

export default function TeamDashboardScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [pastGames, setPastGames] = useState<GameState[]>([]);

    // Player Input
    const [playerName, setPlayerName] = useState('');
    const [playerNumber, setPlayerNumber] = useState('');

    useEffect(() => {
        if (!id) return;
        
        const unsubscribe = TeamService.subscribeToTeam(id, (t) => {
            setTeam(t);
        });

        // Fetch past finalized games
        const loadPastGames = async () => {
            const history = await GameService.getPastGamesForTeam(id);
            setPastGames(history);
        };
        loadPastGames();

        return unsubscribe;
    }, [id]);

    const handleAddPlayer = async () => {
        if (!team || !playerName) return;
        try {
            await TeamService.addPlayer(team.id, playerName, playerNumber);
            setPlayerName('');
            setPlayerNumber('');
        } catch (e) {
            alert("Failed to add player.");
        }
    };

    if (!team) return <View style={styles.centerContainer}><Text>Loading Team...</Text></View>;

    // Permission Check
    const isCoach = auth.currentUser?.uid === team.coachId;

    const handleDeleteTeam = () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm("Are you sure you want to permanently delete this team? This action cannot be undone.");
            if (confirmed) {
                if (auth.currentUser) {
                    TeamService.deleteTeam(team.id, auth.currentUser.uid)
                        .then(() => router.replace('/teams'))
                        .catch(() => alert("Failed to delete team."));
                }
            }
        } else {
            Alert.alert(
                "Delete Team",
                "Are you sure you want to permanently delete this team? This action cannot be undone.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete", 
                        style: "destructive", 
                        onPress: async () => {
                            try {
                                if (auth.currentUser) {
                                    await TeamService.deleteTeam(team.id, auth.currentUser.uid);
                                    router.replace('/teams');
                                }
                            } catch (e) {
                                Alert.alert("Error", "Failed to delete team.");
                            }
                        }
                    }
                ]
            );
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <View style={styles.headerCard}>
                    <Text style={styles.teamName}>{team.name}</Text>
                {isCoach ? (
                    <View style={{ alignItems: 'center' }}>
                        <View style={[styles.codeBadge, { marginBottom: 5 }]}>
                            <Text style={styles.codeText}>Coach Code: {team.accessCode}</Text>
                        </View>
                        <View style={[styles.codeBadge, { backgroundColor: '#ffe5e5' }]}>
                            <Text style={[styles.codeText, { color: '#ff4444' }]}>Spectator Code: {team.spectatorCode}</Text>
                        </View>
                    </View>
                ) : (
                    <View style={[styles.codeBadge, { backgroundColor: '#ffe5e5' }]}>
                        <Text style={[styles.codeText, { color: '#ff4444', fontSize: 14 }]}>Spectating Mode</Text>
                    </View>
                )}
            </View>

            {/* ACTION BUTTONS */}
            <View style={styles.actionRow}>
                {isCoach ? (
                    <TouchableOpacity 
                        style={[styles.primaryButton, { flex: 1, marginRight: team.activeGameId ? 10 : 0, backgroundColor: '#34C759' }]}
                        onPress={() => router.push(`/game/record/${team.id}` as any)}
                    >
                        <Ionicons name="play-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>{team.activeGameId ? 'Resume Game' : 'Record Game'}</Text>
                    </TouchableOpacity>
                ) : null}

                {team.activeGameId && (
                    <TouchableOpacity 
                        style={[styles.primaryButton, { flex: 1, backgroundColor: '#007AFF' }]}
                        onPress={() => router.push(`/game/watch/${team.id}` as any)}
                    >
                        <Ionicons name="radio" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>Watch Live</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ROSTER MANAGEMENT */}
            {isCoach && (
                <View style={styles.addPlayerContainer}>
                    <Text style={styles.sectionTitle}>Add Player</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={[styles.input, { flex: 3 }]}
                            placeholder="Full Name"
                            placeholderTextColor="#999"
                            value={playerName}
                            onChangeText={setPlayerName}
                        />
                        <TextInput
                            style={[styles.input, { flex: 1, marginLeft: 10 }]}
                            placeholder="#"
                            placeholderTextColor="#999"
                            keyboardType="numeric"
                            value={playerNumber}
                            onChangeText={setPlayerNumber}
                        />
                    </View>
                    <TouchableOpacity style={styles.secondaryButton} onPress={handleAddPlayer}>
                        <Text style={styles.secondaryButtonText}>Add to Roster</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Current Roster ({team.players ? Object.keys(team.players).length : 0})</Text>
            <ScrollView style={styles.rosterList}>
                {team.players && Object.values(team.players).map((p) => (
                    <View key={p.id} style={styles.playerCard}>
                        <View style={styles.playerInfo}>
                            <Text style={styles.playerNumber}>#{p.number || '--'}</Text>
                            <Text style={styles.playerName}>{p.name}</Text>
                        </View>
                        {isCoach && (
                            <TouchableOpacity style={styles.iconButton}>
                                <Ionicons name="trash-outline" size={20} color="#ff4444" />
                            </TouchableOpacity>
                        )}
                    </View>
                ))}
            </ScrollView>

            {/* PAST GAMES */}
            {pastGames.length > 0 && (
                <View style={{ marginTop: 30 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>Past Games</Text>
                    {pastGames.map((game) => {
                        const isTeam1 = game.team1Id === team.id;
                        const opponentName = isTeam1 ? game.team2Name || "Opponent" : team.name;
                        const ourScore = isTeam1 ? game.score1 : game.score2;
                        const theirScore = isTeam1 ? game.score2 : game.score1;
                        const dateText = game.history && game.history.length > 0 
                            ? new Date(game.history[game.history.length - 1].timestamp).toLocaleDateString()
                            : "Unknown Date";

                        return (
                            <TouchableOpacity 
                                key={game.gameId} 
                                style={[styles.playerCard, { paddingVertical: 20 }]}
                                onPress={() => router.push(`/game/history/${game.gameId}` as any)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>
                                        vs {opponentName}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                                        {dateText}
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={{ fontSize: 22, fontWeight: 'bold', color: ourScore > theirScore ? '#34C759' : '#ff3b30' }}>
                                        {ourScore} - {theirScore}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                                        Final
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            {isCoach && (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteTeam}>
                    <Ionicons name="trash-outline" size={20} color="#ff3b30" style={{ marginRight: 8 }} />
                    <Text style={styles.deleteButtonText}>Delete Team</Text>
                </TouchableOpacity>
            )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 15, alignItems: 'center' },
    teamName: { fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 10 },
    codeBadge: { backgroundColor: '#e0f0ff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
    codeText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },

    actionRow: { flexDirection: 'row', marginBottom: 20 },
    primaryButton: { flexDirection: 'row', backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#444', marginBottom: 10 },

    addPlayerContainer: { backgroundColor: '#fff', padding: 15, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, marginBottom: 10 },
    inputRow: { flexDirection: 'row', marginBottom: 15 },
    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 12, borderRadius: 8, fontSize: 16, color: '#333' },

    secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#007AFF', padding: 12, borderRadius: 8, alignItems: 'center', width: '100%' },
    secondaryButtonText: { color: '#007AFF', fontSize: 16, fontWeight: 'bold' },

    rosterList: { flex: 1 },
    playerCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1 },
    playerInfo: { flexDirection: 'row', alignItems: 'center' },
    playerNumber: { fontSize: 18, fontWeight: 'bold', color: '#007AFF', width: 40 },
    playerName: { fontSize: 18, color: '#333', marginLeft: 10 },
    iconButton: { padding: 5 },

    deleteButton: { flexDirection: 'row', backgroundColor: '#ffe5e5', padding: 15, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 30 },
    deleteButtonText: { color: '#ff3b30', fontSize: 16, fontWeight: 'bold' }
});
