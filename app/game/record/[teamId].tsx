import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { TeamService } from '../../services/TeamService';
import { Team } from '../../services/types';
import { auth } from '../../../firebaseConfig';

export default function RecorderScreen() {
    const { teamId } = useLocalSearchParams<{ teamId: string }>();

    // Our Team State
    const [ourTeam, setOurTeam] = useState<Team | null>(null);

    // Opponent Team State
    const [opponentAccessCode, setOpponentAccessCode] = useState('');
    const [opponentName, setOpponentName] = useState('');
    const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);

    // Game State
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const { gameState, recordEvent, undo, canUndo, startGame, endGame } = useGame(ourTeam?.activeGameId || undefined);

    // Game Settings
    const [gameTarget, setGameTarget] = useState<number>(15);
    const [firstPossession, setFirstPossession] = useState<'US' | 'THEM'>('US');

    const [isLoading, setIsLoading] = useState(false);

    // 1. Identify Our Team Automatically
    useEffect(() => {
        if (!teamId) return;
        const unsubscribe = TeamService.subscribeToTeam(teamId, (t) => {
            setOurTeam(t);
        });
        return unsubscribe;
    }, [teamId]); 

    // 2. Start Game vs Opponent
    const handleStartGame = async () => {
        if (!ourTeam) return;
        
        const currentUser = auth.currentUser;
        if (!currentUser) {
            Alert.alert("Error", "You must be logged in to start a game.");
            return;
        }

        setIsLoading(true);
        try {
            let oppTeamId = '';
            
            // IF GUEST TEAM NAME IS PROVIDED
            if (opponentName.trim()) {
                oppTeamId = ''; // Do NOT create a team in the database.
            } 
            // ELSE IF ACCESS CODE IS PROVIDED
            else if (opponentAccessCode.trim()) {
                const result = await TeamService.joinTeamByCode(opponentAccessCode.trim().toUpperCase(), currentUser.uid);
                if (!result) {
                    Alert.alert("Error", "Invalid Opponent Access Code.");
                    setIsLoading(false);
                    return;
                }
                oppTeamId = result.teamId;
            } else {
                Alert.alert("Error", "Please enter either an Access Code or a Guest Team Name.");
                setIsLoading(false);
                return;
            }

            // Optional: Fetch Opponent details to show their name
            if (oppTeamId) {
                TeamService.subscribeToTeam(oppTeamId, (t) => setOpponentTeam(t));
            } else {
                setOpponentTeam(null);
            }

            // Start the actual game!
            const initialPossessionId = firstPossession === 'US' ? ourTeam.id : oppTeamId;
            const oppNameForGuest = opponentName.trim() ? opponentName.trim() : '';

            // Note: oppTeamId could be empty if they used Guest Name, which is handled gracefully by useGame
            await startGame(ourTeam.id, oppTeamId, oppNameForGuest, gameTarget, initialPossessionId);

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to start game.");
        } finally {
            setIsLoading(false);
        }
    };

    if (!ourTeam) return <View style={styles.centerContainer}><Text>Loading Team...</Text></View>;

    const isGameOver = gameState.score1 >= gameState.gameTarget || gameState.score2 >= gameState.gameTarget;
    const isLocked = isGameOver || gameState.isHalftime;

    // RENDER: Step 2 & 3 - Game Management
    return (
        <ScrollView style={styles.container}>
            <View style={styles.headerCard}>
                <Text style={styles.teamName}>Managing: {ourTeam?.name}</Text>
            </View>

            {/* Step 2: Pre-Game (Enter Opponent Code) */}
            {!gameState.isGameActive ? (
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Start New Game</Text>
                    
                    <Text style={styles.label}>Opponent's Access Code</Text>
                    <TextInput
                        style={[styles.input, { textTransform: 'uppercase', textAlign: 'center', letterSpacing: 5, fontSize: 24 }]}
                        placeholder="XXXXXX"
                        maxLength={6}
                        value={opponentAccessCode}
                        onChangeText={setOpponentAccessCode}
                        autoCapitalize="characters"
                    />

                    <Text style={[styles.label, { textAlign: 'center', marginVertical: 10 }]}>-- OR --</Text>

                    <Text style={styles.label}>Guest Team Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Rival University"
                        value={opponentName}
                        onChangeText={setOpponentName}
                    />

                    <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Game Settings</Text>
                    
                    <Text style={styles.label}>Game To</Text>
                    <View style={styles.toggleRow}>
                        <TouchableOpacity 
                            style={[styles.toggleBtn, gameTarget === 13 && styles.toggleBtnActive]} 
                            onPress={() => setGameTarget(13)}
                        >
                            <Text style={[styles.toggleBtnText, gameTarget === 13 && styles.toggleBtnTextActive]}>13</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.toggleBtn, gameTarget === 15 && styles.toggleBtnActive]} 
                            onPress={() => setGameTarget(15)}
                        >
                            <Text style={[styles.toggleBtnText, gameTarget === 15 && styles.toggleBtnTextActive]}>15</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.label}>First Possession</Text>
                    <View style={styles.toggleRow}>
                        <TouchableOpacity 
                            style={[styles.toggleBtn, firstPossession === 'US' && styles.toggleBtnActive]} 
                            onPress={() => setFirstPossession('US')}
                        >
                            <Text style={[styles.toggleBtnText, firstPossession === 'US' && styles.toggleBtnTextActive]}>Us</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.toggleBtn, firstPossession === 'THEM' && styles.toggleBtnActive]} 
                            onPress={() => setFirstPossession('THEM')}
                        >
                            <Text style={[styles.toggleBtnText, firstPossession === 'THEM' && styles.toggleBtnTextActive]}>Them</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#34C759', marginTop: 20 }]} onPress={handleStartGame} disabled={isLoading}>
                        <Text style={styles.primaryButtonText}>{isLoading ? 'Starting...' : 'Start Game'}</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                /* Step 3: Active Game Tracking */
                <View style={styles.card}>
                    <View style={styles.scoreboard}>
                        <View style={styles.scoreBox}>
                            <Text style={styles.scoreLabel}>US</Text>
                            <Text style={styles.scoreNumber}>{gameState.score1}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.scoreBox}>
                            <Text style={styles.scoreLabel}>{opponentTeam ? 'THEM' : (gameState.team2Name ? gameState.team2Name : 'OPPONENT')}</Text>
                            <Text style={styles.scoreNumber}>{gameState.score2}</Text>
                        </View>
                    </View>

                    <Text style={styles.possessionText}>Possession: <Text style={{ fontWeight: 'bold', color: gameState.possession === ourTeam?.id ? '#007AFF' : '#ff4444' }}>{gameState.possession === ourTeam?.id ? 'Our Team' : 'Opponent'}</Text></Text>

                    <Text style={styles.sectionTitle}>1. Select Player</Text>
                    <View style={styles.playerGrid}>
                        {ourTeam?.players && Object.values(ourTeam.players).map(p => (
                            <TouchableOpacity
                                key={p.id}
                                style={[styles.playerButton, selectedPlayer === p.id && styles.playerButtonActive]}
                                onPress={() => setSelectedPlayer(p.id)}
                            >
                                <Text style={[styles.playerButtonText, selectedPlayer === p.id && styles.playerButtonTextActive]}>
                                    {p.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>2. Record Event</Text>
                    {isLocked ? (
                        <View style={styles.lockedContainer}>
                            <Text style={styles.lockedText}>
                                {isGameOver ? `Game Over! Target score of ${gameState.gameTarget} reached.` : 'Halftime paused.'}
                            </Text>
                        </View>
                    ) : (
                        gameState.possession === ourTeam?.id ? (
                            <View>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: selectedPlayer ? '#34C759' : '#ccc' }]} onPress={() => recordEvent('G', { playerId: selectedPlayer })} disabled={!selectedPlayer}>
                                        <Text style={styles.actionBtnText}>Goal</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: selectedPlayer ? '#ff3b30' : '#ccc' }]} onPress={() => recordEvent('T', { playerId: selectedPlayer })} disabled={!selectedPlayer}>
                                        <Text style={styles.actionBtnText}>Throwaway</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: selectedPlayer ? '#ff9500' : '#ccc' }]} onPress={() => recordEvent('Drop', { playerId: selectedPlayer })} disabled={!selectedPlayer}>
                                        <Text style={styles.actionBtnText}>Drop</Text>
                                    </TouchableOpacity>
                                    <View style={{ flex: 1 }} />
                                </View>
                            </View>
                        ) : (
                            <View>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: selectedPlayer ? '#007AFF' : '#ccc' }]} onPress={() => recordEvent('D', { playerId: selectedPlayer })} disabled={!selectedPlayer}>
                                        <Text style={styles.actionBtnText}>D-Block</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#ff3b30' }]} onPress={() => recordEvent('Opponent Score')}>
                                        <Text style={styles.actionBtnText}>Opponent Score</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.actionRow}>
                                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#FF8C00' }]} onPress={() => recordEvent('Opponent Turnover')}>
                                        <Text style={styles.actionBtnText}>Opponent Turnover</Text>
                                    </TouchableOpacity>
                                    <View style={{ flex: 1 }} />
                                </View>
                            </View>
                        )
                    )}

                    {!isGameOver && (
                        !gameState.isHalftime ? (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#5856D6', marginTop: 15, marginBottom: 15 }]} onPress={() => recordEvent('Halftime')}>
                                <Text style={styles.primaryButtonText}>Trigger Halftime</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#28A745', marginTop: 15, marginBottom: 15 }]} onPress={() => recordEvent('End Halftime')}>
                                <Text style={styles.primaryButtonText}>End Halftime</Text>
                            </TouchableOpacity>
                        )
                    )}

                    <TouchableOpacity style={styles.undoBtn} onPress={undo} disabled={!canUndo}>
                        <Ionicons name="arrow-undo-outline" size={20} color={canUndo ? "#ff4444" : "#ccc"} />
                        <Text style={[styles.undoText, !canUndo && { color: '#ccc' }]}>Undo Last Action</Text>
                    </TouchableOpacity>

                    <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recent Events</Text>
                    {(gameState.history || []).slice(-5).reverse().map((e, index) => (
                        <Text key={index} style={styles.historyText}>
                            {e.type} by {ourTeam?.players?.[e.playerId || '']?.name || 'Unknown'} @ {new Date(e.timestamp).toLocaleTimeString()}
                        </Text>
                    ))}

                    <TouchableOpacity 
                        style={[styles.primaryButton, { backgroundColor: '#ff3b30', marginTop: 30 }]} 
                        onPress={() => {
                            if (Platform.OS === 'web') {
                                const confirmed = window.confirm("Are you sure you want to finalize and end this game?");
                                if (confirmed) {
                                    endGame(gameState.gameId).then(() => {
                                        router.replace('/teams');
                                    });
                                }
                            } else {
                                Alert.alert(
                                    "End Game",
                                    "Are you sure you want to finalize and end this game?",
                                    [
                                        { text: "Cancel", style: "cancel" },
                                        { text: "End Game", style: "destructive", onPress: async () => {
                                            await endGame(gameState.gameId);
                                            router.replace('/teams');
                                        }}
                                    ]
                                );
                            }
                        }}
                    >
                        <Text style={styles.primaryButtonText}>End Game</Text>
                    </TouchableOpacity>
                </View>
            )}

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5', padding: 15 },
    centerContainer: { flex: 1, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', padding: 20 },

    welcomeTitle: { fontSize: 28, fontWeight: 'bold', color: '#111', marginBottom: 10 },
    subtitle: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 40, paddingHorizontal: 20 },
    formContainer: { width: '100%', maxWidth: 350 },

    headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 15, alignItems: 'center', marginTop: 30 },
    teamName: { fontSize: 20, fontWeight: 'bold', color: '#111' },

    card: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
    label: { fontSize: 14, color: '#666', marginBottom: 5, fontWeight: '600' },

    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, color: '#333', marginBottom: 20 },
    primaryButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
    primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    scoreboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 30, width: '100%', marginBottom: 15 },
    scoreBox: { alignItems: 'center', flex: 1 },
    scoreLabel: { color: '#888', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginBottom: 5 },
    scoreNumber: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
    divider: { width: 2, height: 40, backgroundColor: '#333', marginHorizontal: 20 },
    possessionText: { fontSize: 16, textAlign: 'center', marginBottom: 20 },

    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    playerButton: { backgroundColor: '#f0f0f0', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
    playerButtonActive: { backgroundColor: '#e0f0ff', borderColor: '#007AFF', borderWidth: 2 },
    playerButtonText: { color: '#555', fontWeight: '600' },
    playerButtonTextActive: { color: '#007AFF', fontWeight: 'bold' },

    actionRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    actionBtn: { flex: 1, padding: 15, borderRadius: 10, alignItems: 'center' },
    actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    undoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, marginTop: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 10 },
    undoText: { color: '#ff4444', fontWeight: 'bold', marginLeft: 8 },

    historyText: { fontSize: 14, color: '#555', marginBottom: 5 },

    toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    toggleBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center', backgroundColor: '#f9f9f9' },
    toggleBtnActive: { backgroundColor: '#e0f0ff', borderColor: '#007AFF', borderWidth: 2 },
    toggleBtnText: { fontSize: 16, color: '#666', fontWeight: '600' },
    toggleBtnTextActive: { color: '#007AFF', fontWeight: 'bold' },

    lockedContainer: { padding: 20, backgroundColor: '#f0f0f0', borderRadius: 10, alignItems: 'center', marginVertical: 10 },
    lockedText: { fontSize: 16, fontStyle: 'italic', color: '#666' }
});
