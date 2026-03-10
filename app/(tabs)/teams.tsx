import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { TeamService } from '../services/TeamService';
import { Team } from '../services/types';

export default function TeamsHubScreen() {
    const [coachedTeams, setCoachedTeams] = useState<Team[]>([]);
    const [spectatedTeams, setSpectatedTeams] = useState<Team[]>([]);

    const [teamMode, setTeamMode] = useState<'none' | 'create' | 'join'>('none');
    const [teamNameInput, setTeamNameInput] = useState('');
    const [accessCodeInput, setAccessCodeInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const user = auth.currentUser;

    useEffect(() => {
        if (!user) return;
        const unsubscribe = TeamService.getTeamsForUser(user.uid, (coached, spectated) => {
            setCoachedTeams(coached);
            setSpectatedTeams(spectated);
        });
        return () => unsubscribe();
    }, [user]);

    const handleCreateTeam = async () => {
        if (!teamNameInput.trim() || !user) return;
        setIsLoading(true);
        try {
            await TeamService.createTeam(teamNameInput, user.uid);
            setTeamNameInput('');
            setTeamMode('none');
        } catch (e) {
            alert("Failed to create team.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoinTeam = async () => {
        if (!accessCodeInput.trim() || !user) return;
        setIsLoading(true);
        try {
            const result = await TeamService.joinTeamByCode(accessCodeInput.toUpperCase(), user.uid);
            if (result) {
                setAccessCodeInput('');
                setTeamMode('none');
            } else {
                alert("Invalid Access Code");
            }
        } catch (e) {
            alert("Failed to join team.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Your Teams</Text>
            </View>

            {/* ACTION BUTTONS */}
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

            {/* CREATE / JOIN FORMS */}
            {teamMode === 'create' && (
                <View style={styles.formContainer}>
                    <Text style={styles.formLabel}>Team Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. State University Ultimate"
                        value={teamNameInput}
                        onChangeText={setTeamNameInput}
                    />
                    <TouchableOpacity style={styles.primaryButton} onPress={handleCreateTeam} disabled={isLoading}>
                        <Text style={styles.primaryButtonText}>{isLoading ? 'Creating...' : 'Create Team'}</Text>
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
                    <TouchableOpacity style={styles.primaryButton} onPress={handleJoinTeam} disabled={isLoading}>
                        <Text style={styles.primaryButtonText}>{isLoading ? 'Joining...' : 'Join via Code'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.textButton} onPress={() => setTeamMode('none')}>
                        <Text style={styles.textButtonText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* LISTINGS */}
            {teamMode === 'none' && (
                <ScrollView style={styles.historyContainer}>
                    
                    {/* LIVE GAMES */}
                    {(() => {
                        const allTeams = [...coachedTeams, ...spectatedTeams];
                        const uniqueTeams = Array.from(new Map(allTeams.map(t => [t.id, t])).values());
                        const liveTeams = uniqueTeams.filter(t => t.activeGameId);

                        if (liveTeams.length > 0) {
                            return (
                                <>
                                    <Text style={[styles.sectionTitle, { color: '#ff4444' }]}>Live Games</Text>
                                    {liveTeams.map(t => {
                                        const isCoach = coachedTeams.some(ct => ct.id === t.id);
                                        return (
                                            <TouchableOpacity 
                                                key={`live-${t.id}`} 
                                                style={[styles.teamHistoryCard, { borderColor: '#ff4444', borderWidth: 1 }]}
                                                onPress={() => {
                                                    if (isCoach) {
                                                        router.push(`/game/record/${t.id}` as any);
                                                    } else {
                                                        router.push(`/game/watch/${t.id}` as any);
                                                    }
                                                }}
                                            >
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                                        <Text style={styles.teamHistoryName}>{t.name}</Text>
                                                        <View style={styles.liveBadge}>
                                                            <Text style={styles.liveText}>🔴 LIVE</Text>
                                                        </View>
                                                    </View>
                                                    <Text style={[styles.teamHistoryCode, { color: isCoach ? '#007AFF' : '#666' }]}>
                                                        {isCoach ? 'Tap to Record' : 'Tap to Spectate'}
                                                    </Text>
                                                </View>
                                                <Ionicons name="chevron-forward" size={24} color="#ccc" />
                                            </TouchableOpacity>
                                        );
                                    })}
                                    <View style={{ height: 20 }} />
                                </>
                            );
                        }
                        return null;
                    })()}

                    {/* COACHED TEAMS */}
                    <Text style={[styles.sectionTitle, { color: '#007AFF', marginTop: 20 }]}>Coaching</Text>
                    {coachedTeams.length === 0 ? (
                        <Text style={styles.emptyText}>You haven't created any teams yet.</Text>
                    ) : (
                        coachedTeams.map(t => (
                            <TouchableOpacity 
                                key={t.id} 
                                style={styles.teamHistoryCard}
                                onPress={() => router.push(`/team/${t.id}` as any)}
                            >
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                        <Text style={styles.teamHistoryName}>{t.name}</Text>
                                        {t.activeGameId && (
                                            <View style={styles.liveBadge}>
                                                <Text style={styles.liveText}>🔴 LIVE</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.teamHistoryCode}>Code: {t.accessCode}</Text>
                                    <Text style={[styles.teamHistoryCode, { color: '#ff4444' }]}>Spectator Code: {t.spectatorCode}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={24} color="#ccc" />
                            </TouchableOpacity>
                        ))
                    )}

                    <View style={{ height: 20 }} />

                    {/* SPECTATED TEAMS */}
                    <Text style={[styles.sectionTitle, { color: '#ff4444' }]}>Spectating</Text>
                    {spectatedTeams.length === 0 ? (
                        <Text style={styles.emptyText}>You aren't spectating any teams.</Text>
                    ) : (
                        spectatedTeams.map(t => (
                            <TouchableOpacity 
                                key={t.id} 
                                style={styles.teamHistoryCard}
                                onPress={() => router.push(`/team/${t.id}` as any)}
                            >
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                        <Text style={styles.teamHistoryName}>{t.name}</Text>
                                        {t.activeGameId && (
                                            <View style={styles.liveBadge}>
                                                <Text style={styles.liveText}>🔴 LIVE</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={[styles.teamHistoryCode, { color: '#666' }]}>Spectator</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={24} color="#ccc" />
                            </TouchableOpacity>
                        ))
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f2f5', },
    header: { backgroundColor: '#fff', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center', },
    title: { fontSize: 24, fontWeight: 'bold', color: '#111', },
    
    buttonGroup: { padding: 20, paddingBottom: 0 },
    formContainer: { padding: 20, backgroundColor: '#fff', margin: 20, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    formLabel: { fontSize: 16, fontWeight: '600', color: '#555', marginBottom: 8 },
    input: { backgroundColor: '#f9f9f9', borderWidth: 1, borderColor: '#ddd', padding: 15, borderRadius: 10, fontSize: 16, color: '#333', marginBottom: 20 },

    primaryButton: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', width: '100%', marginBottom: 15 },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#007AFF', padding: 15, borderRadius: 10, alignItems: 'center', width: '100%' },
    secondaryButtonText: { color: '#007AFF', fontSize: 16, fontWeight: 'bold' },
    textButton: { padding: 10, alignItems: 'center' },
    textButtonText: { color: '#666', fontSize: 16 },

    historyContainer: { flex: 1, padding: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
    emptyText: { color: '#888', fontStyle: 'italic', marginBottom: 20 },
    
    teamHistoryCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    teamHistoryName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    teamHistoryCode: { fontSize: 14, color: '#007AFF', fontWeight: '500', marginBottom: 2 },

    liveBadge: { backgroundColor: '#ffe5e5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 10 },
    liveText: { color: '#ff4444', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 }
});
