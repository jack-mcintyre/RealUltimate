import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GameService } from '../../../services/GameService';
import { TeamService } from '../../../services/TeamService';
import { GameState, Team, PlayerStats } from '../../../services/types';
import { getTypography, Layout } from '../../../theme/DesignSystem';
import { useTheme, ThemeColors } from '../../../theme/ThemeContext';

export default function PlayerProfileScreen() {
    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);
    const { teamId, playerId } = useLocalSearchParams<{ teamId: string, playerId: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [allGames, setAllGames] = useState<GameState[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>('All Time');

    useEffect(() => {
        if (!teamId || !playerId) return;

        const unsubscribe = TeamService.subscribeToTeam(teamId, (t) => {
            setTeam(t);
        });

        const loadStats = async () => {
            const history = await GameService.getPastGamesForTeam(teamId);
            setAllGames(history);
        };

        loadStats();

        loadStats();
        return unsubscribe;
    }, [teamId, playerId]);

    if (!team || !team.players) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const player = team.players[playerId];
    if (!player) {
         return <View style={styles.centerContainer}><Text>Player not found.</Text></View>;
    }

    const gamesWithPlayer = allGames.filter(game => {
        return (game.history || []).some(e => e.playerId === playerId || e.assistPlayerId === playerId);
    });

    const availableYears = ['All Time', ...Array.from(new Set(gamesWithPlayer.map(g => {
        return g.history?.length ? new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() : 'Unknown';
    }))).filter(y => y !== 'Unknown').sort((a,b) => b.localeCompare(a))];

    const filteredGames = gamesWithPlayer.filter(g => {
        if (selectedYear === 'All Time') return true;
        if (!g.history?.length) return false;
        return new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() === selectedYear;
    });

    let goals = 0; let assists = 0; let blocks = 0; let turns = 0;
    let passes = 0; let callahans = 0; let timeWithDisc = 0;
    let gamesPlayed = 0; let wins = 0; let losses = 0;

    filteredGames.forEach(game => {
        let participated = false;
        
        const isTeam1 = game.team1Id === teamId;
        const ourScore = isTeam1 ? game.score1 : game.score2;
        const theirScore = isTeam1 ? game.score2 : game.score1;

        (game.history || []).forEach(e => {
            if (e.playerId === playerId) {
                participated = true;
                if (e.type === 'Goal' || e.type === 'G') goals++;
                if (e.type === 'Callahan_US') { goals++; blocks++; callahans++; }
                if (e.type === 'D' || e.type === 'D-Block') blocks++;
                if (e.type === 'Throwaway' || e.type === 'T' || e.type === 'Drop' || e.type === 'Callahan_THEM') turns++;
                if (e.type === 'Pass') passes++;
                if (e.timeElapsedMs) timeWithDisc += e.timeElapsedMs;
            }
            if (e.assistPlayerId === playerId) {
                participated = true;
                assists++;
            }
        });

        if (participated) {
            gamesPlayed++;
            if (ourScore > theirScore) wins++;
            else if (ourScore < theirScore) losses++;
        }
    });

    const s = { goals, assists, blocks, turns, passes, callahans, timeWithDisc, gamesPlayed, wins, losses };
    const gp = Math.max(s.gamesPlayed, 1);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle} numberOfLines={1}>Athlete Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.mainContent}>
                
                {/* HERO CARD */}
                <View style={styles.heroCard}>
                    <View style={styles.heroAvatar}>
                        <Text style={styles.heroAvatarText}>{player.number || player.name.substring(0,2).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.heroName}>{player.name}</Text>
                    <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }} 
                        onPress={() => router.push(`/team/${teamId}` as any)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="shield-half" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                        <Text style={{ ...getTypography(colors).body, color: colors.primary, fontWeight: '600' }}>{team.name}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                    
                    <View style={styles.recordBadge}>
                        <Text style={styles.recordText}>{s.wins}W - {s.losses}L</Text>
                    </View>
                </View>

                {/* YEAR FILTER */}
                {gamesWithPlayer.length > 0 && (
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
                )}

                {/* CAREER TOTALS */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>CAREER TOTALS</Text>
                    <View style={styles.statGrid}>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.primary }]}>{s.goals}</Text>
                            <Text style={styles.statLabel}>Goals</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.primary }]}>{s.assists}</Text>
                            <Text style={styles.statLabel}>Assists</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.primary }]}>{s.blocks}</Text>
                            <Text style={styles.statLabel}>D-Blocks</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.error }]}>{s.turns}</Text>
                            <Text style={styles.statLabel}>Turns</Text>
                        </View>
                    </View>
                    
                    <View style={[styles.statGrid, { marginTop: 16 }]}>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{s.passes}</Text>
                            <Text style={styles.statLabel}>Passes</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{s.callahans}</Text>
                            <Text style={styles.statLabel}>Callahans</Text>
                        </View>
                        <View style={[styles.statBox, { flex: 2 }]}>
                            <Text style={styles.statValue}>{formatTime(s.timeWithDisc)}</Text>
                            <Text style={styles.statLabel}>Time With Disc</Text>
                        </View>
                    </View>
                </View>

                {/* PER GAME AVERAGES */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>PER GAME AVERAGES</Text>
                    <View style={styles.statGrid}>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.goals / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>G/Game</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.assists / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>A/Game</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.blocks / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>D/Game</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.turns / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>T/Game</Text>
                        </View>
                    </View>
                </View>

                {/* MATCH HISTORY INVOLVEMENT */}
                <Text style={[styles.sectionTitle, { marginLeft: 8, marginTop: 16, marginBottom: 8 }]}>PARTICIPATED MATCHES</Text>
                {filteredGames.length === 0 ? (
                    <Text style={styles.emptyText}>No games recorded for this player in {selectedYear}.</Text>
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
        </ScrollView>
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

    heroCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 32, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroAvatarText: { ...getTypography(colors).title, fontSize: 32, color: colors.primary },
    heroName: { ...getTypography(colors).title, fontSize: 24, marginBottom: 4 },
    heroSubtitle: { ...getTypography(colors).body, color: colors.textSecondary, marginBottom: 16 },
    
    recordBadge: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border },
    recordText: { ...getTypography(colors).label, letterSpacing: 1 },

    card: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    sectionTitle: { ...getTypography(colors).label, marginBottom: 16 },
    
    statGrid: { flexDirection: 'row', gap: 12 },
    statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, paddingVertical: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    statValue: { ...getTypography(colors).title, fontSize: 20, marginBottom: 4 },
    statLabel: { ...getTypography(colors).bodySmall, fontSize: 11, color: colors.textSecondary },

    emptyText: { ...getTypography(colors).bodySmall, textAlign: 'center', marginVertical: 16 },

    historyCard: { flexDirection: 'row', padding: 16, borderRadius: Layout.radiusMd, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    historyMatchInfo: { flex: 1, paddingRight: 10 },
    historyOpponent: { ...getTypography(colors).body, fontWeight: '600', marginBottom: 4 },
    historyDate: { ...getTypography(colors).bodySmall },
    historyScoreBox: { backgroundColor: 'rgba(255,255,255,0.7)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Layout.radiusSm },
    historyScoreText: { ...getTypography(colors).title, fontSize: 18 },

    filterChip: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Layout.radiusFull, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { ...getTypography(colors).bodySmall, fontWeight: '600', color: colors.textSecondary },
    filterChipTextActive: { color: colors.onPrimary }
});
}
