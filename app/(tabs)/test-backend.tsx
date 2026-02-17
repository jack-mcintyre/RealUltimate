import React, { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGame } from '../hooks/useGame';
import { TeamService } from '../services/TeamService';
import { Team } from '../services/types';

export default function TestBackend() {
    const [teamName, setTeamName] = useState('Test Team');
    const [team, setTeam] = useState<Team | null>(null);
    const [playerName, setPlayerName] = useState('');

    const { gameState, recordEvent, undo, canUndo, startGame } = useGame(team ? 'test-game' : undefined);

    // Auto-create/join a test team on load or manually
    const handleCreateTeam = async () => {
        try {
            const coachId = 'test-coach-id'; // Simulate auth
            const teamId = await TeamService.createTeam(teamName, coachId);
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

                            <View style={styles.row}>
                                <Button title="Goal" onPress={() => recordEvent('G')} />
                                <Button title="Throwaway" onPress={() => recordEvent('T')} />
                                <Button title="Ex. D-Block" onPress={() => recordEvent('D')} />
                            </View>

                            <View style={styles.mt}>
                                <Button title="Undo" onPress={undo} disabled={!canUndo} color="red" />
                            </View>

                            <Text style={styles.mt}>History ({gameState.history.length} events):</Text>
                            {gameState.history.slice(-5).map((e, i) => (
                                <Text key={i}>{e.type} @ {new Date(e.timestamp).toLocaleTimeString()}</Text>
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
