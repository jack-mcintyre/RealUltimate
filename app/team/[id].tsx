import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
import { auth } from '../../firebaseConfig';
import { GameService } from '../services/GameService';
import { TeamService } from '../services/TeamService';
import { GameState, Team } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { useTheme, ThemeColors } from '../theme/ThemeContext';

export default function TeamDashboardScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [pastGames, setPastGames] = useState<GameState[]>([]);

    // Player Input
    const [playerName, setPlayerName] = useState('');
    const [playerNumber, setPlayerNumber] = useState('');
    
    // Analytics Filter
    const [selectedYear, setSelectedYear] = useState<string>('All Time');
    
    // Team Roles UI
    const [showPermissionsModal, setShowPermissionsModal] = useState(false);

    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);

    useEffect(() => {
        if (!id) return;
        
        const unsubscribe = TeamService.subscribeToTeam(id, (t) => {
            setTeam(t);
        });

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

    if (!team) return <View style={styles.centerContainer}><Text style={styles.loadingText}>Loading Team...</Text></View>;

    const isCoach = auth.currentUser?.uid === team.coachId;

    const handleDeleteTeam = () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm("Are you sure you want to delete this team?");
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
                "Are you sure you want to delete this team?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: async () => {
                        try {
                            if (auth.currentUser) {
                                await TeamService.deleteTeam(team.id, auth.currentUser.uid);
                                router.replace('/teams');
                            }
                        } catch (e) {
                            Alert.alert("Error", "Failed to delete team.");
                        }
                    }}
                ]
            );
        }
    };

    const handleRoleChange = (managerId: string, currentRole: string) => {
        if (!team) return;
        Alert.alert(
            "Change Role",
            "Select new role for this manager",
            [
                { text: "Assistant Coach", onPress: () => TeamService.updateManagerRole(team.id, managerId, "Assistant Coach") },
                { text: "Stats Taker", onPress: () => TeamService.updateManagerRole(team.id, managerId, "Stats Taker") },
                { text: "Cancel", style: "cancel" }
            ]
        );
    };

    const handleRemoveManager = (managerId: string) => {
        if (!team) return;
        Alert.alert(
            "Remove Manager",
            "Are you sure you want to remove this user from the team managers?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => TeamService.removeManager(team.id, managerId) }
            ]
        );
    };
    const availableYears = ['All Time', ...Array.from(new Set(pastGames.map(g => {
        return g.history?.length ? new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() : 'Unknown';
    }))).filter(y => y !== 'Unknown').sort((a,b) => b.localeCompare(a))];

    const filteredGames = pastGames.filter(g => {
        if (selectedYear === 'All Time') return true;
        if (!g.history?.length) return false;
        return new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() === selectedYear;
    });

    const totalGames = filteredGames.length;
    let wins = 0;
    filteredGames.forEach(g => {
        const isTeam1 = g.team1Id === team.id;
        const ourScore = isTeam1 ? g.score1 : g.score2;
        const theirScore = isTeam1 ? g.score2 : g.score1;
        if (ourScore > theirScore) wins++;
    });
    const winrate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle} numberOfLines={1}>{team.name}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.mainContent} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                
                {/* TEAM INFO CARD */}
                <View style={styles.infoCard}>
                    <View style={styles.teamBadgeLg}>
                        <Text style={styles.teamBadgeTextLg}>{team.name.substring(0, 2).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.teamNameTitle}>{team.name}</Text>
                    
                    {isCoach ? (
                        <View style={styles.codeContainerRow}>
                            <View style={styles.codeBadge}>
                                <Text style={styles.codeBadgeLabel}>COACH CODE</Text>
                                <Text style={styles.codeBadgeCode}>{team.accessCode}</Text>
                            </View>
                            <View style={styles.codeBadge}>
                                <Text style={styles.codeBadgeLabel}>FAN CODE</Text>
                                <Text style={styles.codeBadgeCode}>{team.spectatorCode}</Text>
                            </View>
                        </View>
                    ) : (
                        <View style={styles.codeBadge}>
                            <Text style={styles.codeBadgeLabel}>ACCESS</Text>
                            <Text style={styles.codeBadgeCode}>SPECTATOR</Text>
                        </View>
                    )}
                </View>

                {/* ACTION BUTTONS */}
                <View style={styles.actionRow}>
                    {isCoach ? (
                        <TouchableOpacity 
                            style={[styles.primaryActionBtn, { flex: 1, marginRight: team.activeGameId ? 16 : 0 }]}
                            onPress={() => router.push(`/game/record/${team.id}` as any)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name={team.activeGameId ? "play" : "videocam"} size={24} color={colors.onPrimary} style={{ marginBottom: 8 }} />
                            <Text style={styles.primaryActionBtnText}>{team.activeGameId ? 'Resume Match' : 'Record Match'}</Text>
                        </TouchableOpacity>
                    ) : null}

                    {team.activeGameId && (
                        <TouchableOpacity 
                            style={[styles.liveActionBtn, { flex: 1 }]}
                            onPress={() => router.push(`/game/watch/${team.id}` as any)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="radio" size={24} color={colors.onPrimary} style={{ marginBottom: 8 }} />
                            <Text style={styles.primaryActionBtnText}>Watch Live</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ROSTER MANAGEMENT */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Roster ({team.players ? Object.keys(team.players).length : 0})</Text>
                </View>

                {isCoach && (
                    <View style={styles.addPlayerContainer}>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={[styles.input, { flex: 3 }]}
                                placeholder="Player Name"
                                placeholderTextColor={colors.textSecondary}
                                value={playerName}
                                onChangeText={setPlayerName}
                            />
                            <TextInput
                                style={[styles.inputNum, { flex: 1, marginLeft: 12 }]}
                                placeholder="#"
                                placeholderTextColor={colors.textSecondary}
                                keyboardType="numeric"
                                value={playerNumber}
                                onChangeText={setPlayerNumber}
                            />
                        </View>
                        <TouchableOpacity style={styles.addPlayerBtn} onPress={handleAddPlayer}>
                            <Ionicons name="add" size={20} color={colors.primary} />
                            <Text style={styles.addPlayerBtnText}>Add Player</Text>
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.rosterList}>
                    {team.players && Object.values(team.players).map((p) => (
                        <TouchableOpacity 
                            key={p.id} 
                            style={styles.playerCard} 
                            onPress={() => router.push(`/team/${team.id}/player/${p.id}`)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.playerInfo}>
                                <View style={styles.playerNumberBox}>
                                    <Text style={styles.playerNumberText}>{p.number || '--'}</Text>
                                </View>
                                <Text style={[styles.playerNameText, { color: colors.primary }]} numberOfLines={1}>{p.name}</Text>
                            </View>
                            {isCoach && (
                                <TouchableOpacity style={styles.playerDelBtn}>
                                    <Ionicons name="close" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {isCoach && (
                    <TouchableOpacity style={styles.permissionsBtn} onPress={() => setShowPermissionsModal(true)} activeOpacity={0.8}>
                        <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
                        <Text style={styles.permissionsBtnText}>Manage Team Permissions</Text>
                    </TouchableOpacity>
                )}

                {/* PAST GAMES & ANALYTICS */}
                {pastGames.length > 0 && (
                    <View style={{ marginTop: 24 }}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Match History & Stats</Text>
                        </View>
                        
                        {/* YEAR FILTER */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                                {availableYears.map(year => (
                                    <TouchableOpacity 
                                        key={year} 
                                        style={[styles.filterChip, selectedYear === year && styles.filterChipActive]}
                                        onPress={() => setSelectedYear(year)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.filterChipText, selectedYear === year && styles.filterChipTextActive]}>{year}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                        
                        {/* QUICK STATS */}
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                            <View style={styles.statCard}>
                                <Text style={styles.statValue}>{totalGames}</Text>
                                <Text style={styles.statLabel}>Matches</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: colors.primary }]}>{winrate}%</Text>
                                <Text style={styles.statLabel}>Win Rate</Text>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={[styles.statValue, { color: colors.success }]}>{wins}</Text>
                                <Text style={styles.statLabel}>Total Wins</Text>
                            </View>
                        </View>

                        {filteredGames.length === 0 ? (
                            <Text style={{ ...getTypography(colors).bodySmall, textAlign: 'center', marginTop: 12 }}>No matches recorded for {selectedYear}.</Text>
                        ) : (
                            filteredGames.map((game) => {
                                const isTeam1 = game.team1Id === team.id;
                                const opponentName = isTeam1 ? game.team2Name || "Opponent" : team.name;
                            const ourScore = isTeam1 ? game.score1 : game.score2;
                            const theirScore = isTeam1 ? game.score2 : game.score1;
                            const dateText = game.history && game.history.length > 0 
                                ? new Date(game.history[game.history.length - 1].timestamp).toLocaleDateString()
                                : "Unknown Date";
                            const isWin = ourScore > theirScore;
                            const isLoss = theirScore > ourScore;
                            const bgColor = isWin ? colors.success : (isLoss ? colors.error : colors.surfaceSecondary);
                            const textColor = (isWin || isLoss) ? colors.onPrimary : colors.text;
                            const subTextColor = (isWin || isLoss) ? 'rgba(255,255,255,0.8)' : colors.textSecondary;
                            const scoreBoxBg = (isWin || isLoss) ? 'rgba(0,0,0,0.15)' : (isDark ? 'rgba(255,255,255,0.05)' : colors.surface);

                            return (
                                <TouchableOpacity 
                                    key={game.gameId} 
                                    style={[styles.historyCard, { backgroundColor: bgColor }]}
                                    onPress={() => router.push(`/game/history/${game.gameId}` as any)}
                                    activeOpacity={0.8}
                                >
                                    <View style={styles.historyMatchInfo}>
                                        <Text style={[styles.historyOpponent, { color: textColor }]} numberOfLines={1}>vs {opponentName}</Text>
                                        <Text style={[styles.historyDate, { color: subTextColor }]}>{dateText}</Text>
                                    </View>
                                    <View style={[styles.historyScoreBox, { backgroundColor: scoreBoxBg }]}>
                                        <Text style={[styles.historyScoreText, { color: textColor }]}>
                                            {ourScore} - {theirScore}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                        )}
                    </View>
                )}

                {isCoach && (
                    <TouchableOpacity style={styles.deleteTeamBtn} onPress={handleDeleteTeam}>
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                        <Text style={styles.deleteTeamBtnText}>Delete Team</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* TEAM PERMISSIONS MODAL */}
            <Modal visible={showPermissionsModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitle, { marginBottom: 4 }]}>Team Permissions</Text>
                                <Text style={styles.modalSub}>Manage who has Manager/Coach access to edit rosters and start games.</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowPermissionsModal(false)} style={{ padding: 4 }}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.permissionsList}>
                            {team.managers && Object.entries(team.managers).map(([uid, r]) => (
                                <View key={uid} style={styles.permissionRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.permissionEmail}>{r.email}</Text>
                                        <TouchableOpacity onPress={() => handleRoleChange(uid, r.role)} disabled={r.role === 'Head Coach'}>
                                            <Text style={styles.permissionRole}>
                                                {r.role} {r.role !== 'Head Coach' && <Ionicons name="create-outline" size={14} />}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    {r.role !== 'Head Coach' && (
                                        <TouchableOpacity onPress={() => handleRemoveManager(uid)}>
                                            <Ionicons name="trash-outline" size={20} color={colors.error} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </View>

                        <View style={styles.addPermissionBox}>
                            <Text style={styles.inputLabel}>ADD TEAM MANAGER</Text>
                            <Text style={{ ...getTypography(colors).bodySmall, color: colors.textSecondary, marginBottom: 12 }}>
                                To allow another user to record games and manage the roster, have them download the app and enter this code on the Teams Hub.
                            </Text>
                            <View style={{ backgroundColor: colors.surfaceSecondary, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center' }}>
                                <Text style={{ ...getTypography(colors).title, fontSize: 24, letterSpacing: 4 }}>{team.accessCode}</Text>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        loadingText: { ...Typography.body, color: colors.textSecondary },
        
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
        topAppBarTitle: { ...Typography.title, fontSize: 18, flex: 1, textAlign: 'center' },

        mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 24 },
        
        infoCard: { alignItems: 'center', padding: 32, backgroundColor: colors.surface, borderRadius: Layout.radiusLg, marginBottom: 24, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        teamBadgeLg: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
        teamBadgeTextLg: { ...Typography.title, fontSize: 32, color: colors.primary },
        teamNameTitle: { ...Typography.title, fontSize: 24, marginBottom: 20, textAlign: 'center' },
        
        codeContainerRow: { flexDirection: 'row', gap: 16, width: '100%', justifyContent: 'center' },
        codeBadge: { backgroundColor: colors.surfaceSecondary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: Layout.radiusMd, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
        codeBadgeLabel: { ...Typography.label, marginBottom: 4 },
        codeBadgeCode: { ...Typography.title, fontSize: 20, color: colors.text, letterSpacing: 2 },

        actionRow: { flexDirection: 'row', marginBottom: 32 },
        primaryActionBtn: { backgroundColor: colors.primary, paddingVertical: 20, paddingHorizontal: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
        primaryActionBtnText: { ...Typography.button, color: colors.onPrimary },
        liveActionBtn: { backgroundColor: colors.error, paddingVertical: 20, paddingHorizontal: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },

        sectionHeader: { marginBottom: 16 },
        sectionTitle: { ...Typography.subtitle, fontWeight: '600', color: colors.text },

        addPlayerContainer: { backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, marginBottom: 24, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        inputRow: { flexDirection: 'row', marginBottom: 16 },
        input: { ...Typography.body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: Layout.radiusMd, color: colors.text },
        inputNum: { ...Typography.body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: Layout.radiusMd, color: colors.text, textAlign: 'center' },
        addPlayerBtn: { flexDirection: 'row', backgroundColor: 'transparent', padding: 12, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary },
        addPlayerBtnText: { ...Typography.button, color: colors.primary, marginLeft: 8 },

        rosterList: { marginBottom: 24 },
        playerCard: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        playerInfo: { flexDirection: 'row', alignItems: 'center' },
        playerNumberBox: { width: 36, height: 36, borderRadius: Layout.radiusSm, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
        playerNumberText: { ...Typography.body, fontWeight: '700', color: colors.textSecondary },
        playerNameText: { ...Typography.body, fontWeight: '600' },
        playerDelBtn: { padding: 8 },

        historyCard: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        historyMatchInfo: { flex: 1, paddingRight: 10 },
        historyOpponent: { ...Typography.body, fontWeight: '600', marginBottom: 4 },
        historyDate: { ...Typography.bodySmall },
        historyScoreBox: { backgroundColor: colors.surfaceSecondary, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Layout.radiusSm },
        historyScoreText: { ...Typography.title, fontSize: 18 },

        deleteTeamBtn: { flexDirection: 'row', backgroundColor: colors.errorBg, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 32 },
        deleteTeamBtnText: { ...Typography.button, color: colors.error, marginLeft: 8 },

        filterChip: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Layout.radiusFull, borderWidth: 1, borderColor: colors.border },
        filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        filterChipText: { ...Typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
        filterChipTextActive: { color: colors.onPrimary },

        statCard: { flex: 1, backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...Layout.shadow },
        statValue: { ...Typography.title, fontSize: 32, marginBottom: 4 },
        statLabel: { ...Typography.bodySmall, textAlign: 'center', fontSize: 11 },

        permissionsBtn: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...Layout.shadow },
        permissionsBtnText: { ...Typography.button, color: colors.primary, marginLeft: 8 },

        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
        modalContent: { backgroundColor: colors.background, borderTopLeftRadius: Layout.radiusLg, borderTopRightRadius: Layout.radiusLg, padding: Layout.padding, paddingTop: 32, paddingBottom: Platform.OS === 'ios' ? 40 : 24, ...Layout.shadow },
        modalTitle: { ...Typography.title, fontSize: 20 },
        modalSub: { ...Typography.bodySmall },
        
        permissionsList: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, paddingHorizontal: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        permissionRow: { flexDirection: 'row', paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
        permissionEmail: { ...Typography.body, fontWeight: '600' },
        permissionRole: { ...Typography.bodySmall, color: colors.primary, marginTop: 2 },
        
        addPermissionBox: { backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        inputLabel: { ...Typography.label, marginBottom: 8 },
        addPermissionBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
        addPermissionBtnText: { ...Typography.button, color: colors.onPrimary }
    });
}
