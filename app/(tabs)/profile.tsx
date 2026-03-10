import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { signOut } from 'firebase/auth';
import { ref, set, onValue } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { TeamService } from '../services/TeamService';
import { Team } from '../services/types';

export default function ProfileScreen() {
    const [email, setEmail] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<'coach' | 'spectator' | null>(null);

    const user = auth.currentUser;

    useEffect(() => {
        if (!user) return;
        setEmail(user.email);

        // 1. Fetch user's active profile setting
        const profileRef = ref(db, `users/${user.uid}/profile`);
        const unsubProfile = onValue(profileRef, (snap) => {
            const data = snap.val();
            if (data) {
                setActiveTeamId(data.activeTeamId);
                setActiveRole(data.activeRole);
            }
        });

        // 2. Fetch all teams
        const unsubTeams = TeamService.getTeamsForUser(user.uid, (coached, spectated) => {
            setTeams([...coached, ...spectated]);
        });

        return () => {
            unsubProfile();
            unsubTeams();
        };
    }, [user]);

    const handleSelectActiveTeam = async (t: Team) => {
        if (!user) return;
        const newRole = t.role || 'spectator';
        
        try {
            await set(ref(db, `users/${user.uid}/profile`), {
                activeTeamId: t.id,
                activeRole: newRole
            });
            setActiveTeamId(t.id);
            setActiveRole(newRole);
        } catch (e) {
            console.error("Failed to update active team", e);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            // The Auth Guard in _layout.tsx will automatically redirect to Login
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    // Find the currently active team object
    const activeTeam = teams.find(t => t.id === activeTeamId);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.avatarCircle}>
                    <Ionicons name="person" size={50} color="#007AFF" />
                </View>
                <Text style={styles.emailText}>{email || 'Loading...'}</Text>
                {activeTeam && (
                    <Text style={styles.roleText}>
                        {activeRole === 'coach' ? 'Coach' : 'Spectator'} of {activeTeam.name}
                    </Text>
                )}
            </View>

            <Text style={styles.sectionTitle}>Select Active Team</Text>
            {teams.length === 0 ? (
                <Text style={styles.emptyText}>You are not part of any teams yet.</Text>
            ) : (
                <View style={styles.optionsContainer}>
                    {teams.map(t => (
                        <TouchableOpacity 
                            key={`${t.id}-${t.role}`}
                            style={styles.optionRow} 
                            onPress={() => handleSelectActiveTeam(t)}
                        >
                            <Ionicons 
                                name={activeTeamId === t.id && activeRole === t.role ? "radio-button-on" : "radio-button-off"} 
                                size={24} 
                                color={activeTeamId === t.id && activeRole === t.role ? "#007AFF" : "#CCC"} 
                            />
                            <View style={{ flex: 1, marginLeft: 15 }}>
                                <Text style={styles.optionText}>{t.name}</Text>
                                <Text style={styles.subText}>{t.role === 'coach' ? 'Coach' : 'Spectator'}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <View style={styles.optionsContainer}>
                <TouchableOpacity style={styles.optionRow}>
                    <Ionicons name="settings-outline" size={24} color="#333" />
                    <Text style={styles.optionTextBaseline}>Account Settings</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow}>
                    <Ionicons name="notifications-outline" size={24} color="#333" />
                    <Text style={styles.optionTextBaseline}>Notifications</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.optionRow}>
                    <Ionicons name="help-circle-outline" size={24} color="#333" />
                    <Text style={styles.optionTextBaseline}>Help & Support</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color="#fff" />
                <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
    
    header: { alignItems: 'center', marginVertical: 40 },
    avatarCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#e0f0ff', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    emailText: { fontSize: 22, fontWeight: 'bold', color: '#111' },
    roleText: { fontSize: 16, color: '#007AFF', marginTop: 5, fontWeight: '600' },
    
    optionsContainer: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
    optionRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
    optionText: { fontSize: 16, color: '#333', fontWeight: 'bold' },
    optionTextBaseline: { flex: 1, fontSize: 16, color: '#333', marginLeft: 15 },
    subText: { fontSize: 12, color: '#666', marginTop: 2 },
    
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 10, alignSelf: 'flex-start' },
    emptyText: { color: '#888', fontStyle: 'italic', marginBottom: 20 },

    logoutButton: { flexDirection: 'row', backgroundColor: '#ff3b30', padding: 15, borderRadius: 10, justifyContent: 'center', alignItems: 'center', shadowColor: '#ff3b30', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, marginBottom: 40 },
    logoutText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 }
});
