import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { signOut, updatePassword } from 'firebase/auth';
import { ref, set, onValue, update } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Modal, TextInput, Alert, Platform } from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { TeamService } from '../services/TeamService';
import { Team } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { useTheme, ThemeColors } from '../theme/ThemeContext';

export default function ProfileScreen() {
    const [email, setEmail] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<'coach' | 'spectator' | null>(null);

    const [pushModalVisible, setPushModalVisible] = useState(false);
    const [pushSetting, setPushSetting] = useState<'all' | 'game' | 'off'>('game');
    
    const [accountModalVisible, setAccountModalVisible] = useState(false);
    const [newPassword, setNewPassword] = useState('');

    const [themeModalVisible, setThemeModalVisible] = useState(false);
    const { colors, themePref, setThemePref } = useTheme();
    const styles = getStyles(colors);

    const user = auth.currentUser;

    useEffect(() => {
        if (!user) return;
        setEmail(user.email);

        const profileRef = ref(db, `users/${user.uid}/profile`);
        const unsubProfile = onValue(profileRef, (snap) => {
            const data = snap.val();
            if (data) {
                setActiveTeamId(data.activeTeamId);
                setActiveRole(data.activeRole);
                if (data.pushSetting) setPushSetting(data.pushSetting);
            }
        });

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
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleSetPushSetting = async (val: 'all' | 'game' | 'off') => {
        if (!user) return;
        await update(ref(db, `users/${user.uid}/profile`), { pushSetting: val });
        setPushSetting(val);
        setPushModalVisible(false);
    };

    const handleUpdatePassword = async () => {
        if (!user || !newPassword.trim()) return;
        try {
            await updatePassword(user, newPassword);
            Alert.alert("Success", "Password updated successfully.");
            setNewPassword('');
            setAccountModalVisible(false);
        } catch (e: any) {
            Alert.alert("Update Failed", "For security, modifying credentials requires a recent login. Please log out and back in to change your password.");
        }
    };

    const activeTeam = teams.find(t => t.id === activeTeamId);

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <View style={styles.topAppBar}>
                <Text style={styles.logoText}>Profile</Text>
            </View>

            <View style={styles.mainContent}>
                <View style={styles.header}>
                    <View style={styles.avatarCircle}>
                        <Ionicons name="person" size={40} color={colors.primary} />
                    </View>
                    <Text style={styles.emailText}>{email || 'Loading...'}</Text>
                    {activeTeam ? (
                        <View style={styles.roleBadge}>
                            <Ionicons name={activeRole === 'coach' ? 'shield-checkmark' : 'eye'} size={14} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={styles.roleText}>
                                {activeRole === 'coach' ? 'Manager' : 'Spectator'} • {activeTeam.name}
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.roleBadge, { backgroundColor: colors.surfaceSecondary }]}>
                            <Text style={[styles.roleText, { color: colors.textSecondary }]}>No Active Team</Text>
                        </View>
                    )}
                </View>

                <Text style={styles.sectionTitle}>DEFAULT ACTIVE TEAM</Text>
                {teams.length === 0 ? (
                    <View style={styles.emptyStateCard}>
                        <Text style={styles.emptyText}>You are not part of any teams.</Text>
                    </View>
                ) : (
                    <View style={styles.optionsContainer}>
                        {teams.map((t, index) => (
                            <TouchableOpacity 
                                key={`${t.id}-${t.role}`}
                                style={[styles.optionRow, index === teams.length - 1 && { borderBottomWidth: 0 }]} 
                                onPress={() => handleSelectActiveTeam(t)}
                                activeOpacity={0.7}
                            >
                                <Ionicons 
                                    name={activeTeamId === t.id && activeRole === t.role ? "radio-button-on" : "radio-button-off"} 
                                    size={24} 
                                    color={activeTeamId === t.id && activeRole === t.role ? colors.primary : colors.textSecondary} 
                                />
                                <View style={{ flex: 1, marginLeft: 16 }}>
                                    <Text style={styles.optionText}>{t.name}</Text>
                                    <Text style={styles.subText}>{t.role === 'coach' ? 'Manager / Coach' : 'Spectator / Fan'}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <Text style={styles.sectionTitle}>ACCOUNT</Text>
                <View style={styles.optionsContainer}>
                    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setAccountModalVisible(true)}>
                        <Ionicons name="settings-outline" size={24} color={colors.textSecondary} />
                        <Text style={styles.optionTextBaseline}>Account Details</Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setPushModalVisible(true)}>
                        <Ionicons name="notifications-outline" size={24} color={colors.textSecondary} />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={styles.optionText}>Push Notifications</Text>
                            <Text style={styles.subText}>{pushSetting === 'all' ? 'Every Score' : pushSetting === 'game' ? 'Game Start & End' : 'Off'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={styles.optionRow} activeOpacity={0.7} onPress={() => setThemeModalVisible(true)}>
                        <Ionicons name="color-palette-outline" size={24} color={colors.textSecondary} />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                            <Text style={styles.optionText}>Appearance</Text>
                            <Text style={styles.subText}>{themePref === 'system' ? 'System Default' : themePref === 'dark' ? 'Dark Mode' : 'Light Mode'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.optionRow, { borderBottomWidth: 0 }]} activeOpacity={0.7}>
                        <Ionicons name="help-circle-outline" size={24} color={colors.textSecondary} />
                        <Text style={styles.optionTextBaseline}>Support</Text>
                        <Ionicons name="chevron-forward" size={20} color={colors.border} />
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>
            </View>

            {/* PUSH NOTIFICATIONS MODAL */}
            <Modal visible={pushModalVisible} animationType="fade" transparent={true} onRequestClose={() => setPushModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPushModalVisible(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>Push Notifications</Text>
                        <Text style={styles.modalSub}>Receive field updates even when the app is closed.</Text>
                        
                        <View style={{ width: '100%', marginBottom: 24 }}>
                            {[
                                { key: 'all', label: 'Every Score & Event', desc: 'Real-time updates for every point.' },
                                { key: 'game', label: 'Game Start & End Only', desc: 'Alerts when a match begins or concludes.' },
                                { key: 'off', label: 'Off', desc: 'Do not send push notifications.' }
                            ].map(opt => (
                                <TouchableOpacity 
                                    key={opt.key} 
                                    style={[styles.radioRow, pushSetting === opt.key && styles.radioRowActive]} 
                                    onPress={() => handleSetPushSetting(opt.key as any)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.radioLabel, pushSetting === opt.key && { color: colors.primary }]}>{opt.label}</Text>
                                        <Text style={styles.radioDesc}>{opt.desc}</Text>
                                    </View>
                                    <Ionicons name={pushSetting === opt.key ? "radio-button-on" : "radio-button-off"} size={24} color={pushSetting === opt.key ? colors.primary : colors.textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setPushModalVisible(false)}>
                            <Text style={styles.modalCloseBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* ACCOUNT DETAILS MODAL */}
            <Modal visible={accountModalVisible} animationType="slide" transparent={true} onRequestClose={() => setAccountModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 24 }]}>
                        <Text style={styles.modalTitle}>Account Details</Text>
                        <Text style={[styles.modalSub, { marginBottom: 24 }]}>RealUltimate natively respects your OS text size scaling settings.</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>EMAIL (READ ONLY)</Text>
                            <TextInput style={[styles.inputField, { backgroundColor: colors.surfaceSecondary, color: colors.textSecondary }]} value={email || ''} editable={false} />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>NEW PASSWORD</Text>
                            <TextInput 
                                style={styles.inputField} 
                                placeholder="Enter new password" 
                                placeholderTextColor={colors.textSecondary}
                                secureTextEntry 
                                value={newPassword} 
                                onChangeText={setNewPassword} 
                            />
                        </View>

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                            <TouchableOpacity style={[styles.modalCloseBtn, { flex: 1, marginBottom: 0 }]} onPress={() => setAccountModalVisible(false)}>
                                <Text style={[styles.modalCloseBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalCloseBtn, { flex: 2, backgroundColor: colors.primary, marginBottom: 0, borderWidth: 0 }]} onPress={handleUpdatePassword}>
                                <Text style={[styles.modalCloseBtnText, { color: '#fff' }]}>Update Password</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* APPEARANCE MODAL */}
            <Modal visible={themeModalVisible} animationType="fade" transparent={true} onRequestClose={() => setThemeModalVisible(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setThemeModalVisible(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <Text style={styles.modalTitle}>Appearance</Text>
                        <Text style={styles.modalSub}>Customize the app's visual theme.</Text>
                        
                        <View style={{ width: '100%', marginBottom: 24 }}>
                            {[
                                { key: 'system', label: 'System Default' },
                                { key: 'light', label: 'Light Mode' },
                                { key: 'dark', label: 'Dark Mode' }
                            ].map(opt => (
                                <TouchableOpacity 
                                    key={opt.key} 
                                    style={[styles.radioRow, themePref === opt.key && styles.radioRowActive]} 
                                    onPress={() => { setThemePref(opt.key as any); setThemeModalVisible(false); }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.radioLabel, themePref === opt.key && { color: colors.primary }]}>{opt.label}</Text>
                                    </View>
                                    <Ionicons name={themePref === opt.key ? "radio-button-on" : "radio-button-off"} size={24} color={themePref === opt.key ? colors.primary : colors.textSecondary} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setThemeModalVisible(false)}>
                            <Text style={styles.modalCloseBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

        </ScrollView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        logoText: { ...Typography.title, fontSize: 18 },
        
        mainContent: { padding: Layout.padding, paddingTop: 24 },

        header: { alignItems: 'center', marginBottom: 32 },
        avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
        emailText: { ...Typography.title, fontSize: 20, marginBottom: 8 },
        roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Layout.radiusFull },
        roleText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '600' },
        
        sectionTitle: { ...Typography.label, marginBottom: 12 },
        
        emptyStateCard: { padding: 24, backgroundColor: colors.surface, borderRadius: Layout.radiusLg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginBottom: 32 },
        emptyText: { ...Typography.bodySmall, textAlign: 'center' },

        optionsContainer: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, marginBottom: 32, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        optionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
        optionText: { ...Typography.body, fontWeight: '600' },
        optionTextBaseline: { flex: 1, ...Typography.body, marginLeft: 16 },
        subText: { ...Typography.bodySmall, marginTop: 2 },
        
        logoutButton: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        logoutText: { ...Typography.button, color: colors.error },

        // Modals
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
        modalContent: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center', ...Layout.shadow },
        modalTitle: { ...Typography.title, fontSize: 20, marginBottom: 8 },
        modalSub: { ...Typography.bodySmall, textAlign: 'center', marginBottom: 24 },
        
        radioRow: { flexDirection: 'row', width: '100%', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
        radioRowActive: { borderBottomColor: colors.primary },
        radioLabel: { ...Typography.body, fontWeight: '600' },
        radioDesc: { ...Typography.bodySmall, fontSize: 12, marginTop: 2 },
        
        modalCloseBtn: { width: '100%', paddingVertical: 14, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginTop: 8 },
        modalCloseBtnText: { ...Typography.button, color: colors.text },

        inputGroup: { width: '100%', marginBottom: 16 },
        inputLabel: { ...Typography.label, marginBottom: 8 },
        inputField: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, padding: 12, fontSize: 16, color: colors.text }
    });
}
