import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import { GameService } from '../../services/GameService';
import { TeamService } from '../../services/TeamService';
import { GameState, Team, PlayerStats } from '../../services/types';
import { auth } from '../../../firebaseConfig';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { useTheme, ThemeColors } from '../../theme/ThemeContext';

// Pseudo Team Logo for Scoreboard
const TeamLogo = ({ name, isGuest }: { name: string, isGuest?: boolean }) => {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    return (
        <View style={{ alignItems: 'center' }}>
            <View style={styles.teamLogoCircle}>
                <Text style={styles.teamLogoText}>{name.substring(0, 1).toUpperCase()}</Text>
            </View>
            {isGuest && <Text style={styles.guestBadge}>GUEST</Text>}
        </View>
    );
};

export default function GameHistoryScreen() {
    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);
    const { gameId, newGame } = useLocalSearchParams<{ gameId: string, newGame?: string }>();
    const [game, setGame] = useState<GameState | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState(newGame === 'true');

    useEffect(() => {
        if (!gameId) return;
        const loadContent = async () => {
            const fetchedGame = await GameService.getGameById(gameId);
            setGame(fetchedGame);
            if (fetchedGame?.team1Id) {
                const unsub = TeamService.subscribeToTeam(fetchedGame.team1Id, (t) => {
                    setTeam(t);
                });
                return () => unsub();
            }
        };
        loadContent();
    }, [gameId]);

    const formatEventMessage = (event: any) => {
        const playerName = team?.players?.[event.playerId]?.name || 'Unknown Player';
        const assistName = team?.players?.[event.assistPlayerId]?.name;
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'G': return { icon: 'aperture', color: colors.primary, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time };
            case 'D': return { icon: 'hand-left', color: colors.primary, title: 'Defense', desc: `Block by ${playerName}.`, time };
            case 'T': return { icon: 'close-circle', color: colors.error, title: 'Throwaway', desc: `Turnover by ${playerName}.`, time };
            case 'Drop': return { icon: 'arrow-down-circle', color: colors.warning, title: 'Drop', desc: `Turnover by ${playerName}.`, time };
            case 'Pass': return { icon: 'swap-horizontal', color: colors.textSecondary, title: 'Pass', desc: `${playerName} completed pass.`, time };
            case 'Callahan_US': return { icon: 'flash', color: colors.success, title: 'Callahan (US)', desc: `${playerName} intercepted for a goal!`, time };
            case 'Callahan_THEM': return { icon: 'flash', color: '#b45309', title: 'Opp. Callahan', desc: `Opponent intercepted ${playerName} for a goal!`, time };
            case 'Opponent Score': return { icon: 'flag', color: colors.error, title: 'Opponent Goal', desc: `Opponent scored.`, time };
            case 'Opponent Turnover': return { icon: 'sync', color: colors.success, title: 'Opp. Turnover', desc: `Opponent turned it over.`, time };
            case 'Halftime': return { icon: 'pause-circle', color: colors.textSecondary, title: 'HALFTIME', desc: `First half completed.`, time };
            case 'End Halftime': return { icon: 'play-circle', color: colors.textSecondary, title: 'RESUME', desc: `Second half started.`, time };
            default: return { icon: 'information-circle', color: colors.textSecondary, title: 'System Event', desc: `Game Event: ${event.type}`, time };
        }
    };

    const handleDelete = async () => {
        if (Platform.OS === 'web') {
            if (window.confirm("Are you sure you want to delete this game record?")) {
                await GameService.deleteGame(gameId);
                router.replace('/(tabs)/teams');
            }
        } else {
            Alert.alert(
                "Delete Match",
                "Are you sure you want to delete this game record?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: async () => {
                        await GameService.deleteGame(gameId);
                        router.replace('/(tabs)/teams');
                    }}
                ]
            );
        }
    };

    if (!game || !team) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const isCoach = auth.currentUser?.uid === team.coachId;
    const isTeam1 = game.team1Id === team.id;
    const opponentName = isTeam1 ? game.team2Name || "Opponent" : team.name;
    const isGuest = isTeam1 && (!game.team2Id || game.team2Name);
    const ourScore = isTeam1 ? game.score1 : game.score2;
    const theirScore = isTeam1 ? game.score2 : game.score1;
    const isWin = ourScore > theirScore;

    // --- CALCULATE ADVANCED STATS ---
    const stats: Record<string, PlayerStats> = {};
    if (team.players) {
        Object.keys(team.players).forEach(pId => {
            stats[pId] = { goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0, callahans: 0, timeWithDisc: 0 };
        });
    }

    let teamTurns = 0; let oppTurns = 0;
    let oLinePoints = 0; let oLineScores = 0;
    let dLinePoints = 0; let dLineScores = 0;
    const momentumBlocks: { usScore: number, themScore: number, scoredByUs: boolean }[] = [];
    let runUsScore = 0; let runThemScore = 0;
    let currentPointType = game.firstHalfPossession === team.id ? 'O' : 'D';

    (game.history || []).forEach(e => {
        if (e.playerId && stats[e.playerId]) {
            if (e.type === 'G') stats[e.playerId].goals++;
            if (e.type === 'Callahan_US') { stats[e.playerId].goals++; stats[e.playerId].blocks++; stats[e.playerId].callahans++; }
            if (e.type === 'D' || e.type === 'D-Block') stats[e.playerId].blocks++;
            if (e.type === 'T' || e.type === 'Drop' || e.type === 'Callahan_THEM') { stats[e.playerId].turns++; teamTurns++; }
            if (e.type === 'Pass') stats[e.playerId].passes++;
            if (e.timeElapsedMs) stats[e.playerId].timeWithDisc += e.timeElapsedMs;
        }
        if (e.assistPlayerId && stats[e.assistPlayerId]) stats[e.assistPlayerId].assists++;
        if (e.type === 'D-Block' || e.type === 'D' || e.type === 'Opponent Turnover' || e.type === 'Callahan_US') oppTurns++;

        if (e.type === 'G' || e.type === 'Callahan_US') {
            runUsScore++;
            momentumBlocks.push({ usScore: runUsScore, themScore: runThemScore, scoredByUs: true });
            if (currentPointType === 'O') { oLinePoints++; oLineScores++; }
            else { dLinePoints++; dLineScores++; } 
            currentPointType = 'D'; 
        } else if (e.type === 'Opponent Score' || e.type === 'Callahan_THEM') {
            runThemScore++;
            momentumBlocks.push({ usScore: runUsScore, themScore: runThemScore, scoredByUs: false });
            if (currentPointType === 'O') { oLinePoints++; } 
            else { dLinePoints++; } 
            currentPointType = 'O'; 
        } else if (e.type === 'Halftime') {
            currentPointType = game.firstHalfPossession === team.id ? 'D' : 'O';
        }
    });

    const oLineEff = oLinePoints > 0 ? Math.round((oLineScores / oLinePoints) * 100) : 0;
    const dLineEff = dLinePoints > 0 ? Math.round((dLineScores / dLinePoints) * 100) : 0;

    const sotgScores = game.sotgScore ? Object.values(game.sotgScore) : [];
    const sotgTotal = sotgScores.reduce((a, b) => a + b, 0);

    const playersWithStats = Object.entries(stats).map(([id, s]) => ({ id, name: team.players![id].name, ...s }));
    const sortedMVP = [...playersWithStats].sort((a,b) => {
        const scoreA = (a.goals * 2) + a.assists + a.callahans + a.blocks;
        const scoreB = (b.goals * 2) + b.assists + b.callahans + b.blocks;
        return scoreB - scoreA;
    }).filter(p => (p.goals + p.assists + p.callahans + p.blocks + p.passes) > 0);

    const mvp = sortedMVP.length > 0 ? sortedMVP[0] : null;
    const runnerUps = sortedMVP.slice(1, 4);

    const navToPlayer = (playerId: string) => {
        router.push(`/team/${team.id}/player/${playerId}`);
    };

    return (
        <View style={styles.container}>
            {/* WELCOME MODAL FOR COMPLETED GAMES */}
            <Modal visible={showWelcomeModal} animationType="fade" transparent={true}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowWelcomeModal(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowWelcomeModal(false)}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                        
                        <View style={[styles.modalIconBg, { backgroundColor: isWin ? '#dcfce7' : colors.errorBg }]}>
                            <Ionicons name={isWin ? "trophy" : "shield-half"} size={48} color={isWin ? colors.success : colors.error} />
                        </View>
                        <Text style={styles.modalHeader}>{isWin ? "Congratulations on the win!" : "Tough battle out there."}</Text>
                        
                        <View style={styles.modalScoreCard}>
                            <Text style={styles.modalScoreText}>
                                <Text style={{color: colors.primary}}>{team.name} {ourScore}</Text>
                                <Text style={{color: colors.textSecondary}}> - </Text>
                                <Text style={{color: colors.text}}>{theirScore} {opponentName}</Text>
                            </Text>
                        </View>

                        {mvp && (
                            <View style={styles.modalMvpSection}>
                                <Text style={styles.modalMvpTitle}>TOP PERFORMERS</Text>
                                <View style={styles.modalMvpRow}>
                                    <View style={styles.modalMvpAvatar}>
                                        <Text style={styles.modalMvpAvatarText}>{mvp.name.substring(0,1).toUpperCase()}</Text>
                                    </View>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.modalPrimaryMvpName}>{mvp.name}</Text>
                                        <Text style={styles.modalMvpStats}>{mvp.goals}G {mvp.assists}A {mvp.blocks}D</Text>
                                    </View>
                                </View>
                                {runnerUps.length > 0 && (
                                    <View style={styles.modalRunnerUps}>
                                        {runnerUps.slice(0, 2).map(r => (
                                            <Text key={r.id} style={styles.modalRunnerUpText}>
                                                <Text style={{fontWeight: 'bold', color: colors.text}}>{r.name}</Text> • {r.goals}G {r.assists}A {r.blocks}D
                                            </Text>
                                        ))}
                                    </View>
                                )}
                            </View>
                        )}

                        <TouchableOpacity style={styles.modalBtn} onPress={() => setShowWelcomeModal(false)} activeOpacity={0.8}>
                            <Text style={styles.modalBtnText}>View Full Match Report</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                <View style={styles.topAppBar}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/teams')}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.topAppBarTitle} numberOfLines={1}>Match Report</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.mainContent}>
                    
                    {/* MATCH HEADER */}
                    <View style={[styles.card, { alignItems: 'center', paddingVertical: 24, paddingBottom: 32 }]}>
                        <Text style={styles.matchDate}>
                            {game.history && game.history.length > 0 ? new Date(game.history[0].timestamp).toLocaleDateString() : 'Unknown Date'}
                        </Text>
                        <Text style={styles.matchTeams}>{team.name} vs {opponentName}</Text>
                        
                        <View style={styles.finalScoreBox}>
                            <TouchableOpacity style={styles.scoreSide} onPress={() => router.push(`/team/${team.id}`)}>
                                <TeamLogo name={team.name} />
                                <Text style={styles.scoreLabel}>US</Text>
                                <Text style={[styles.scoreNumber, { color: ourScore > theirScore ? colors.success : colors.text }]}>{ourScore}</Text>
                            </TouchableOpacity>
                            
                            <View style={styles.scoreCenter}>
                                <Text style={styles.scoreDivider}>-</Text>
                            </View>

                            <TouchableOpacity style={styles.scoreSide} disabled={!!isGuest}>
                                <TeamLogo name={opponentName} isGuest={!!isGuest} />
                                <Text style={styles.scoreLabel}>THEM</Text>
                                <Text style={[styles.scoreNumber, { color: theirScore > ourScore ? colors.error : colors.text }]}>{theirScore}</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.finalText}>FINAL</Text>
                    </View>

                    {/* MVP SPLASH BANNER */}
                    {mvp && (
                        <View style={styles.mvpBanner}>
                            <Text style={styles.mvpTitleText}>PLAYER OF THE MATCH</Text>
                            <TouchableOpacity style={{ alignItems: 'center' }} onPress={() => navToPlayer(mvp.id)}>
                                <View style={styles.mvpAvatar}>
                                    <Text style={styles.mvpAvatarText}>{mvp.name.substring(0, 2).toUpperCase()}</Text>
                                </View>
                                <Text style={styles.mvpName}>{mvp.name}</Text>
                                <Text style={styles.mvpStatsString}>
                                    {mvp.goals} Goals • {mvp.assists} Assists • {mvp.blocks} D's {mvp.callahans > 0 ? `• ${mvp.callahans} Callahans` : ''}
                                </Text>
                            </TouchableOpacity>
                            
                            {runnerUps.length > 0 && (
                                <View style={styles.mvpRunnersRow}>
                                    {runnerUps.map(r => (
                                        <TouchableOpacity key={r.id} style={{alignItems: 'center', flex: 1}} onPress={() => navToPlayer(r.id)}>
                                            <Text style={{color: '#fff', fontWeight: 'bold'}} numberOfLines={1}>{r.name.split(' ')[0]}</Text>
                                            <Text style={{color: 'rgba(255,255,255,0.7)', fontSize: 11}}>
                                                {r.goals}G {r.assists}A {r.blocks}D
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {/* ADVANCED ANALYTICS: EFFICIENCY & H2H */}
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>HEAD-TO-HEAD MATCHUP</Text>
                        <View style={styles.h2hGrid}>
                            <View style={styles.h2hSide}>
                                <Text style={styles.h2hTitle}>US</Text>
                                <Text style={[styles.h2hStat, { color: colors.success }]}>{oLineEff}% <Text style={styles.h2hLabel}>O-Line Conv.</Text></Text>
                                <Text style={[styles.h2hStat, { color: colors.primary }]}>{dLineEff}% <Text style={styles.h2hLabel}>D-Line Breaks</Text></Text>
                                <Text style={styles.h2hStat}>{teamTurns} <Text style={styles.h2hLabel}>Turnovers</Text></Text>
                            </View>
                            <View style={styles.h2hDivider} />
                            <View style={styles.h2hSide}>
                                <Text style={styles.h2hTitle}>THEM</Text>
                                <Text style={[styles.h2hStat, { color: colors.error }]}>{oppTurns} <Text style={styles.h2hLabel}>Turnovers</Text></Text>
                                <Text style={styles.h2hStat}>{theirScore} <Text style={styles.h2hLabel}>Goals</Text></Text>
                            </View>
                        </View>
                    </View>

                    {/* SOTG RATING */}
                    {game.sotgScore && (
                        <View style={[styles.card, { backgroundColor: isDark ? colors.surfaceSecondary : '#f0fdf4', borderColor: colors.success }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <Text style={[styles.sectionTitle, { marginBottom: 0, color: colors.success }]}>OPPONENT SPIRIT SCORE</Text>
                                <View style={{ backgroundColor: colors.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{sotgTotal} / 20</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                <Text style={styles.h2hLabel}>Rules: <Text style={{fontWeight: 'bold', color: colors.text}}>{game.sotgScore.rules}</Text></Text>
                                <Text style={styles.h2hLabel}>•</Text>
                                <Text style={styles.h2hLabel}>Fouls: <Text style={{fontWeight: 'bold', color: colors.text}}>{game.sotgScore.fouls}</Text></Text>
                                <Text style={styles.h2hLabel}>•</Text>
                                <Text style={styles.h2hLabel}>Fairness: <Text style={{fontWeight: 'bold', color: colors.text}}>{game.sotgScore.fairness}</Text></Text>
                                <Text style={styles.h2hLabel}>•</Text>
                                <Text style={styles.h2hLabel}>Attitude: <Text style={{fontWeight: 'bold', color: colors.text}}>{game.sotgScore.attitude}</Text></Text>
                                <Text style={styles.h2hLabel}>•</Text>
                                <Text style={styles.h2hLabel}>Comm: <Text style={{fontWeight: 'bold', color: colors.text}}>{game.sotgScore.communication}</Text></Text>
                            </View>
                        </View>
                    )}

                    {/* MOMENTUM CHART */}
                    {momentumBlocks.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>POINTS MOMENTUM</Text>
                            <Text style={styles.sectionSubtitle}>Chronological flow of scoring events.</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -8 }}>
                                <View style={{ flexDirection: 'row', paddingHorizontal: 8, gap: 8 }}>
                                    {momentumBlocks.map((block, idx) => (
                                        <View key={idx} style={[styles.momentumBlock, { backgroundColor: block.scoredByUs ? colors.success : colors.errorBg }]}>
                                            <Text style={[styles.momentumText, { color: block.scoredByUs ? colors.onPrimary : colors.error }]}>
                                                {block.usScore}-{block.themScore}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>
                    )}

                    {/* PLAYER LEADERBOARD (Full Data) */}
                    {sortedMVP.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>ROSTER STATS</Text>
                            <View style={styles.tableHeader}>
                                <Text style={[styles.tableCol, { flex: 2, textAlign: 'left' }]}>Player</Text>
                                <Text style={styles.tableCol}>G</Text>
                                <Text style={styles.tableCol}>A</Text>
                                <Text style={styles.tableCol}>D</Text>
                                {game.advancedTracking && <Text style={styles.tableCol}>P</Text>}
                                <Text style={styles.tableCol}>TA</Text>
                            </View>
                            {sortedMVP.map(p => (
                                <TouchableOpacity key={p.id} style={styles.tableRow} onPress={() => navToPlayer(p.id)} activeOpacity={0.6}>
                                    <Text style={[styles.tableCellName, { flex: 2, color: colors.primary }]} numberOfLines={1}>{p.name}</Text>
                                    <Text style={styles.tableCell}>{p.goals}</Text>
                                    <Text style={styles.tableCell}>{p.assists}</Text>
                                    <Text style={styles.tableCell}>{p.blocks}</Text>
                                    {game.advancedTracking && <Text style={styles.tableCell}>{p.passes}</Text>}
                                    <Text style={styles.tableCell}>{p.turns}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* TIMELINE */}
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>EVENT TIMELINE ({game.history?.length || 0})</Text>
                        {(!game.history || game.history.length === 0) ? (
                            <Text style={styles.emptyText}>No events recorded.</Text>
                        ) : (
                            [...game.history].map((event, index) => {
                                 const formatted = formatEventMessage(event);
                                 return (
                                     <View key={event.id || index} style={styles.feedEventRow}>
                                         <View style={[styles.eventIconBox, { borderColor: formatted.color }]}>
                                             <Ionicons name={formatted.icon as any} size={18} color={formatted.color} />
                                         </View>
                                         <View style={styles.eventTextColumn}>
                                             <View style={styles.eventTitleRow}>
                                                 <Text style={[styles.eventTitle, { color: formatted.color }]}>{formatted.title}</Text>
                                                 <Text style={styles.eventTime}>{formatted.time}</Text>
                                             </View>
                                             <Text style={styles.eventDesc}>{formatted.desc}</Text>
                                         </View>
                                     </View>
                                 );
                            }).reverse()
                        )}
                    </View>

                    {isCoach && (
                        <TouchableOpacity style={styles.deleteGameBtn} onPress={handleDelete} activeOpacity={0.7}>
                            <Ionicons name="trash-outline" size={20} color={colors.error} />
                            <Text style={styles.deleteGameBtnText}>Delete Match Record</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    
    topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    topAppBarTitle: { ...getTypography(colors).title, fontSize: 18, flex: 1, textAlign: 'center' },

    mainContent: { padding: Layout.padding, paddingTop: 24 },
    
    card: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    sectionTitle: { ...getTypography(colors).label, marginBottom: 16 },
    sectionSubtitle: { ...getTypography(colors).bodySmall, marginTop: -8, marginBottom: 16 },

    matchDate: { ...getTypography(colors).label, color: colors.textSecondary, marginBottom: 8 },
    matchTeams: { ...getTypography(colors).title, fontSize: 22, textAlign: 'center', marginBottom: 24 },
    
    // Aligned Final Score Row
    finalScoreBox: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 12 },
    scoreSide: { flex: 1, alignItems: 'center' },
    scoreCenter: { marginHorizontal: 16, paddingBottom: 12 },
    scoreLabel: { ...getTypography(colors).label, marginBottom: 4, marginTop: 12 },
    scoreNumber: { ...getTypography(colors).title, fontSize: 56, lineHeight: 60 },
    scoreDivider: { ...getTypography(colors).title, fontSize: 32, color: colors.border },
    finalText: { ...getTypography(colors).bodySmall, letterSpacing: 2, color: colors.textSecondary, marginTop: 12 },

    teamLogoCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    teamLogoText: { ...getTypography(colors).title, fontSize: 32, color: colors.textSecondary },
    guestBadge: { ...getTypography(colors).bodySmall, fontSize: 10, backgroundColor: colors.border, color: colors.textSecondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, position: 'absolute', bottom: -10, overflow: 'hidden' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 32, width: '100%', maxWidth: 400, alignItems: 'center', ...Layout.shadow },
    modalCloseBtn: { position: 'absolute', top: 16, right: 16, padding: 8 },
    modalIconBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    modalHeader: { ...getTypography(colors).title, fontSize: 22, textAlign: 'center', color: colors.text, marginBottom: 24 },
    modalScoreCard: { backgroundColor: colors.surfaceSecondary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: Layout.radiusMd, marginBottom: 32 },
    modalScoreText: { ...getTypography(colors).title, fontSize: 24 },
    modalMvpSection: { width: '100%', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 24, marginBottom: 32 },
    modalMvpTitle: { ...getTypography(colors).label, color: colors.textSecondary, marginBottom: 16 },
    modalMvpRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    modalMvpAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    modalMvpAvatarText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 20 },
    modalPrimaryMvpName: { ...getTypography(colors).title, fontSize: 18, color: colors.text, marginBottom: 2 },
    modalMvpStats: { ...getTypography(colors).bodySmall, color: colors.primary, fontWeight: '600' },
    modalRunnerUps: { marginLeft: 16, borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: 16 },
    modalRunnerUpText: { ...getTypography(colors).bodySmall, marginBottom: 6 },
    modalBtn: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: Layout.radiusMd, width: '100%', alignItems: 'center' },
    modalBtnText: { ...getTypography(colors).button, color: colors.onPrimary },

    // MVP Banner
    mvpBanner: { backgroundColor: '#7E22CE', padding: 32, borderRadius: Layout.radiusLg, marginBottom: 16, alignItems: 'center', ...Layout.shadow },
    mvpTitleText: { color: '#ffffff', fontWeight: 'bold', letterSpacing: 2, fontSize: 12, opacity: 0.9 },
    mvpAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginVertical: 16 },
    mvpAvatarText: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' },
    mvpName: { ...getTypography(colors).title, color: '#ffffff', fontSize: 24, marginBottom: 4 },
    mvpStatsString: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
    mvpRunnersRow: { flexDirection: 'row', gap: 16, marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', width: '100%' },

    // Head 2 Head
    h2hGrid: { flexDirection: 'row' },
    h2hSide: { flex: 1, alignItems: 'center' },
    h2hTitle: { ...getTypography(colors).body, fontWeight: '700', marginBottom: 12 },
    h2hStat: { ...getTypography(colors).title, fontSize: 24, marginBottom: 8 },
    h2hLabel: { ...getTypography(colors).bodySmall, fontSize: 11 },
    h2hDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: 16 },

    // Momentum Chart
    momentumBlock: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: Layout.radiusMd, minWidth: 48, alignItems: 'center' },
    momentumText: { ...getTypography(colors).body, fontWeight: '700' },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8, marginBottom: 8 },
    tableCol: { ...getTypography(colors).label, flex: 1, textAlign: 'center' },
    tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceSecondary, alignItems: 'center' },
    tableCellName: { ...getTypography(colors).body, fontWeight: '600' },
    tableCell: { ...getTypography(colors).body, flex: 1, textAlign: 'center' },

    emptyText: { ...getTypography(colors).bodySmall, textAlign: 'center', marginVertical: 16 },
    
    feedEventRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    eventIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1 },
    eventTextColumn: { flex: 1, justifyContent: 'center', paddingTop: 2 },
    eventTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    eventTitle: { ...getTypography(colors).body, fontWeight: '600', fontSize: 14 },
    eventTime: { ...getTypography(colors).bodySmall, fontSize: 11 },
    eventDesc: { ...getTypography(colors).body, color: colors.textSecondary, fontSize: 13 },

    deleteGameBtn: { flexDirection: 'row', backgroundColor: colors.errorBg, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 32, borderWidth: 1, borderColor: colors.error },
    deleteGameBtnText: { ...getTypography(colors).button, color: colors.error, marginLeft: 8 }
});
}
