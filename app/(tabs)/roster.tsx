import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { TeamService } from '../services/TeamService';
import { Team } from '../services/types';

export default function RosterScreen() {
    const [teamMode, setTeamMode] = useState<'none' | 'create' | 'join'>('none');
    const [teamNameInput, setTeamNameInput] = useState('');
    const [accessCodeInput, setAccessCodeInput] = useState('');
    const [team, setTeam] = useState<Team | null>(null);

    // Player Input
    const [playerName, setPlayerName] = useState('');
    const [playerNumber, setPlayerNumber] = useState('');

    const handleCreateTeam = async () => {
        if (!teamNameInput) return;

        const currentUser = auth.currentUser;
        if (!currentUser) {
            alert("You must be logged in to create a team.");
            return;
        }

        try {
            const teamId = await TeamService.createTeam(teamNameInput, currentUser.uid);
            subscribeToRoster(teamId);
        } catch (e) {
            console.error(e);
            alert("Failed to create team.");
        }
    };

    const handleJoinTeam = async () => {
        if (!accessCodeInput) return;
        try {
            const teamId = await TeamService.joinTeamByCode(accessCodeInput.toUpperCase());
            if (teamId) {
                subscribeToRoster(teamId);
            } else {
                alert("Invalid Access Code");
            }
        } catch (e) {
            console.error(e);
            alert("Error joining team.");
        }
    };

    const subscribeToRoster = (teamId: string) => {
        TeamService.subscribeToTeam(teamId, (updatedTeam) => {
            setTeam(updatedTeam);
        });
    };

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

    if (team) {
        return (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
                <View style={styles.headerCard}>
                    <Text style={styles.teamName}>{team.name}</Text>
                    <View style={styles.codeBadge}>
                        <Text style={styles.codeText}>Access Code: {team.accessCode}</Text>
                    </View>
                </View>

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
                    <TouchableOpacity style={styles.primaryButton} onPress={handleAddPlayer}>
                        <Text style={styles.primaryButtonText}>Add to Roster</Text>
                    </TouchableOpacity>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Current Roster ({team.players ? Object.keys(team.players).length : 0})</Text>
                <ScrollView style={styles.rosterList}>
                    {team.players && Object.values(team.players).map((p) => (
                        <View key={p.id} style={styles.playerCard}>
                            <View style={styles.playerInfo}>
                                <Text style={styles.playerNumber}>#{p.number || '--'}</Text>
                                <Text style={styles.playerName}>{p.name}</Text>
                            </View>
                            <TouchableOpacity style={styles.iconButton}>
                                <Ionicons name="trash-outline" size={20} color="#ff4444" />
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    return (
        <View style={styles.centerContainer}>
            <Ionicons name="people" size={80} color="#007AFF" style={{ marginBottom: 20 }} />
            <Text style={styles.welcomeTitle}>Team Setup</Text>

            {teamMode === 'none' && (
                <View style={styles.buttonGroup}>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => setTeamMode('create')}>
                        <Text style={styles.primaryButtonText}>Create New Team</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => setTeamMode('join')}>
                        <Text style={styles.secondaryButtonText}>Join Existing Team</Text>
                    </TouchableOpacity>
                </View>
            )}

            {teamMode === 'create' && (
                <View style={styles.formContainer}>
                    <Text style={styles.formLabel}>Team Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. State University Ultimate"
                        value={teamNameInput}
                        onChangeText={setTeamNameInput}
                    />
                    <TouchableOpacity style={styles.primaryButton} onPress={handleCreateTeam}>
                        <Text style={styles.primaryButtonText}>Create Team</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.textButton} onPress={() => setTeamMode('none')}>
                        <Text style={styles.textButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}

            {teamMode === 'join' && (
                <View style={styles.formContainer}>
                    <Text style={styles.formLabel}>Access Code</Text>
                    <TextInput
                        style={[styles.input, { textTransform: 'uppercase', textAlign: 'center', letterSpacing: 5 }]}
                        placeholder="XXXXXX"
                        maxLength={6}
                        value={accessCodeInput}
                        onChangeText={setAccessCodeInput}
                        autoCapitalize="characters"
                    />
                    <TouchableOpacity style={styles.primaryButton} onPress={handleJoinTeam}>
                        <Text style={styles.primaryButtonText}>Join via Code</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.textButton} onPress={() => setTeamMode('none')}>
                        <Text style={styles.textButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
    centerContainer: { flex: 1, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', padding: 20 },

    welcomeTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 40 },

    headerCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 20, alignItems: 'center' },
    teamName: { fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 10 },
    codeBadge: { backgroundColor: '#e0f0ff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
    codeText: { color: '#007AFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },

    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#444', marginBottom: 10 },

    addPlayerContainer: { backgroundColor: '#fff', padding: 15, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    inputRow: { flexDirection: 'row', marginBottom: 15 },

    rosterList: { flex: 1 },
    playerCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 15, borderRadius: 8, marginBottom: 10, alignItems: 'center', justifyContent: 'space-between', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 1 },
    playerInfo: { flexDirection: 'row', alignItems: 'center' },
    playerNumber: { fontSize: 18, fontWeight: 'bold', color: '#007AFF', width: 40 },
    playerName: { fontSize: 18, color: '#333', marginLeft: 10 },
    iconButton: { padding: 5 },

    buttonGroup: { width: '100%', maxWidth: 350 },
    formContainer: { width: '100%', maxWidth: 350 },
    formLabel: { fontSize: 16, fontWeight: '600', color: '#555', marginBottom: 8 },

    input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, fontSize: 16, color: '#333', marginBottom: 20 },

    primaryButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', width: '100%', marginBottom: 15 },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', width: '100%' },
    secondaryButtonText: { color: '#007AFF', fontSize: 16, fontWeight: 'bold' },

    textButton: { padding: 10, alignItems: 'center' },
    textButtonText: { color: '#666', fontSize: 16 }
});
