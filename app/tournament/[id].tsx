import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { TournamentService } from '../services/TournamentService';
import { Tournament, TournamentMatch, TournamentSpiritScore } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

const toStringParam = (value: string | string[] | undefined) => {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
};

const matchSort = (left: TournamentMatch, right: TournamentMatch) => {
    if (left.round !== right.round) return left.round - right.round;
    return left.id.localeCompare(right.id);
};

type TabKey = 'overview' | 'pools' | 'bracket' | 'teams';

const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'pools', label: 'Pools' },
    { key: 'bracket', label: 'Bracket' },
    { key: 'teams', label: 'Participants' }
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
    const [participantModalOpen, setParticipantModalOpen] = useState(false);

    const isCreator = !!tournament?.admins?.[auth.currentUser?.uid || ''];

    const scrollY = useRef(new Animated.Value(0)).current;

    const headerPadding = scrollY.interpolate({ inputRange: [0, 100], outputRange: [50, 40], extrapolate: 'clamp' });
    const subtitleOpacity = scrollY.interpolate({ inputRange: [0, 60], outputRange: [1, 0], extrapolate: 'clamp' });
    const subtitleHeight = scrollY.interpolate({ inputRange: [0, 60], outputRange: [20, 0], extrapolate: 'clamp' });

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
        setEditingMatchId(matchId);
        setEditingMatchTime(tournament?.matches?.[matchId]?.scheduledTime || '');
        setMatchEditorOpen(true);
    };

    const openEditParticipant = (t: any) => {
        setEditParticipantId(t.id);
        setEditParticipantName(t.name);
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
            Alert.alert('Invalid values', 'All spirit categories must be numeric (0-5).');
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
        <Animated.ScrollView 
            contentContainerStyle={styles.tabContent}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
            scrollEventThrottle={16}
        >
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
        </Animated.ScrollView>
    );

    const renderPools = () => (
        <Animated.ScrollView 
            contentContainerStyle={styles.tabContent}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
            scrollEventThrottle={16}
        >
            {poolMatches.length === 0 ? (
                <Text style={styles.emptyText}>No pool play matches generated.</Text>
            ) : (
                <View style={styles.listCard}>
                    {poolMatches.map(m => (
                        <View key={m.id} style={styles.poolMatchRow}>
                            <View style={styles.poolMatchMeta}>
                                <Text style={styles.poolMatchMetaText}>Round {m.round}</Text>
                                {m.scheduledTime && (
                                    <Text style={[styles.poolMatchMetaText, { color: colors.primary, marginTop: 4, fontSize: 10 }]}>{m.scheduledTime}</Text>
                                )}
                            </View>
                            <View style={[styles.poolMatchTeams, { justifyContent: 'center' }]}>
                                <Text style={[styles.poolTeamName, { textAlign: 'right', fontSize: 16 }]} numberOfLines={1}>{participantName(m.teamAId)}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 12 }}>
                                    <Text style={[styles.poolTeamScore, { width: 28, textAlign: 'right', fontSize: 18 }]}>{m.teamAScore ?? '-'}</Text>
                                    <View style={{ width: 20, justifyContent: 'center', alignItems: 'center', height: 20 }}>
                                        <Text style={{ color: colors.textSecondary, fontWeight: 'bold', fontSize: 18, lineHeight: 20 }}>-</Text>
                                    </View>
                                    <Text style={[styles.poolTeamScore, { width: 28, textAlign: 'left', fontSize: 18 }]}>{m.teamBScore ?? '-'}</Text>
                                </View>
                                <Text style={[styles.poolTeamName, { fontSize: 16 }]} numberOfLines={1}>{participantName(m.teamBId)}</Text>
                            </View>
                            <TouchableOpacity style={styles.editBtn} onPress={() => openMatchEditor(m.id)}>
                                <Text style={styles.editBtnText}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}
        </Animated.ScrollView>
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
        <Animated.ScrollView 
            contentContainerStyle={styles.tabContent}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
            scrollEventThrottle={16}
        >
            {championshipMatches.length === 0 && consolationMatches.length === 0 ? (
                <Text style={styles.emptyText}>Bracket not generated yet.</Text>
            ) : (
                <>
                    {renderBracketTree(championshipMatches, "Championship Bracket")}
                    {renderBracketTree(consolationMatches, "Consolation Bracket")}
                </>
            )}
        </Animated.ScrollView>
    );

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
        <Animated.ScrollView 
            contentContainerStyle={styles.tabContent}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
            scrollEventThrottle={16}
        >
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
        </Animated.ScrollView>
    );

    return (
        <View style={styles.container}>
            {/* Header Area */}
            <Animated.View style={[styles.heroHeader, { paddingTop: headerPadding }]}>
                <Animated.View style={[styles.heroTopRow, { opacity: scrollY.interpolate({ inputRange: [0, 50], outputRange: [1, 0], extrapolate: 'clamp' }), height: scrollY.interpolate({ inputRange: [0, 50], outputRange: [40, 0], extrapolate: 'clamp' }), overflow: 'hidden' }]}>
                    <TouchableOpacity style={styles.heroBackBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.heroStatusPill}>
                            <Text style={styles.heroStatusText}>{tournament.status.toUpperCase()}</Text>
                        </View>
                        {isCreator && (
                            <TouchableOpacity style={styles.heroBackBtn} onPress={() => router.push(`/tournament/settings/${tournament.id}`)}>
                                <Ionicons name="settings-outline" size={20} color="#FFF" />
                            </TouchableOpacity>
                        )}
                        {isCreator && tournament.status === 'draft' && (
                            <TouchableOpacity style={[styles.heroBackBtn, { paddingHorizontal: 12, backgroundColor: colors.primary }]} onPress={async () => {
                                try {
                                    await TournamentService.startTournament(tournament.id);
                                    Alert.alert('Tournament Started!', 'Brackets and pool play are now generated and active.');
                                } catch (e: any) {
                                    Alert.alert('Error', e.message);
                                }
                            }}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 12 }}>START</Text>
                            </TouchableOpacity>
                        )}
                        {!isCreator && tournament.enrollmentMode === 'open' && tournament.status === 'draft' && (
                            <TouchableOpacity style={[styles.heroBackBtn, { paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => setJoinModalOpen(true)}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>JOIN</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Animated.View>
                <Animated.Text style={[styles.heroTitle, { fontSize: scrollY.interpolate({ inputRange: [0, 100], outputRange: [28, 20], extrapolate: 'clamp' }) }]}>{tournament.name}</Animated.Text>
                <Animated.View style={{ opacity: subtitleOpacity, height: subtitleHeight, overflow: 'hidden' }}>
                    <Text style={styles.heroSubtitle}>{tournament.hostName ? `Hosted by ${tournament.hostName}` : `Created by Organizer`}</Text>
                </Animated.View>
            </Animated.View>

            {/* Tab Bar */}
            <View style={styles.tabBar}>
                {TABS.map(tab => (
                    <TouchableOpacity 
                        key={tab.key} 
                        style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Active Content */}
            <View style={styles.contentArea}>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'pools' && renderPools()}
                {activeTab === 'bracket' && renderBracketTab()}
                {activeTab === 'teams' && renderTeams()}
            </View>

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
                            <Text style={styles.modalLabel} numberOfLines={1}>{participantName(editingMatchId ? (tournament?.matches?.[editingMatchId]?.teamAId || '') : '')}</Text>
                            <TextInput
                                style={styles.modalInput}
                                keyboardType="number-pad"
                                value={(scoreDrafts[editingMatchId]?.a) || ''}
                                onChangeText={(value) => setScoreDrafts((prev) => ({ ...(prev), [editingMatchId]: { ...(prev[editingMatchId] || { a: '', b: '' }), a: value.replace(/[^0-9]/g, '').slice(0, 2) } }))}
                            />
                        </View>

                        <View style={styles.modalInputRow}>
                            <Text style={styles.modalLabel} numberOfLines={1}>{participantName(editingMatchId ? (tournament?.matches?.[editingMatchId]?.teamBId || '') : '')}</Text>
                            <TextInput
                                style={styles.modalInput}
                                keyboardType="number-pad"
                                value={(scoreDrafts[editingMatchId]?.b) || ''}
                                onChangeText={(value) => setScoreDrafts((prev) => ({ ...(prev), [editingMatchId]: { ...(prev[editingMatchId] || { a: '', b: '' }), b: value.replace(/[^0-9]/g, '').slice(0, 2) } }))}
                            />
                        </View>

                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setMatchEditorOpen(false)}>
                                <Text style={styles.modalBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={async () => { await handleSaveScore(editingMatchId); setMatchEditorOpen(false); }}>
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
        </View>
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
            backgroundColor: '#0F172A', // Deep navy/black to anchor the esports vibe regardless of theme
            paddingTop: 50,
            paddingHorizontal: 20,
            paddingBottom: 24,
            borderBottomWidth: 1,
            borderBottomColor: '#1E293B',
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
            color: '#94A3B8',
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
            width: 60,
        },
        poolMatchMetaText: {
            ...Typography.caption,
            color: colors.textSecondary,
            textTransform: 'uppercase',
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
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 16,
        },
        teamCard: {
            width: '47%',
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
