import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { TournamentService } from '../services/TournamentService';
import { Tournament, TournamentMatch, TournamentMatchStatus, TournamentSpiritScore } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';
import SceneShell from '../components/SceneShell';

const toStringParam = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
};

const matchSort = (left: TournamentMatch, right: TournamentMatch) => {
    if (left.round !== right.round) return left.round - right.round;
    return left.id.localeCompare(right.id);
};

type TabKey = 'overview' | 'pools' | 'bracket' | 'teams' | 'activity';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'pools', label: 'Pools' },
    { key: 'bracket', label: 'Bracket' },
    { key: 'teams', label: 'Teams' },
    { key: 'activity', label: 'Activity' },
];

const SLOT_HEIGHT = 90; // Base vertical height per slot in Round 1
const MATCH_HEIGHT = 72; // Actual height of the match card
const COL_WIDTH = 200;
const COL_GAP = 32;

export default function TournamentDetailScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const params = useLocalSearchParams<{ id?: string }>();

    const tournamentId = toStringParam(params.id);

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');

    const [scoreDrafts, setScoreDrafts] = useState<Record<string, { a: string; b: string }>>({});
    const [savingMatchId, setSavingMatchId] = useState('');

    const [spiritEditorOpen, setSpiritEditorOpen] = useState(false);
    const [spiritTargetId, setSpiritTargetId] = useState('');
    const [spiritInputs, setSpiritInputs] = useState({ rules: '0', fouls: '0', fairness: '0', attitude: '0', communication: '0' });
    
    const [matchEditorOpen, setMatchEditorOpen] = useState(false);
    const [editingMatchId, setEditingMatchId] = useState('');
    const [editingMatchTime, setEditingMatchTime] = useState('');

    const [addTeamCode, setAddTeamCode] = useState('');
    const [joinModalOpen, setJoinModalOpen] = useState(false);
    const [joinTeamName, setJoinTeamName] = useState('');
    const [editParticipantId, setEditParticipantId] = useState('');
    const [editParticipantName, setEditParticipantName] = useState('');
    const [editParticipantPool, setEditParticipantPool] = useState('');
    const [participantModalOpen, setParticipantModalOpen] = useState(false);

    const [customMatchModalOpen, setCustomMatchModalOpen] = useState(false);
    const [customMatchTeamA, setCustomMatchTeamA] = useState('');
    const [customMatchTeamB, setCustomMatchTeamB] = useState('');

    const [overrideMatchModalOpen, setOverrideMatchModalOpen] = useState(false);
    const [overrideMatchSlot, setOverrideMatchSlot] = useState<'A' | 'B'>('A');
    const [overrideMatchTeamName, setOverrideMatchTeamName] = useState('');

    const [newAnnouncement, setNewAnnouncement] = useState('');

    const [editingMatchField, setEditingMatchField] = useState('');
    const [editingMatchDay, setEditingMatchDay] = useState('');
    const [editingMatchStatus, setEditingMatchStatus] = useState<TournamentMatchStatus>('upcoming');
    const [roomMessageDraft, setRoomMessageDraft] = useState('');
    const [dayFilter, setDayFilter] = useState<number | null>(null);
    const [holdReason, setHoldReason] = useState('');

    const isCreator = !!tournament?.admins?.[auth.currentUser?.uid || ''];

    const scrollY = useRef(new Animated.Value(0)).current;

    const headerPadding = scrollY.interpolate({ inputRange: [0, 100], outputRange: [60, 20], extrapolate: 'clamp' });
    const subtitleOpacity = scrollY.interpolate({ inputRange: [0, 40], outputRange: [1, 0], extrapolate: 'clamp' });
    const subtitleHeight = scrollY.interpolate({ inputRange: [0, 40], outputRange: [20, 0], extrapolate: 'clamp' });

    useEffect(() => {
        if (!tournamentId) return;
        const unsubscribe = TournamentService.subscribeToTournament(tournamentId, (next) => {
            setTournament(next);
        });
        return () => unsubscribe();
    }, [tournamentId]);

    useEffect(() => {
        if (!tournament) return;
        const nextDrafts: Record<string, { a: string; b: string }> = {};
        Object.values(tournament.matches || {}).forEach((match) => {
            nextDrafts[match.id] = {
                a: typeof match.teamAScore === 'number' ? String(match.teamAScore) : '',
                b: typeof match.teamBScore === 'number' ? String(match.teamBScore) : '',
            };
        });
        setScoreDrafts(nextDrafts);
    }, [tournament]);

    const participantName = (participantId: string) => {
        if (!participantId) return 'TBD';
        if (participantId === 'BYE') return 'BYE';
        return tournament?.participants?.[participantId]?.name || 'TBD';
    };

    const startTournamentRecording = (match: TournamentMatch, slot: 'A' | 'B') => {
        if (!tournament) return;
        const participantId = slot === 'A' ? match.teamAId : match.teamBId;
        const opponentId = slot === 'A' ? match.teamBId : match.teamAId;
        const participant = tournament.participants?.[participantId];
        const opponent = tournament.participants?.[opponentId];

        if (!participant?.linkedTeamId) {
            Alert.alert('Team link required', 'This participant needs to be linked to a RealUltimate team before coaches can start a linked recording.');
            return;
        }

        router.push({
            pathname: '/game/record/[teamId]',
            params: {
                teamId: participant.linkedTeamId,
                prefOpponentName: opponent?.name || 'Opponent',
                prefOpponentTeamId: opponent?.linkedTeamId || '',
                tournamentId: tournament.id,
                tournamentMatchId: match.id,
                tournamentParticipantId: participantId,
                tournamentSlot: slot,
            },
        });
    };

    const participantSeed = (participantId: string): number | undefined => {
        if (!participantId || participantId === 'BYE') return undefined;
        return tournament?.participants?.[participantId]?.seed;
    };

    const formatBracketName = (participantId: string, match: TournamentMatch, slot: 'A' | 'B') => {
        if (participantId && participantId !== 'BYE') {
            return tournament?.participants?.[participantId]?.name || 'TBD';
        }
        if (participantId === 'BYE') return 'BYE';
        if (match.round > 1) return `Winner of Round ${match.round - 1}`;
        if (match.stage === 'consolation') return 'Non-Qualifier';
        return 'Qualifier';
    };

    const openMatchEditor = (matchId: string) => {
        const match = tournament?.matches?.[matchId];
        setEditingMatchId(matchId);
        setEditingMatchTime(match?.scheduledTime || '');
        setEditingMatchField(match?.fieldName || '');
        setEditingMatchDay(match?.day ? String(match.day) : '');
        setEditingMatchStatus(match?.matchStatus || 'upcoming');
        setRoomMessageDraft('');
        setMatchEditorOpen(true);
    };

    const sendMatchRoomMessage = async () => {
        if (!tournament || !editingMatchId || !auth.currentUser?.uid || !roomMessageDraft.trim()) return;
        try {
            await TournamentService.appendMatchRoomMessage(tournament.id, editingMatchId, auth.currentUser.uid, roomMessageDraft);
            setRoomMessageDraft('');
        } catch (error: any) {
            Alert.alert('Message Failed', error?.message || 'Could not send match room message.');
        }
    };

    const openEditParticipant = (t: any) => {
        setEditParticipantId(t.id);
        setEditParticipantName(t.name);
        setEditParticipantPool(tournament?.manualPoolAssignments?.[t.id] || '');
        setParticipantModalOpen(true);
    };

    const handleSaveScore = async (matchId: string) => {
        if (!tournament) return;
        const draft = scoreDrafts[matchId];
        if (!draft) return;

        const a = Number(draft.a);
        const b = Number(draft.b);

        if (!Number.isFinite(a) || !Number.isFinite(b)) {
            Alert.alert('Invalid score', 'Enter numeric values for both teams.');
            return;
        }

        try {
            setSavingMatchId(matchId);
            await TournamentService.updateMatchScore(tournament.id, matchId, a, b);
            if (editingMatchTime !== (tournament.matches?.[matchId]?.scheduledTime || '')) {
                await TournamentService.updateMatchScheduledTime(tournament.id, matchId, editingMatchTime);
            }
        } catch (error: any) {
            Alert.alert('Save failed', error?.message || 'Could not save match score.');
        } finally {
            setSavingMatchId('');
        }
    };

    const openSpiritEditor = (participantId: string) => {
        if (!tournament?.spiritScores?.[participantId]) return;
        const row = tournament.spiritScores[participantId];
        setSpiritTargetId(participantId);
        setSpiritInputs({
            rules: String(row.rules),
            fouls: String(row.fouls),
            fairness: String(row.fairness),
            attitude: String(row.attitude),
            communication: String(row.communication),
        });
        setSpiritEditorOpen(true);
    };

    const saveSpiritScore = async () => {
        if (!tournament || !spiritTargetId) return;

        const payload = {
            rules: Number(spiritInputs.rules),
            fouls: Number(spiritInputs.fouls),
            fairness: Number(spiritInputs.fairness),
            attitude: Number(spiritInputs.attitude),
            communication: Number(spiritInputs.communication),
        };

        const allNumeric = Object.values(payload).every((value) => Number.isFinite(value));
        if (!allNumeric) {
            Alert.alert('Invalid values', 'All spirit categories must be numeric (0-4).');
            return;
        }

        try {
            await TournamentService.updateSpiritScore(tournament.id, spiritTargetId, payload);
            setSpiritEditorOpen(false);
        } catch (error: any) {
            Alert.alert('Save failed', error?.message || 'Could not save spirit score.');
        }
    };

    // Derived Data
    const standingsRows = useMemo(() => {
        if (!tournament?.standings) return [];
        return Object.values(tournament.standings).sort((left, right) => {
            if (right.wins !== left.wins) return right.wins - left.wins;
            if (right.pointDiff !== left.pointDiff) return right.pointDiff - left.pointDiff;
            return right.pointsFor - left.pointsFor;
        });
    }, [tournament]);

    const poolMatches = useMemo(() => {
        if (!tournament?.matches) return [];
        return Object.values(tournament.matches).filter(m => m.stage === 'pool').sort(matchSort);
    }, [tournament]);

    const championshipMatches = useMemo(() => {
        if (!tournament?.matches) return [];
        return Object.values(tournament.matches).filter(m => m.stage === 'championship').sort(matchSort);
    }, [tournament]);

    const consolationMatches = useMemo(() => {
        if (!tournament?.matches) return [];
        return Object.values(tournament.matches).filter(m => m.stage === 'consolation').sort(matchSort);
    }, [tournament]);

    const allTeams = useMemo(() => {
        if (!tournament?.participants) return [];
        return Object.values(tournament.participants).filter(p => p.id !== 'BYE');
    }, [tournament]);

    const visibleTabs = useMemo(() => {
        if (!tournament) return TABS;
        return TABS.filter((tab) => {
            if (tab.key === 'bracket' && tournament.publicBracketEnabled === false && !isCreator) return false;
            return true;
        });
    }, [isCreator, tournament]);

    useEffect(() => {
        if (!visibleTabs.some((tab) => tab.key === activeTab)) {
            setActiveTab('overview');
        }
    }, [activeTab, visibleTabs]);

    if (!tournamentId) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.emptyText}>Missing route parameters.</Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backBtnText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!tournament) {
        return (
            <View style={[styles.container, styles.centered]}>
                <Text style={styles.emptyText}>Loading tournament data...</Text>
            </View>
        );
    }

    // Tab Renderers
    const renderOverview = () => (
        <View style={styles.tabContent}>
            <View style={styles.infoBox}>
                {tournament.hostName && (
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Host Team</Text>
                        <Text style={styles.infoValue}>{tournament.hostName}</Text>
                    </View>
                )}
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Format</Text>
                    <Text style={styles.infoValue}>{tournament.engine === 'single_elim' ? 'Single Elimination' : 'Pools to Bracket'}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Privacy</Text>
                    <Text style={styles.infoValue}>{tournament.privacy === 'public' ? 'Public Directory' : 'Private (Code Only)'}</Text>
                </View>
            </View>
            {tournament.bio ? (
                <View style={styles.infoBox}>
                    <Text style={styles.infoLabel}>Bio</Text>
                    <Text style={[styles.infoValue, { marginTop: 4, lineHeight: 20 }]}>{tournament.bio}</Text>
                </View>
            ) : null}

            {(tournament.venueName || tournament.venueAddress || tournament.parkingInfo || tournament.medicalInfo || tournament.weatherPolicy || tournament.scheduleNotes || tournament.sponsorLine || tournament.publicContactEmail) && (
                <View style={styles.logisticsCard}>
                    <View style={styles.logisticsHeader}>
                        <Ionicons name="map-outline" size={20} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.logisticsTitle}>{tournament.venueName || 'Tournament Logistics'}</Text>
                            {!!tournament.sponsorLine && <Text style={styles.logisticsSub}>{tournament.sponsorLine}</Text>}
                        </View>
                    </View>
                    {!!tournament.venueAddress && <Text style={styles.logisticsLine}>Address: {tournament.venueAddress}</Text>}
                    {!!tournament.parkingInfo && <Text style={styles.logisticsLine}>Parking/check-in: {tournament.parkingInfo}</Text>}
                    {!!tournament.medicalInfo && <Text style={styles.logisticsLine}>Medical/safety: {tournament.medicalInfo}</Text>}
                    {!!tournament.weatherPolicy && <Text style={styles.logisticsLine}>Weather policy: {tournament.weatherPolicy}</Text>}
                    {!!tournament.scheduleNotes && <Text style={styles.logisticsLine}>Schedule notes: {tournament.scheduleNotes}</Text>}
                    {!!tournament.publicContactEmail && <Text style={styles.logisticsLine}>Contact: {tournament.publicContactEmail}</Text>}
                </View>
            )}

            {/* Schedule Hold Banner */}
            {tournament.scheduleHold?.active && (
                <View style={{ backgroundColor: '#FF9500', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="warning" size={20} color="#FFF" />
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 14 }}>SCHEDULE SUSPENDED</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 }}>{tournament.scheduleHold.reason || 'Schedule on hold'}</Text>
                    </View>
                    {isCreator && (
                        <TouchableOpacity style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }} onPress={async () => {
                            await TournamentService.setScheduleHold(tournament.id, false);
                        }}>
                            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Resume</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {/* Schedule Hold Control (organizer only, when not on hold) */}
            {isCreator && tournament.status === 'active' && !tournament.scheduleHold?.active && (
                <View style={[styles.infoBox, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <TextInput
                        style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, fontSize: 13, backgroundColor: colors.surfaceSecondary }}
                        placeholder="Delay reason (e.g. Weather)"
                        placeholderTextColor={colors.textSecondary}
                        value={holdReason}
                        onChangeText={setHoldReason}
                    />
                    <TouchableOpacity style={{ backgroundColor: '#FF9500', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }} onPress={async () => {
                        await TournamentService.setScheduleHold(tournament.id, true, holdReason || 'Weather delay');
                        setHoldReason('');
                    }}>
                        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Pause</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isCreator && (
                <View style={[styles.infoBox, { borderColor: colors.primary, backgroundColor: colors.surfaceSecondary, flexDirection: 'row', alignItems: 'center' }]}>
                    <TextInput 
                        style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginRight: 10, color: colors.text, backgroundColor: colors.surface, fontSize: 14 }}
                        placeholder="Post new announcement..."
                        placeholderTextColor={colors.textSecondary}
                        value={newAnnouncement}
                        onChangeText={setNewAnnouncement}
                    />
                    <TouchableOpacity style={{ backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10 }} onPress={async () => {
                        if (!newAnnouncement.trim()) return;
                        try {
                            await TournamentService.postAnnouncement(tournament.id, newAnnouncement.trim());
                            setNewAnnouncement('');
                        } catch (e: any) {
                            Alert.alert('Error', e.message);
                        }
                    }}>
                        <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 14 }}>Post</Text>
                    </TouchableOpacity>
                </View>
            )}

            {tournament.announcementFeed && tournament.announcementFeed.length > 0 ? (
                <View style={styles.infoBox}>
                    <Text style={[styles.infoLabel, { color: colors.primary, fontWeight: 'bold', marginBottom: 12 }]}>Announcements</Text>
                    {tournament.announcementFeed.map((ann, idx) => (
                        <View key={ann.id} style={{ marginBottom: idx === tournament.announcementFeed!.length - 1 ? 0 : 12, paddingBottom: idx === tournament.announcementFeed!.length - 1 ? 0 : 12, borderBottomWidth: idx === tournament.announcementFeed!.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                            <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 4 }}>{new Date(ann.timestamp).toLocaleString()}</Text>
                            <Text style={[styles.infoValue, { lineHeight: 20 }]}>{ann.message}</Text>
                        </View>
                    ))}
                </View>
            ) : tournament.announcements ? (
                <View style={[styles.infoBox, { borderColor: colors.primary, backgroundColor: colors.surfaceSecondary }]}>
                    <Text style={[styles.infoLabel, { color: colors.primary, fontWeight: 'bold' }]}>Announcements</Text>
                    <Text style={[styles.infoValue, { marginTop: 4, lineHeight: 20 }]}>{tournament.announcements}</Text>
                </View>
            ) : null}

            <View style={styles.infoBox}>
                <Text style={styles.infoLabel}>Tournament Engine Explanation:</Text>
                <Text style={[styles.infoValue, { marginTop: 4, lineHeight: 20 }]}>
                    {tournament.engine === 'single_elim' 
                        ? 'This tournament runs a strict single-elimination bracket. Teams are seeded into matchups, and the loser of each match is eliminated until a champion is crowned.' 
                        : 'This tournament uses a standard Ultimate Frisbee format: Teams first play round-robin games in their assigned pools. Once pool play is fully completed, teams are ranked by Record and Point Differential. The top teams automatically advance to the Championship Bracket.'}
                </Text>
            </View>

            {standingsRows.length > 0 && (
                <View style={styles.tableCard}>
                    <View style={styles.tableHeader}>
                        <Text style={styles.tableTitle}>Final Standings</Text>
                    </View>
                    <View style={styles.tableColHeaders}>
                        <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'left' }]}>TEAM</Text>
                        <Text style={[styles.tableColHeader, { width: 50, textAlign: 'center' }]}>W-L</Text>
                        <TouchableOpacity style={[styles.tooltipHeader, { justifyContent: 'center', alignItems: 'flex-end', width: 44 }]} onPress={() => Alert.alert('Point Differential', 'Total points scored minus total points allowed. Used as the primary tiebreaker.')}>
                            <Text style={[styles.tableColHeader, { textAlign: 'right', textDecorationLine: 'underline', textDecorationStyle: 'dotted' }]}>PD</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.tooltipHeader, { justifyContent: 'center', alignItems: 'flex-end', width: 62 }]} onPress={() => Alert.alert('Spirit Score', 'A 0-25 score assessing how well teams followed the rules, avoided fouls, and maintained a positive attitude.')}>
                            <Text style={[styles.tableColHeader, { textAlign: 'right', textDecorationLine: 'underline', textDecorationStyle: 'dotted' }]}>SPIRIT</Text>
                        </TouchableOpacity>
                    </View>
                    {standingsRows.map((row, index) => {
                        const participant = tournament?.participants?.[row.participantId];
                        return (
                        <View key={row.participantId} style={styles.tableRow}>
                            <Text style={styles.tableRank}>{index + 1}.</Text>
                            <TouchableOpacity 
                                style={{ flex: 1 }} 
                                onPress={() => participant?.linkedTeamId && router.push(`/team/${participant.linkedTeamId}`)}
                                activeOpacity={participant?.linkedTeamId ? 0.7 : 1}
                            >
                                <Text style={[styles.tableName, participant?.linkedTeamId && { textDecorationLine: 'underline' }]} numberOfLines={1}>
                                    {participantName(row.participantId)}
                                </Text>
                            </TouchableOpacity>
                            <Text style={styles.tableStat}>{row.wins}-{row.losses}</Text>
                            <Text style={styles.tableStat}>{row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}</Text>
                            <TouchableOpacity style={styles.spiritTapArea} onPress={() => openSpiritEditor(row.participantId)}>
                                <Text style={styles.tableStatSpirit}>
                                    {tournament?.spiritScores?.[row.participantId]?.total || '0'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )})}
                </View>
            )}
        </View>
    );

    const renderPools = () => (
        <View style={styles.tabContent}>
            {isCreator && tournament.status === 'draft' && (
                <TouchableOpacity style={[styles.backBtn, { alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={() => router.push(`/tournament/pool-config/${tournament.id}`)}>
                    <Ionicons name="options-outline" size={16} color={colors.text} />
                    <Text style={styles.backBtnText}>Pool Configuration</Text>
                </TouchableOpacity>
            )}
            {isCreator && tournament.status === 'active' && (
                <TouchableOpacity style={[styles.backBtn, { alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setCustomMatchModalOpen(true)}>
                    <Ionicons name="add" size={16} color="#FFF" />
                    <Text style={[styles.backBtnText, { color: '#FFF' }]}>Add Custom Match</Text>
                </TouchableOpacity>
            )}
            {/* Day Filter */}
            {tournament.scheduleDays && tournament.scheduleDays > 1 && (
                <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 8 }}>
                    <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: dayFilter === null ? colors.primary : colors.surfaceSecondary, borderWidth: 1, borderColor: dayFilter === null ? colors.primary : colors.border }} onPress={() => setDayFilter(null)}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: dayFilter === null ? '#FFF' : colors.textSecondary }}>All</Text>
                    </TouchableOpacity>
                    {Array.from({ length: tournament.scheduleDays }, (_, i) => i + 1).map(d => (
                        <TouchableOpacity key={d} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: dayFilter === d ? colors.primary : colors.surfaceSecondary, borderWidth: 1, borderColor: dayFilter === d ? colors.primary : colors.border }} onPress={() => setDayFilter(d)}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: dayFilter === d ? '#FFF' : colors.textSecondary }}>Day {d}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            {poolMatches.length === 0 ? (
                <Text style={styles.emptyText}>No pool play matches generated.</Text>
            ) : (
                <View style={styles.listCard}>
                    {poolMatches.filter(m => dayFilter === null || m.day === dayFilter).map(m => {
                        const statusColor = m.matchStatus === 'in_progress' ? '#34C759' : m.matchStatus === 'final' ? colors.textSecondary : m.matchStatus === 'cancelled' ? '#FF3B30' : colors.border;
                        const showAssignmentMeta = isCreator || tournament.fieldAssignmentPublic !== false;
                        return (
                        <TouchableOpacity key={m.id} style={[styles.poolMatchCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, gap: 8 }]} onPress={() => openMatchEditor(m.id)} activeOpacity={0.7}>
                            {/* Meta Left Side */}
                            <View style={{ width: 50, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border, paddingRight: 8 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor, marginBottom: 4 }} />
                                <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.textSecondary, textAlign: 'center' }} numberOfLines={2}>
                                    {m.group ? `R${m.round} ${m.group}` : m.bracketIdentifier || `R${m.round}`}
                                </Text>
                                {showAssignmentMeta && m.fieldName && (
                                    <Text style={{ fontSize: 8, color: colors.primary, marginTop: 2, textAlign: 'center', fontWeight: 'bold' }} numberOfLines={1}>{m.fieldName}</Text>
                                )}
                                {showAssignmentMeta && m.scheduledTime && (
                                    <Text style={{ fontSize: 8, color: colors.textSecondary, marginTop: 1, textAlign: 'center' }} numberOfLines={1}>{m.scheduledTime}</Text>
                                )}
                                {m.verificationStatus === 'challenged' && (
                                    <Ionicons name="warning" size={10} color={colors.warning} style={{ marginTop: 2 }} />
                                )}
                            </View>

                            {/* Teams and Score Right Side */}
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                {/* Team A */}
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                    {participantSeed(m.teamAId) != null && <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textSecondary }}>{participantSeed(m.teamAId)}</Text>}
                                    <Text style={[styles.poolTeamName, { fontSize: 13, fontWeight: (m.teamAScore ?? 0) > (m.teamBScore ?? 0) ? '800' : '500', textAlign: 'right', flexShrink: 1 }]} numberOfLines={2}>
                                        {participantName(m.teamAId)}
                                    </Text>
                                    {m.captainCheckIn?.teamA && <Ionicons name="checkmark-circle" size={10} color="#34C759" />}
                                </View>

                                {/* Score */}
                                <View style={{ paddingHorizontal: 10, alignItems: 'center' }}>
                                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }}>
                                        {m.teamAScore ?? '-'} <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>-</Text> {m.teamBScore ?? '-'}
                                    </Text>
                                </View>

                                {/* Team B */}
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
                                    {m.captainCheckIn?.teamB && <Ionicons name="checkmark-circle" size={10} color="#34C759" />}
                                    <Text style={[styles.poolTeamName, { fontSize: 13, fontWeight: (m.teamBScore ?? 0) > (m.teamAScore ?? 0) ? '800' : '500', textAlign: 'left', flexShrink: 1 }]} numberOfLines={2}>
                                        {participantName(m.teamBId)}
                                    </Text>
                                    {participantSeed(m.teamBId) != null && <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textSecondary }}>{participantSeed(m.teamBId)}</Text>}
                                </View>
                            </View>
                        </TouchableOpacity>
                    )})}
                </View>
            )}

            {/* Per-Pool Standings */}
            {tournament.pools && Object.keys(tournament.pools).length > 0 && standingsRows.length > 0 && (
                <>
                    {Object.entries(tournament.pools).sort(([a], [b]) => a.localeCompare(b)).map(([poolKey, teamIds]) => {
                        const poolStandings = standingsRows.filter(r => (teamIds as string[]).includes(r.participantId));
                        if (poolStandings.length === 0) return null;
                        return (
                            <View key={poolKey} style={[styles.listCard, { marginTop: 16 }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                    <Text style={{ fontWeight: '800', fontSize: 14, color: colors.primary }}>Pool {poolKey} Standings</Text>
                                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{poolStandings.length} teams</Text>
                                </View>
                                <View style={{ paddingHorizontal: 14, paddingVertical: 4, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                    <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: colors.textSecondary }}>TEAM</Text>
                                    <Text style={{ width: 44, fontSize: 10, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' }}>W-L</Text>
                                    <Text style={{ width: 44, fontSize: 10, fontWeight: '600', color: colors.textSecondary, textAlign: 'right' }}>PD</Text>
                                </View>
                                {poolStandings.map((row, idx) => (
                                    <View key={row.participantId} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: idx < poolStandings.length - 1 ? 1 : 0, borderBottomColor: colors.border, backgroundColor: idx < (tournament.qualifiersPerPool || 2) ? colors.primary + '08' : 'transparent' }}>
                                        <Text style={{ width: 20, fontSize: 12, fontWeight: '700', color: idx < (tournament.qualifiersPerPool || 2) ? colors.primary : colors.textSecondary }}>{idx + 1}.</Text>
                                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>{participantName(row.participantId)}</Text>
                                        <Text style={{ width: 44, fontSize: 12, textAlign: 'center', color: colors.text }}>{row.wins}-{row.losses}</Text>
                                        <Text style={{ width: 44, fontSize: 12, textAlign: 'right', fontWeight: '600', color: row.pointDiff > 0 ? '#34C759' : row.pointDiff < 0 ? '#FF3B30' : colors.textSecondary }}>{row.pointDiff > 0 ? `+${row.pointDiff}` : row.pointDiff}</Text>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </>
            )}
        </View>
    );

    const renderBracketTree = (matches: TournamentMatch[], title: string) => {
        if (matches.length === 0) return null;

        const roundsMap: Record<number, TournamentMatch[]> = {};
        matches.forEach(m => {
            roundsMap[m.round] = roundsMap[m.round] || [];
            roundsMap[m.round].push(m);
        });
        const rounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
        
        return (
            <View style={styles.bracketSection}>
                <Text style={styles.bracketTitle}>{title}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.bracketCanvas}>
                    {rounds.map((r, colIndex) => {
                        const currentSlotHeight = SLOT_HEIGHT * Math.pow(2, colIndex);
                        const connectorHeight = colIndex > 0 ? SLOT_HEIGHT * Math.pow(2, colIndex - 1) : 0;
                        
                        return (
                            <View key={r} style={[styles.bracketColumn, { marginRight: colIndex === rounds.length - 1 ? 0 : COL_GAP }]}>
                                <Text style={styles.bracketRoundHeader}>Round {r}</Text>
                                {roundsMap[r].map((m) => {
                                    const isBye = m.teamBId === 'BYE';
                                    return (
                                        <View key={m.id} style={{ height: currentSlotHeight, justifyContent: 'center' }}>
                                            <TouchableOpacity 
                                                style={[styles.treeMatchCard, isBye && styles.treeMatchCardBye]}
                                                onPress={() => { if (!isBye) openMatchEditor(m.id); }}
                                                activeOpacity={isBye ? 1 : 0.7}
                                            >
                                                {m.scheduledTime && (
                                                    <Text style={{ position: 'absolute', top: -14, left: 8, fontSize: 10, color: colors.textSecondary }}>{m.scheduledTime}</Text>
                                                )}
                                                <View style={styles.treeTeamRow}>
                                                    <TouchableOpacity 
                                                        style={{ flex: 1, marginRight: 8, justifyContent: 'center' }} 
                                                        onPress={() => {
                                                            const linked = tournament?.participants?.[m.teamAId]?.linkedTeamId;
                                                            if (linked) router.push(`/team/${linked}`);
                                                        }}
                                                    >
                                                        <Text style={[styles.treeTeamName, !m.teamAId && { color: colors.textSecondary, fontStyle: 'italic' }, tournament?.participants?.[m.teamAId]?.linkedTeamId && { textDecorationLine: 'underline' }]} numberOfLines={1}>
                                                            {formatBracketName(m.teamAId, m, 'A')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <Text style={styles.treeTeamScore}>{m.teamAScore ?? '-'}</Text>
                                                </View>
                                                <View style={styles.treeTeamDivider} />
                                                <View style={styles.treeTeamRow}>
                                                    <TouchableOpacity 
                                                        style={{ flex: 1, marginRight: 8, justifyContent: 'center' }} 
                                                        onPress={() => {
                                                            const linked = tournament?.participants?.[m.teamBId]?.linkedTeamId;
                                                            if (linked) router.push(`/team/${linked}`);
                                                        }}
                                                    >
                                                        <Text style={[styles.treeTeamName, (!m.teamBId || isBye) && { color: colors.textSecondary, fontStyle: isBye ? 'normal' : 'italic' }, tournament?.participants?.[m.teamBId]?.linkedTeamId && { textDecorationLine: 'underline' }]} numberOfLines={1}>
                                                            {formatBracketName(m.teamBId, m, 'B')}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <Text style={styles.treeTeamScore}>{m.teamBScore ?? '-'}</Text>
                                                </View>
                                            </TouchableOpacity>

                                            {/* Liquipedia-style Bracket Connectors */}
                                            {colIndex > 0 && (
                                                <View style={[styles.connectorBox, { height: connectorHeight, marginTop: -(connectorHeight / 2) }]}>
                                                    {/* The closing bracket ] grabbing the two matches from previous round */}
                                                    <View style={styles.connectorBracket} />
                                                    {/* The horizontal line feeding into this match */}
                                                    <View style={styles.connectorLine} />
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })}

                    {title === "Championship Bracket" && rounds.length > 0 && (() => {
                        const finalMatch = roundsMap[rounds[rounds.length - 1]][0];
                        const winnerId = finalMatch?.winnerId;
                        return (
                            <View style={[styles.bracketColumn, { marginLeft: COL_GAP }]}>
                                <Text style={styles.bracketRoundHeader}>Champion</Text>
                                <View style={{ height: SLOT_HEIGHT * Math.pow(2, rounds.length - 1), justifyContent: 'center' }}>
                                    <View style={[styles.treeMatchCard, { backgroundColor: colors.primary, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 }]}>
                                        <Text style={[styles.treeTeamName, { color: '#FFF', fontWeight: 'bold', textAlign: 'center', fontSize: 16 }]} numberOfLines={2}>
                                            {winnerId && winnerId !== 'BYE' ? participantName(winnerId) : 'TBD'}
                                        </Text>
                                    </View>
                                    {/* Connector */}
                                    <View style={[styles.connectorBox, { height: 0, marginTop: 0 }]}>
                                        <View style={styles.connectorLine} />
                                    </View>
                                </View>
                            </View>
                        );
                    })()}
                </ScrollView>
            </View>
        );
    };

    const renderBracketTab = () => (
        <View style={styles.tabContent}>
            {isCreator && tournament.status === 'draft' && (
                <TouchableOpacity style={[styles.backBtn, { alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }]} onPress={() => router.push(`/tournament/bracket-config/${tournament.id}`)}>
                    <Ionicons name="git-network-outline" size={16} color={colors.text} />
                    <Text style={styles.backBtnText}>Bracket Configuration</Text>
                </TouchableOpacity>
            )}
            {championshipMatches.length === 0 && consolationMatches.length === 0 ? (
                <Text style={styles.emptyText}>Bracket not generated yet.</Text>
            ) : (
                <>
                    {renderBracketTree(championshipMatches, "Championship Bracket")}
                    {renderBracketTree(consolationMatches, "Consolation Bracket")}
                </>
            )}
        </View>
    );
    const renderActivityLog = () => {
        const log = tournament?.activityLog || [];
        const iconMap: Record<string, { name: string; color: string }> = {
            score: { name: 'football', color: '#34C759' },
            schedule: { name: 'time', color: '#FF9500' },
            system: { name: 'information-circle', color: colors.primary },
            announcement: { name: 'megaphone', color: '#AF52DE' },
        };
        return (
            <View style={styles.tabContent}>
                {log.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <Ionicons name="time-outline" size={40} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { marginTop: 12 }]}>No activity yet.</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>Score updates, schedule changes, and announcements will appear here.</Text>
                    </View>
                ) : (
                    <View style={styles.listCard}>
                        {log.map((entry, idx) => {
                            const icon = iconMap[entry.type] || iconMap.system;
                            return (
                                <View key={entry.id} style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: idx < log.length - 1 ? 1 : 0, borderBottomColor: colors.border, gap: 12 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: icon.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                                        <Ionicons name={icon.name as any} size={16} color={icon.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>{typeof entry.message === 'string' ? entry.message : typeof entry.message === 'object' ? (entry.message as any).message || 'Activity recorded' : 'Activity recorded'}</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 4 }}>{new Date(entry.timestamp).toLocaleString()}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </View>
        );
    };

    const handleAddParticipant = async () => {
        if (!addTeamCode.trim()) return;
        try {
            await TournamentService.addParticipant(tournament.id, { name: addTeamCode });
            setAddTeamCode('');
        } catch (e: any) {
            Alert.alert('Error', e.message);
        }
    };

    const renderTeams = () => (
        <View style={styles.tabContent}>
            {isCreator && tournament.status === 'draft' && (
                <View style={[styles.infoBox, { flexDirection: 'row', alignItems: 'center', marginBottom: 16 }]}>
                    <TextInput 
                        style={[styles.modalInput, { flex: 1, marginBottom: 0, marginRight: 8 }]}
                        placeholder="Team Name or Code..."
                        placeholderTextColor={colors.textSecondary}
                        value={addTeamCode}
                        onChangeText={setAddTeamCode}
                    />
                    <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary, { flex: 0, paddingHorizontal: 16 }]} onPress={handleAddParticipant}>
                        <Text style={styles.modalBtnTextPrimary}>Add</Text>
                    </TouchableOpacity>
                </View>
            )}
            <View style={styles.teamsGrid}>
                {allTeams.map(t => (
                    <TouchableOpacity 
                        key={t.id} 
                        style={[styles.teamCard, { flexDirection: 'row', alignItems: 'center' }]}
                        onPress={() => t.linkedTeamId ? router.push(`/team/${t.linkedTeamId}`) : undefined}
                        activeOpacity={t.linkedTeamId ? 0.7 : 1}
                    >
                        <View style={styles.teamAvatar}>
                            <Text style={styles.teamAvatarText}>{t.name.substring(0, 2).toUpperCase()}</Text>
                        </View>
                        <Text style={[styles.teamCardName, t.linkedTeamId && { textDecorationLine: 'underline' }, { flex: 1 }]} numberOfLines={2}>{t.name}</Text>
                        {isCreator && tournament.status === 'draft' && (
                            <TouchableOpacity onPress={() => openEditParticipant(t)} style={{ padding: 8 }}>
                                <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );

    return (
        <SceneShell>
        <View style={styles.container}>
            {/* Header Area */}
            {tournament.bannerUrl ? (
                <Animated.Image source={{ uri: tournament.bannerUrl }} style={[StyleSheet.absoluteFillObject, { height: 250, opacity: 0.3 }]} resizeMode="cover" />
            ) : null}
            {/* Fixed Back Button */}
            <View style={{ position: 'absolute', top: 14, left: 16, zIndex: 105 }}>
                <TouchableOpacity style={styles.heroBackBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Global ScrollView */}
            <Animated.ScrollView
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: 188, paddingBottom: 40, flexGrow: 1 }} // 140 + 48 (tabbar)
                showsVerticalScrollIndicator={false}
            >
                {/* Active Content Area */}
                <View style={styles.contentArea}>
                    {activeTab === 'overview' && renderOverview()}
                    {activeTab === 'pools' && renderPools()}
                    {activeTab === 'bracket' && renderBracketTab()}
                    {activeTab === 'teams' && renderTeams()}
                    {activeTab === 'activity' && renderActivityLog()}
                </View>
            </Animated.ScrollView>

            {/* HERO HEADER (Scrolls away natively) */}
            <Animated.View style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                transform: [{ translateY: scrollY.interpolate({ inputRange: [0, 100], outputRange: [0, -100], extrapolate: 'extend' }) }]
            }}>
                <View style={[styles.heroHeader, { paddingTop: 12, paddingBottom: 36 }]}>
                    <View style={[styles.heroTopRow, { height: 40 }]}>
                        {/* Empty space for absolute back button */}
                        <View style={{ width: 40 }} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: tournament.status === 'draft' ? 'rgba(255,255,255,0.15)' : tournament.status === 'active' ? '#34C759' : 'rgba(255,255,255,0.15)' }}>
                                <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{tournament.status.toUpperCase()}</Text>
                            </View>
                            {isCreator && (
                                <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }} onPress={() => router.push(`/tournament/settings/${tournament.id}`)}>
                                    <Ionicons name="settings-outline" size={18} color="#FFF" />
                                </TouchableOpacity>
                            )}
                            {isCreator && tournament.status === 'draft' && (
                                <TouchableOpacity style={{ paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: '#34C759' }} onPress={async () => {
                                    try {
                                        await TournamentService.startTournament(tournament.id);
                                        Alert.alert('Tournament Started!', 'Brackets and pool play are now generated and active.');
                                    } catch (e: any) {
                                        Alert.alert('Error', e.message);
                                    }
                                }}>
                                    <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 }}>START ▶</Text>
                                </TouchableOpacity>
                            )}
                            {!isCreator && tournament.enrollmentMode === 'open' && tournament.status === 'draft' && (
                                <TouchableOpacity style={[styles.heroBackBtn, { paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => setJoinModalOpen(true)}>
                                    <Text style={{ color: '#FFF', fontWeight: 'bold' }}>JOIN</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, minHeight: 48 }}>
                        {tournament.logoUrl ? (
                            <Image source={{ uri: tournament.logoUrl }} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceSecondary }} />
                        ) : null}
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.heroTitle, { fontSize: 26, marginBottom: 2 }]} numberOfLines={1}>{tournament.name}</Text>
                            <Text style={styles.heroSubtitle} numberOfLines={1}>{tournament.hostName ? `Hosted by ${tournament.hostName}` : `Created by Organizer`}</Text>
                        </View>
                    </View>
                </View>
            </Animated.View>

            {/* COMPACT HEADER (Fades in, matches Team Profile) */}
            <Animated.View style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 60, zIndex: 50,
                opacity: scrollY.interpolate({ inputRange: [30, 68], outputRange: [0, 1], extrapolate: 'clamp' })
            }} pointerEvents="box-none">
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1B2838' }]} pointerEvents="none" />
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }} pointerEvents="box-none">
                    <View style={{ width: 40 }} /> {/* Spacer for back button */}
                    <Text style={{ fontSize: 26, fontWeight: '900', color: '#FFF', textAlign: 'center', flex: 1, paddingHorizontal: 10, letterSpacing: 0.5 }} numberOfLines={1}>{tournament.name}</Text>
                    <View style={{ width: 40, alignItems: 'flex-end' }}>
                        {isCreator && (
                            <TouchableOpacity style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }} onPress={() => router.push(`/tournament/settings/${tournament.id}`)}>
                                <Ionicons name="settings-outline" size={18} color="#FFF" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Animated.View>

            {/* STICKY TAB BAR */}
            <Animated.View style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
                transform: [{ translateY: scrollY.interpolate({ inputRange: [0, 80], outputRange: [140, 60], extrapolateLeft: 'extend', extrapolateRight: 'clamp' }) }]
            }}>
                <View style={styles.tabBar}>
                    {visibleTabs.map(tab => (
                        <TouchableOpacity 
                            key={tab.key} 
                            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive, { fontSize: 13 }]} numberOfLines={1} adjustsFontSizeToFit>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </Animated.View>

            {/* Modals */}
            <Modal visible={matchEditorOpen} animationType="fade" transparent onRequestClose={() => setMatchEditorOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Update Match</Text>
                        <Text style={styles.modalSubtitle}>{participantName(editingMatchId ? (tournament?.matches?.[editingMatchId]?.teamAId || '') : '')} vs {participantName(editingMatchId ? (tournament?.matches?.[editingMatchId]?.teamBId || '') : '')}</Text>

                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel}>Scheduled Time</Text>
                            <TextInput
                                style={[styles.modalInput, { flex: 2 }]}
                                placeholder="e.g. Saturday 10:00 AM"
                                placeholderTextColor={colors.textSecondary}
                                value={editingMatchTime}
                                onChangeText={setEditingMatchTime}
                            />
                        </View>

                        <View style={styles.modalInputRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.modalLabel} numberOfLines={1}>{participantName(editingMatchId ? (tournament?.matches?.[editingMatchId]?.teamAId || '') : '')}</Text>
                                {isCreator && (
                                    <TouchableOpacity onPress={() => { setOverrideMatchSlot('A'); setOverrideMatchModalOpen(true); setMatchEditorOpen(false); }}>
                                        <Text style={{ fontSize: 10, color: colors.primary, marginTop: 4 }}>Override</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TextInput
                                style={styles.modalInput}
                                keyboardType="number-pad"
                                value={(scoreDrafts[editingMatchId]?.a) || ''}
                                onChangeText={(value) => setScoreDrafts((prev) => ({ ...(prev), [editingMatchId]: { ...(prev[editingMatchId] || { a: '', b: '' }), a: value.replace(/[^0-9]/g, '').slice(0, 2) } }))}
                            />
                        </View>

                        <View style={styles.modalInputRow}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={styles.modalLabel} numberOfLines={1}>{participantName(editingMatchId ? (tournament?.matches?.[editingMatchId]?.teamBId || '') : '')}</Text>
                                {isCreator && (
                                    <TouchableOpacity onPress={() => { setOverrideMatchSlot('B'); setOverrideMatchModalOpen(true); setMatchEditorOpen(false); }}>
                                        <Text style={{ fontSize: 10, color: colors.primary, marginTop: 4 }}>Override</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TextInput
                                style={styles.modalInput}
                                keyboardType="number-pad"
                                value={(scoreDrafts[editingMatchId]?.b) || ''}
                                onChangeText={(value) => setScoreDrafts((prev) => ({ ...(prev), [editingMatchId]: { ...(prev[editingMatchId] || { a: '', b: '' }), b: value.replace(/[^0-9]/g, '').slice(0, 2) } }))}
                            />
                        </View>

                        {/* Field, Day, Status */}
                        {isCreator && (
                            <>
                                <View style={styles.modalInputRow}>
                                    <Text style={styles.modalLabel}>Field</Text>
                                    <TextInput
                                        style={[styles.modalInput, { flex: 2 }]}
                                        placeholder="e.g. Field 1"
                                        placeholderTextColor={colors.textSecondary}
                                        value={editingMatchField}
                                        onChangeText={setEditingMatchField}
                                    />
                                </View>
                                <View style={styles.modalInputRow}>
                                    <Text style={styles.modalLabel}>Day</Text>
                                    <TextInput
                                        style={[styles.modalInput, { flex: 2 }]}
                                        placeholder="1, 2, 3..."
                                        keyboardType="number-pad"
                                        placeholderTextColor={colors.textSecondary}
                                        value={editingMatchDay}
                                        onChangeText={setEditingMatchDay}
                                    />
                                </View>
                                <View style={styles.modalInputRow}>
                                    <Text style={styles.modalLabel}>Status</Text>
                                    <View style={{ flexDirection: 'row', gap: 4, flex: 2 }}>
                                        {(['upcoming', 'in_progress', 'final', 'cancelled'] as const).map(s => (
                                            <TouchableOpacity key={s} style={{ flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: editingMatchStatus === s ? (s === 'cancelled' ? '#FF3B30' : s === 'in_progress' ? '#34C759' : s === 'final' ? colors.textSecondary : colors.primary) : colors.surfaceSecondary, alignItems: 'center', borderWidth: 1, borderColor: colors.border }} onPress={() => setEditingMatchStatus(s)}>
                                                <Text style={{ fontSize: 9, fontWeight: '700', color: editingMatchStatus === s ? '#FFF' : colors.textSecondary }}>{s === 'in_progress' ? 'LIVE' : s.toUpperCase()}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                                {/* Captain Check-In Buttons */}
                                <View style={styles.modalInputRow}>
                                    <Text style={styles.modalLabel}>Check-in</Text>
                                    <View style={{ flexDirection: 'row', gap: 8, flex: 2 }}>
                                        {(() => {
                                            const match = tournament?.matches?.[editingMatchId];
                                            const aChecked = !!match?.captainCheckIn?.teamA;
                                            const bChecked = !!match?.captainCheckIn?.teamB;
                                            return (
                                                <>
                                                    <TouchableOpacity style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: aChecked ? '#34C759' : colors.border, backgroundColor: aChecked ? '#34C759' : colors.surfaceSecondary, alignItems: 'center' }} onPress={async () => {
                                                        try { await TournamentService.captainCheckIn(tournament.id, editingMatchId, 'teamA'); } catch (e: any) { Alert.alert('Error', e.message); }
                                                    }}>
                                                        <Text style={{ fontSize: 11, fontWeight: '600', color: aChecked ? '#FFF' : colors.text }}>{aChecked ? '✓ Checked In' : '✓ Team A'}</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: bChecked ? '#34C759' : colors.border, backgroundColor: bChecked ? '#34C759' : colors.surfaceSecondary, alignItems: 'center' }} onPress={async () => {
                                                        try { await TournamentService.captainCheckIn(tournament.id, editingMatchId, 'teamB'); } catch (e: any) { Alert.alert('Error', e.message); }
                                                    }}>
                                                        <Text style={{ fontSize: 11, fontWeight: '600', color: bChecked ? '#FFF' : colors.text }}>{bChecked ? '✓ Checked In' : '✓ Team B'}</Text>
                                                    </TouchableOpacity>
                                                </>
                                            );
                                        })()}
                                    </View>
                                </View>
                            </>
                        )}

                        {tournament?.coachChatEnabled && (
                            <View style={styles.matchRoomBox}>
                                <Text style={styles.matchRoomTitle}>Coach Match Room</Text>
                                <Text style={styles.matchRoomHint}>
                                    Use this room for field issues, stream links, score questions, and TD-visible notes when enabled.
                                </Text>
                                <View style={styles.matchRoomMessages}>
                                    {Object.values(tournament.roomMessages?.[editingMatchId] || {})
                                        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
                                        .slice(0, 4)
                                        .map((message) => (
                                            <View key={message.id} style={styles.matchRoomMessage}>
                                                <Text style={styles.matchRoomMessageText}>{message.message}</Text>
                                                <Text style={styles.matchRoomMessageMeta}>{new Date(message.createdAt).toLocaleString()}</Text>
                                            </View>
                                        ))}
                                    {Object.keys(tournament.roomMessages?.[editingMatchId] || {}).length === 0 && (
                                        <Text style={styles.matchRoomEmpty}>No match room messages yet.</Text>
                                    )}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TextInput
                                        style={[styles.modalInput, { flex: 1 }]}
                                        placeholder="Message coaches or TD..."
                                        placeholderTextColor={colors.textSecondary}
                                        value={roomMessageDraft}
                                        onChangeText={setRoomMessageDraft}
                                    />
                                    <TouchableOpacity style={styles.sendRoomBtn} onPress={sendMatchRoomMessage} activeOpacity={0.8}>
                                        <Ionicons name="send" size={16} color={colors.onPrimary} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setMatchEditorOpen(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                                const match = tournament?.matches?.[editingMatchId];
                                await handleSaveScore(editingMatchId);
                                // Save field, day, status if organizer
                                if (isCreator) {
                                    if (editingMatchField) await TournamentService.updateMatchField(tournament.id, editingMatchId, editingMatchField);
                                    if (editingMatchDay) await TournamentService.updateMatchDay(tournament.id, editingMatchId, Number(editingMatchDay) || null);
                                    await TournamentService.updateMatchStatus(tournament.id, editingMatchId, editingMatchStatus);
                                }
                                // Log activity for score updates
                                const draft = scoreDrafts[editingMatchId];
                                if (draft?.a && draft?.b) {
                                    const teamA = participantName(match?.teamAId || '');
                                    const teamB = participantName(match?.teamBId || '');
                                    const msg = editingMatchStatus === 'final'
                                        ? `Final: ${teamA} ${draft.a} – ${draft.b} ${teamB}`
                                        : `Score updated: ${teamA} ${draft.a} – ${draft.b} ${teamB}`;
                                    try {
                                        await TournamentService.logActivity(tournament.id, msg, 'score');
                                    } catch {}
                                }
                                setMatchEditorOpen(false);
                            }}>
                                <Text style={styles.modalBtnTextPrimary}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={spiritEditorOpen} animationType="fade" transparent onRequestClose={() => setSpiritEditorOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Spirit Score</Text>
                        <Text style={styles.modalSubtitle}>{participantName(spiritTargetId)}</Text>

                        {(['rules', 'fouls', 'fairness', 'attitude', 'communication'] as const).map((key) => (
                            <View key={key} style={styles.modalInputRow}>
                                <Text style={styles.modalLabel}>{key.toUpperCase()}</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    keyboardType="number-pad"
                                    value={spiritInputs[key]}
                                    onChangeText={(value) => {
                                        setSpiritInputs((prev) => ({
                                            ...prev,
                                            [key]: value.replace(/[^0-9]/g, '').slice(0, 1),
                                        }));
                                    }}
                                />
                            </View>
                        ))}

                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setSpiritEditorOpen(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveSpiritScore}>
                                <Text style={styles.modalBtnTextPrimary}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={participantModalOpen} animationType="slide" transparent onRequestClose={() => setParticipantModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Edit Participant</Text>
                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel}>Team Name</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={editParticipantName}
                                onChangeText={setEditParticipantName}
                            />
                        </View>
                        {tournament.engine === 'pool_to_bracket' && (
                            <View style={styles.modalInputRow}>
                                <Text style={styles.modalLabel}>Manual Pool Assignment (Optional)</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="e.g. A, B, C, D"
                                    placeholderTextColor={colors.textSecondary}
                                    value={editParticipantPool}
                                    onChangeText={(val) => setEditParticipantPool(val.toUpperCase())}
                                    maxLength={1}
                                />
                            </View>
                        )}
                        <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#FF3B30', marginTop: 16 }]} onPress={() => {
                            Alert.alert('Remove Team', 'Are you sure you want to remove this team?', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Remove', style: 'destructive', onPress: async () => {
                                    await TournamentService.removeParticipant(tournament.id, editParticipantId);
                                    setParticipantModalOpen(false);
                                }}
                            ]);
                        }}>
                            <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Remove Participant</Text>
                        </TouchableOpacity>

                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setParticipantModalOpen(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                                if (!editParticipantName.trim()) return;
                                try {
                                    await TournamentService.updateParticipant(tournament.id, editParticipantId, editParticipantName);
                                    if (tournament.engine === 'pool_to_bracket') {
                                        await TournamentService.updateParticipantPool(tournament.id, editParticipantId, editParticipantPool || null);
                                    }
                                    setParticipantModalOpen(false);
                                } catch (e: any) {
                                    Alert.alert('Error', e.message);
                                }
                            }}>
                                <Text style={styles.modalBtnTextPrimary}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={joinModalOpen} animationType="slide" transparent onRequestClose={() => setJoinModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Join Tournament</Text>
                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel}>Your Team Name</Text>
                            <TextInput
                                style={styles.modalInput}
                                value={joinTeamName}
                                onChangeText={setJoinTeamName}
                            />
                        </View>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setJoinModalOpen(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                                if (!joinTeamName.trim()) return;
                                try {
                                    await TournamentService.addParticipant(tournament.id, { name: joinTeamName });
                                    setJoinModalOpen(false);
                                } catch (e: any) {
                                    Alert.alert('Error', e.message);
                                }
                            }}>
                                <Text style={styles.modalBtnTextPrimary}>Join</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={customMatchModalOpen} animationType="slide" transparent onRequestClose={() => setCustomMatchModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Add Custom Match</Text>
                        <Text style={styles.modalSubtitle}>Create an ad-hoc pool match</Text>
                        
                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel}>Team A ID or Exact Name</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="e.g. River City"
                                placeholderTextColor={colors.textSecondary}
                                value={customMatchTeamA}
                                onChangeText={setCustomMatchTeamA}
                            />
                        </View>
                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel}>Team B ID or Exact Name</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="e.g. Metro High"
                                placeholderTextColor={colors.textSecondary}
                                value={customMatchTeamB}
                                onChangeText={setCustomMatchTeamB}
                            />
                        </View>
                        
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setCustomMatchModalOpen(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                                if (!customMatchTeamA.trim() || !customMatchTeamB.trim()) return;
                                
                                // Resolve name to ID if needed
                                let tAId = customMatchTeamA.trim();
                                let tBId = customMatchTeamB.trim();
                                
                                const pVals = Object.values(tournament.participants || {});
                                const tA = pVals.find(p => p.id === tAId || p.name.toLowerCase() === tAId.toLowerCase());
                                const tB = pVals.find(p => p.id === tBId || p.name.toLowerCase() === tBId.toLowerCase());
                                
                                if (!tA) { Alert.alert('Error', `Could not find team A: ${tAId}`); return; }
                                if (!tB) { Alert.alert('Error', `Could not find team B: ${tBId}`); return; }

                                try {
                                    await TournamentService.addCustomMatch(tournament.id, tA.id, tB.id);
                                    setCustomMatchTeamA('');
                                    setCustomMatchTeamB('');
                                    setCustomMatchModalOpen(false);
                                } catch (e: any) {
                                    Alert.alert('Error', e.message);
                                }
                            }}>
                                <Text style={styles.modalBtnTextPrimary}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={overrideMatchModalOpen} animationType="slide" transparent onRequestClose={() => setOverrideMatchModalOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Override Match Slot {overrideMatchSlot}</Text>
                        <Text style={styles.modalSubtitle}>Manually set which team advances into this slot.</Text>
                        
                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel}>Team ID or Exact Name</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="e.g. River City"
                                placeholderTextColor={colors.textSecondary}
                                value={overrideMatchTeamName}
                                onChangeText={setOverrideMatchTeamName}
                            />
                        </View>
                        
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => { setOverrideMatchModalOpen(false); setMatchEditorOpen(true); }}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => {
                                if (!overrideMatchTeamName.trim()) return;
                                
                                let tName = overrideMatchTeamName.trim();
                                const pVals = Object.values(tournament.participants || {});
                                const t = pVals.find(p => p.id === tName || p.name.toLowerCase() === tName.toLowerCase());
                                
                                if (!t && tName.toUpperCase() !== 'BYE') { 
                                    Alert.alert('Error', `Could not find team: ${tName}. You can type BYE if you want a bye.`); 
                                    return; 
                                }

                                try {
                                    await TournamentService.overrideBracketMatch(tournament.id, editingMatchId, overrideMatchSlot, t ? t.id : 'BYE');
                                    setOverrideMatchTeamName('');
                                    setOverrideMatchModalOpen(false);
                                } catch (e: any) {
                                    Alert.alert('Error', e.message);
                                }
                            }}>
                                <Text style={styles.modalBtnTextPrimary}>Override</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
        </SceneShell>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        centered: {
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
        },
        emptyText: {
            ...Typography.body,
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: 40,
        },
        backBtn: {
            marginTop: 12,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.surface,
        },
        backBtnText: {
            ...Typography.button,
            color: colors.text,
        },
        // Hero Header (Esports Style)
        heroHeader: {
            backgroundColor: '#1B2838',
            paddingHorizontal: 20,
            paddingBottom: 20,
            borderBottomWidth: 0,
            borderBottomColor: 'transparent',
            zIndex: 10,
        },
        heroTopRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
        },
        heroBackBtn: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: 'rgba(255,255,255,0.1)',
            alignItems: 'center',
            justifyContent: 'center',
        },
        heroStatusPill: {
            backgroundColor: '#3B82F6', // Vibrant blue
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 6,
        },
        heroStatusText: {
            ...Typography.caption,
            color: '#FFF',
            fontWeight: 'bold',
            letterSpacing: 0.5,
        },
        heroTitle: {
            ...Typography.title,
            color: '#FFF',
            fontSize: 26,
            marginBottom: 4,
        },
        heroSubtitle: {
            ...Typography.body,
            color: 'rgba(255,255,255,0.65)',
        },
        // Tab Bar
        tabBar: {
            flexDirection: 'row',
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        tabItem: {
            flex: 1,
            paddingVertical: 14,
            alignItems: 'center',
            borderBottomWidth: 2,
            borderBottomColor: 'transparent',
        },
        tabItemActive: {
            borderBottomColor: colors.primary,
        },
        tabText: {
            ...Typography.button,
            color: colors.textSecondary,
        },
        tabTextActive: {
            color: colors.primary,
        },
        contentArea: {
            flex: 1,
            minHeight: 1000,
        },
        tabContent: {
            padding: 16,
            gap: 16,
            paddingBottom: 40,
        },
        // Overview Tab
        infoBox: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 12,
        },
        infoRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        infoLabel: {
            ...Typography.body,
            color: colors.textSecondary,
        },
        infoValue: {
            ...Typography.body,
            fontWeight: '600',
        },
        logisticsCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.primary,
            gap: 8,
            ...Layout.shadow,
        },
        logisticsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
        logisticsTitle: { ...Typography.subtitle, fontWeight: '800', color: colors.text },
        logisticsSub: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700', marginTop: 2 },
        logisticsLine: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 19 },
        tableCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
        },
        tableHeader: {
            padding: 16,
            backgroundColor: colors.surfaceSecondary,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        tableTitle: {
            ...Typography.subtitle,
        },
        tableColHeaders: {
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            alignItems: 'center',
        },
        tooltipHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            width: 50,
        },
        tableColHeader: {
            ...Typography.caption,
            color: colors.textSecondary,
            textAlign: 'center',
            fontWeight: 'bold',
        },
        tableRow: {
            flexDirection: 'row',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            alignItems: 'center',
        },
        tableRank: {
            ...Typography.body,
            color: colors.textSecondary,
            width: 24,
        },
        tableName: {
            ...Typography.body,
            fontWeight: '600',
            flex: 1,
        },
        tableStat: {
            ...Typography.body,
            width: 50,
            textAlign: 'center',
        },
        spiritTapArea: {
            width: 50,
            alignItems: 'center',
            justifyContent: 'center',
        },
        tableStatSpirit: {
            ...Typography.body,
            color: colors.primary,
            fontWeight: 'bold',
            textDecorationLine: 'underline',
        },
        // Pools Tab
        listCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
        },
        poolMatchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        poolMatchMeta: {
            width: 92,
        },
        poolMatchMetaText: {
            ...Typography.caption,
            color: colors.textSecondary,
            textTransform: 'uppercase',
        },
        matchMetaChipWrap: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 4,
            marginTop: 5,
        },
        matchMetaChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 999,
            paddingHorizontal: 6,
            paddingVertical: 2,
            backgroundColor: colors.surfaceSecondary,
            maxWidth: 88,
        },
        matchMetaChipText: {
            ...Typography.caption,
            color: colors.textSecondary,
            fontSize: 9,
            fontWeight: '700',
        },
        poolMatchTeams: {
            flex: 1,
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 8,
        },
        poolTeamName: {
            ...Typography.body,
            fontWeight: '500',
            flex: 1,
        },
        poolTeamScore: {
            ...Typography.body,
            fontWeight: 'bold',
            marginLeft: 8,
        },
        poolMatchDivider: {
            width: 1,
            height: 24,
            backgroundColor: colors.border,
            marginHorizontal: 4,
        },
        matchActionStack: {
            gap: 6,
            alignItems: 'flex-end',
        },
        startGameMiniBtn: {
            paddingHorizontal: 8,
            paddingVertical: 5,
            borderRadius: 6,
            backgroundColor: colors.primaryLight,
            borderWidth: 1,
            borderColor: colors.primary,
        },
        startGameMiniText: {
            ...Typography.caption,
            color: colors.primary,
            fontWeight: '700',
        },
        editBtn: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
        },
        editBtnText: {
            ...Typography.caption,
            color: colors.text,
            fontWeight: '600',
        },
        // Teams Tab
        teamsGrid: {
            flexDirection: 'column',
            gap: 12,
        },
        teamCard: {
            width: '100%',
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            alignItems: 'center',
            gap: 12,
        },
        teamAvatar: {
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.surfaceSecondary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        teamAvatarText: {
            ...Typography.subtitle,
            color: colors.textSecondary,
        },
        teamCardName: {
            ...Typography.body,
            fontWeight: '600',
            textAlign: 'center',
        },
        // Bracket Tab (Liquipedia Style True Tree)
        bracketSection: {
            marginBottom: 24,
        },
        bracketTitle: {
            ...Typography.title,
            marginBottom: 12,
        },
        bracketCanvas: {
            paddingVertical: 16,
            paddingHorizontal: 8,
        },
        bracketColumn: {
            width: COL_WIDTH,
        },
        bracketRoundHeader: {
            ...Typography.label,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: 16,
        },
        treeMatchCard: {
            height: MATCH_HEIGHT,
            backgroundColor: colors.surface,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            paddingHorizontal: 10,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
        },
        treeMatchCardBye: {
            backgroundColor: colors.surfaceSecondary,
            borderStyle: 'dashed',
            opacity: 0.8,
        },
        treeTeamRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 4,
        },
        treeTeamName: {
            ...Typography.body,
            fontWeight: '600',
            flex: 1,
        },
        treeTeamScore: {
            ...Typography.body,
            fontWeight: 'bold',
            marginLeft: 8,
        },
        treeTeamDivider: {
            height: 1,
            backgroundColor: colors.border,
        },
        connectorBox: {
            position: 'absolute',
            left: -(COL_GAP),
            width: COL_GAP,
            top: '50%',
        },
        connectorBracket: {
            position: 'absolute',
            left: 0,
            width: COL_GAP / 2,
            height: '100%',
            borderTopWidth: 2,
            borderBottomWidth: 2,
            borderRightWidth: 2,
            borderColor: colors.border,
        },
        connectorLine: {
            position: 'absolute',
            left: COL_GAP / 2,
            width: COL_GAP / 2,
            height: 2,
            top: '50%',
            marginTop: -1,
            backgroundColor: colors.border,
        },
        // Modals
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.64)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 18,
        },
        modalCard: {
            width: '100%',
            maxWidth: 420,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            backgroundColor: colors.surface,
            padding: 16,
            gap: 12,
        },
        modalTitle: {
            ...Typography.title,
            textAlign: 'center',
        },
        modalSubtitle: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
            textAlign: 'center',
            marginTop: -6,
        },
        modalInputRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
        },
        modalLabel: {
            ...Typography.label,
            color: colors.textSecondary,
        },
        modalInput: {
            width: 60,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingVertical: 8,
            textAlign: 'center',
            ...Typography.body,
            color: colors.text,
            backgroundColor: colors.surfaceSecondary,
        },
        matchRoomBox: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surfaceSecondary,
            padding: 12,
            gap: 8,
        },
        matchRoomTitle: { ...Typography.label, color: colors.text },
        matchRoomHint: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },
        matchRoomMessages: { gap: 6 },
        matchRoomMessage: {
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surface,
            padding: 8,
            borderWidth: 1,
            borderColor: colors.border,
        },
        matchRoomMessageText: { ...Typography.bodySmall, color: colors.text },
        matchRoomMessageMeta: { ...Typography.caption, color: colors.textSecondary, marginTop: 3 },
        matchRoomEmpty: { ...Typography.bodySmall, color: colors.textSecondary, fontStyle: 'italic' },
        sendRoomBtn: {
            width: 42,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        modalFooter: {
            flexDirection: 'row',
            gap: 10,
            marginTop: 8,
        },
        modalBtn: {
            flex: 1,
            height: 44,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
            alignItems: 'center',
            justifyContent: 'center',
        },
        modalBtnPrimary: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        modalBtnText: {
            ...Typography.button,
            color: colors.textSecondary,
        },
        modalBtnTextPrimary: {
            ...Typography.button,
            color: colors.onPrimary,
        },
        settingsSection: {
            gap: 6,
            marginTop: 8,
        },
        settingsLabel: {
            ...Typography.subtitle,
        },
        settingsHint: {
            ...Typography.bodySmall,
            color: colors.textSecondary,
        },
        codeBox: {
            backgroundColor: colors.surfaceSecondary,
            padding: 12,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
        },
        codeText: {
            ...Typography.title,
            letterSpacing: 2,
            color: colors.primary,
        },
    });
};
