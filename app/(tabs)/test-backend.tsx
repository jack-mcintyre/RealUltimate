import React, { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { useGame } from '../hooks/useGame';
import { TeamService } from '../services/TeamService';
import { Team } from '../services/types';

export default function TestBackend() {
    const [teamName, setTeamName] = useState('Test Team');
    const [team, setTeam] = useState<Team | null>(null);
    const [playerName, setPlayerName] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

    const { gameState, recordEvent, undo, canUndo, startGame } = useGame(team ? 'test-game' : undefined);

    // Auto-create/join a test team on load or manually
    const handleCreateTeam = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert("You must be logged in to create a team.");
            return;
        }

        try {
            const teamId = await TeamService.createTeam(teamName, currentUser.uid);
            console.log("Team Created:", teamId);

            // Subscribe to updates
            TeamService.subscribeToTeam(teamId, (updatedTeam) => {
                setTeam(updatedTeam);
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddPlayer = async () => {
        if (!team || !playerName) return;
        await TeamService.addPlayer(team.id, playerName, '00');
        setPlayerName('');
    };

    const handleStartGame = async () => {
        if (!team) return;
        await startGame(team.id, 'opponent-team-id');
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Backend Test Console</Text>

            {/* Roster Section */}
            <View style={styles.section}>
                <Text style={styles.subHeader}>Team & Roster</Text>
                {!team ? (
                    <Button title="Create Test Team" onPress={handleCreateTeam} />
                ) : (
                    <>
                        <Text>Team: {team.name} (Code: {team.accessCode})</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Player Name"
                            value={playerName}
                            onChangeText={setPlayerName}
                        />
                        <Button title="Add Player" onPress={handleAddPlayer} />
                        <Text style={styles.mt}>Players:</Text>
                        {team.players && Object.values(team.players).map(p => (
                            <Text key={p.id}>- {p.name} (#{p.number})</Text>
                        ))}
                    </>
                )}
            </View>

            {/* Game Logic Section */}
            {team && (
                <View style={styles.section}>
                    <Text style={styles.subHeader}>Game Logic</Text>
                    {!gameState.isGameActive ? (
                        <Button title="Start Game" onPress={handleStartGame} />
                    ) : (
                        <>
                            <Text style={styles.score}>Score: {gameState.score1} - {gameState.score2}</Text>
                            <Text>Possession: {gameState.possession === team.id ? 'Us' : 'Them'}</Text>

                            <Text style={styles.mt}>Select Player for Event:</Text>
                            <View style={styles.row}>
                                {team.players && Object.values(team.players).map(p => (
                                    <View key={p.id} style={{ margin: 2, borderWidth: selectedPlayer === p.id ? 2 : 1, borderColor: selectedPlayer === p.id ? 'blue' : 'gray', padding: 5 }}>
                                        <Button
                                            title={p.name}
                                            onPress={() => setSelectedPlayer(p.id)}
                                            color={selectedPlayer === p.id ? 'blue' : 'gray'}
                                        />
                                    </View>
                                ))}
                            </View>

                            <View style={styles.row}>
                                <Button title="Goal" onPress={() => recordEvent('G', { playerId: selectedPlayer })} disabled={!selectedPlayer} />
                                <Button title="Throwaway" onPress={() => recordEvent('T', { playerId: selectedPlayer })} disabled={!selectedPlayer} />
                                <Button title="Ex. D-Block" onPress={() => recordEvent('D', { playerId: selectedPlayer })} disabled={!selectedPlayer} />
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.subHeader}>Player Stats</Text>
                                {Object.entries(gameState.playerStats).map(([pId, stats]) => {
                                    const pName = team.players?.[pId]?.name || pId;
                                    return (
                                        <Text key={pId}>{pName} - G: {stats.goals}, A: {stats.assists}, D: {stats.blocks}, T: {stats.turns}</Text>
                                    );
                                })}
                            </View>

                            <View style={styles.mt}>
                                <Button title="Undo" onPress={undo} disabled={!canUndo} color="red" />
                            </View>

                            <Text style={styles.mt}>History ({(gameState.history || []).length} events):</Text>
                            {(gameState.history || []).slice(-5).map((e, i) => (
                                <Text key={i}>{e.type} by {team.players?.[e.playerId || '']?.name || 'Unknown'} @ {new Date(e.timestamp).toLocaleTimeString()}</Text>
                            ))}
                        </>
                    )}
                </View>
            )}

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20, paddingTop: 50 },
    header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    subHeader: { fontSize: 18, fontWeight: '600', marginBottom: 10, marginTop: 10 },
    section: { marginBottom: 20, padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8 },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 8, marginBottom: 10, borderRadius: 4 },
    row: { flexDirection: 'row', gap: 10, marginVertical: 10 },
    mt: { marginTop: 10 },
    score: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginVertical: 10 }
});
