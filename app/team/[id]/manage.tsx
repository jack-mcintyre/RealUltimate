import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../../firebaseConfig';
import { TeamService } from '../../services/TeamService';
import { Player, Team, TeamJoinCodes } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';

const parseRosterLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const numberMatch = trimmed.match(/^#?(\d{1,3})[\s,.-]+(.+)$/);
    const namePart = (numberMatch ? numberMatch[2] : trimmed)
        .replace(/\b(O-Line|D-Line|O|D|Flex|Handler|Cutter|Hybrid)\b/gi, '')
        .replace(/[|,]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const lower = trimmed.toLowerCase();
    const primaryLine = /\bd-line\b|\bd\b/.test(lower) ? 'D' : /\bo-line\b|\bo\b/.test(lower) ? 'O' : 'flex';
    const position = lower.includes('handler') ? 'handler' : lower.includes('cutter') ? 'cutter' : 'hybrid';

    return {
        name: namePart || trimmed,
        number: numberMatch?.[1] || '',
        primaryLine: primaryLine as 'O' | 'D' | 'flex',
        position: position as 'handler' | 'cutter' | 'hybrid',
    };
};

export default function TeamManageScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const [team, setTeam] = useState<Team | null>(null);
    const [joinCodes, setJoinCodes] = useState<TeamJoinCodes | null>(null);
    const [playerName, setPlayerName] = useState('');
    const [playerNumber, setPlayerNumber] = useState('');
    const currentUserId = auth.currentUser?.uid || '';

    useEffect(() => {
        if (!id) return;
        const unsubTeam = TeamService.subscribeToTeam(id, setTeam);
        const unsubCodes = TeamService.subscribeToTeamJoinCodes(id, setJoinCodes);
        return () => {
            unsubTeam();
            unsubCodes();
        };
    }, [id]);

    if (!team) {
        return <View style={styles.center}><Text style={styles.muted}>Loading team...</Text></View>;
    }

    const isCoach = currentUserId === team.coachId;
    const isManager = !!team.managers?.[currentUserId];
    const canManage = isCoach || isManager;
    const players = Object.values(team.players || {}).sort((a, b) => (Number(a.number || 999) - Number(b.number || 999)) || a.name.localeCompare(b.name));

    const requireManage = () => {
        if (canManage) return true;
        Alert.alert('Permission needed', 'Only team coaches/managers can manage this roster.');
        return false;
    };

    const addPlayer = async () => {
        if (!requireManage() || !playerName.trim()) return;
        try {
            await TeamService.addPlayer(team.id, playerName.trim(), currentUserId, playerNumber.trim());
            setPlayerName('');
            setPlayerNumber('');
        } catch {
            Alert.alert('Could not add player', 'Check your connection and try again.');
        }
    };

    const pasteRoster = async () => {
        if (!requireManage()) return;
        const clipboard = await Clipboard.getStringAsync();
        const parsed = clipboard
            .split(/\r?\n/)
            .map(parseRosterLine)
            .filter(Boolean)
            .slice(0, 80) as { name: string; number: string; primaryLine: 'O' | 'D' | 'flex'; position: 'handler' | 'cutter' | 'hybrid' }[];

        if (!parsed.length) {
            Alert.alert('Paste Roster', 'Copy one player per line first. Optional format: "#12 Jane Smith O Handler".');
            return;
        }

        try {
            for (const player of parsed) {
                await TeamService.addPlayer(team.id, player.name, currentUserId, player.number, player.primaryLine, player.position);
            }
            Alert.alert('Roster imported', `Added ${parsed.length} players.`);
        } catch {
            Alert.alert('Import failed', 'Could not import this roster.');
        }
    };

    const removePlayer = (player: Player) => {
        if (!requireManage()) return;
        Alert.alert('Remove Player', `Remove ${player.name} from roster?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () => TeamService.removePlayer(team.id, player.id, currentUserId).catch(() => Alert.alert('Error', 'Failed to remove player.')),
            },
        ]);
    };

    const changeRole = (uid: string) => {
        if (!isCoach) {
            Alert.alert('Head coach only', 'Only the head coach can change manager roles.');
            return;
        }
        Alert.alert('Change Role', 'Select a role for this manager.', [
            { text: 'Assistant Coach', onPress: () => TeamService.updateManagerRole(team.id, uid, 'Assistant Coach', currentUserId) },
            { text: 'Stats Taker', onPress: () => TeamService.updateManagerRole(team.id, uid, 'Stats Taker', currentUserId) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    const removeManager = (uid: string) => {
        if (!isCoach) {
            Alert.alert('Head coach only', 'Only the head coach can remove managers.');
            return;
        }
        Alert.alert('Remove Manager', 'Remove this user from team managers?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => TeamService.removeManager(team.id, uid, currentUserId) },
        ]);
    };

    const copyCoachCode = async () => {
        const code = joinCodes?.coach || team.accessCode;
        if (!code) return;
        await Clipboard.setStringAsync(code);
        Alert.alert('Coach code copied', 'Share this with someone you trust to add them as a coach/manager.');
    };

    return (
        <View style={styles.root}>
            <View style={styles.topBar}>
                <TouchableOpacity style={styles.circleBtn} onPress={() => router.back()} activeOpacity={0.75}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topTitle} numberOfLines={1}>Manage {team.name}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Add Player</Text>
                    <View style={styles.inputRow}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Player name" placeholderTextColor={colors.textSecondary} value={playerName} onChangeText={setPlayerName} />
                        <TextInput style={styles.numberInput} placeholder="#" placeholderTextColor={colors.textSecondary} value={playerNumber} onChangeText={setPlayerNumber} keyboardType="numeric" />
                    </View>
                    <TouchableOpacity style={styles.primaryBtn} onPress={addPlayer} activeOpacity={0.85}>
                        <Ionicons name="add" size={18} color={colors.onPrimary} />
                        <Text style={styles.primaryBtnText}>Add Player</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={pasteRoster} activeOpacity={0.82}>
                        <Ionicons name="clipboard-outline" size={17} color={colors.primary} />
                        <Text style={styles.secondaryBtnText}>Paste Roster From Clipboard</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Roster</Text>
                    {players.map((player) => (
                        <View key={player.id} style={styles.playerRow}>
                            <TouchableOpacity style={styles.playerMain} onPress={() => router.push(`/team/${team.id}/player/${player.id}` as any)} activeOpacity={0.75}>
                                <Text style={styles.playerNumber}>{player.number || '--'}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
                                    <Text style={styles.playerMeta}>{player.primaryLine || 'flex'} · {player.position || 'hybrid'}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.deleteBtn} onPress={() => removePlayer(player)} activeOpacity={0.8}>
                                <Ionicons name="trash-outline" size={18} color={colors.error} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Team Permissions</Text>
                    <Text style={styles.muted}>To add a coach, share the coach code. They join from the Teams hub, then appear here for role management.</Text>
                    <TouchableOpacity style={styles.codeBtn} onPress={copyCoachCode} activeOpacity={0.82}>
                        <Text style={styles.codeLabel}>COACH CODE</Text>
                        <Text style={styles.codeText}>{joinCodes?.coach || team.accessCode || 'N/A'}</Text>
                    </TouchableOpacity>
                    {Object.entries(team.managers || {}).map(([uid, manager]) => (
                        <View key={uid} style={styles.managerRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.managerEmail}>{manager.displayName || manager.email}</Text>
                                <TouchableOpacity disabled={manager.role === 'Head Coach'} onPress={() => changeRole(uid)}>
                                    <Text style={styles.managerRole}>{manager.role}{manager.role !== 'Head Coach' ? ' · tap to change' : ''}</Text>
                                </TouchableOpacity>
                            </View>
                            {manager.role !== 'Head Coach' && (
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeManager(uid)} activeOpacity={0.8}>
                                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
        topBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
        topTitle: { ...Typography.title, fontSize: 18, flex: 1, textAlign: 'center' },
        content: { padding: Layout.padding, paddingBottom: 44, gap: 16 },
        card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusLg, padding: 16, ...Layout.shadow },
        cardTitle: { ...Typography.subtitle, color: colors.text, fontWeight: '900', marginBottom: 12 },
        muted: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 19 },
        inputRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
        input: { ...Typography.body, color: colors.text, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingHorizontal: 12, paddingVertical: 12 },
        numberInput: { ...Typography.body, color: colors.text, width: 78, textAlign: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingHorizontal: 12, paddingVertical: 12 },
        primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: Layout.radiusMd, paddingVertical: 13, marginBottom: 9 },
        primaryBtnText: { ...Typography.button, color: colors.onPrimary },
        secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary, borderRadius: Layout.radiusMd, paddingVertical: 12 },
        secondaryBtnText: { ...Typography.button, color: colors.primary, fontSize: 13 },
        playerRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 8 },
        playerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
        playerNumber: { ...Typography.bodySmall, color: colors.textSecondary, width: 32, textAlign: 'right', fontWeight: '900' },
        playerName: { ...Typography.body, color: colors.text, fontWeight: '800' },
        playerMeta: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
        deleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: colors.errorBg },
        codeBtn: { alignSelf: 'flex-start', marginTop: 12, marginBottom: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingHorizontal: 14, paddingVertical: 10 },
        codeLabel: { ...Typography.label, marginBottom: 4 },
        codeText: { ...Typography.title, color: colors.primary, fontSize: 20, letterSpacing: 2 },
        managerRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 12 },
        managerEmail: { ...Typography.body, color: colors.text, fontWeight: '700' },
        managerRole: { ...Typography.bodySmall, color: colors.primary, marginTop: 2 },
    });
};
