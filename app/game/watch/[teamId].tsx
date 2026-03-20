import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LiveFeedService } from '../../services/LiveFeedService';
import { TeamService } from '../../services/TeamService';
import { GameState, Team } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { useTheme, ThemeColors } from '../../theme/ThemeContext';

export default function LiveFeedScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [activeGame, setActiveGame] = useState<GameState | null>(null);

    useEffect(() => {
        if (!teamId) return;

        let unsubGame: (() => void) | undefined;

        const unsubTeam = TeamService.subscribeToTeam(teamId, (t) => {
            setTeam(t);

            if (t?.activeGameId) {
                if (unsubGame) unsubGame(); 
                unsubGame = LiveFeedService.subscribeToActiveGame(t.activeGameId, (game) => {
                    setActiveGame(game);
                });
            } else {
                setActiveGame(null);
                if (unsubGame) unsubGame();
            }
        });

        return () => {
            unsubTeam();
            if (unsubGame) unsubGame();
        };
    }, [teamId]);

    const formatEventMessage = (event: any) => {
        const playerName = team?.players?.[event.playerId]?.name || 'Unknown Player';
        const assistName = team?.players?.[event.assistantId]?.name;
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'G': return { icon: 'football-outline', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time };
            case 'D': return { icon: 'hand-left-outline', color: colors.primary, title: 'Defense', desc: `Block by ${playerName}.`, time };
            case 'T': return { icon: 'close-outline', color: colors.error, title: 'Throwaway', desc: `Turnover by ${playerName}.`, time };
            case 'Drop': return { icon: 'arrow-down-outline', color: colors.error, title: 'Drop', desc: `Turnover by ${playerName}.`, time };
            case 'Callahan': return { icon: 'flash-outline', color: colors.warning, title: 'Callahan', desc: `${playerName} intercepted for a goal!`, time };
            case 'Undo': return { icon: 'refresh-outline', color: colors.textSecondary, title: 'Undo', desc: `Last action undone.`, time };
            default: return { icon: 'information-circle-outline', color: colors.textSecondary, title: 'Event', desc: `Game Event: ${event.type}`, time };
        }
    };

    if (team) {
        return (
            <View style={styles.container}>
                <View style={styles.topAppBar}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                         <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.topAppBarTitle} numberOfLines={1}>
                         {team.name} Live
                    </Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                    
                    {activeGame ? (
                        <View style={styles.scoreboard}>
                             <View style={styles.scoreBox}>
                                 <Text style={styles.scoreLabel}>US</Text>
                                 <Text style={styles.scoreNumber}>{activeGame.score1}</Text>
                             </View>
                             <View style={styles.scoreDivider} />
                             <View style={styles.scoreBox}>
                                 <Text style={styles.scoreLabel}>THEM</Text>
                                 <Text style={styles.scoreNumber}>{activeGame.score2}</Text>
                             </View>
                        </View>
                     ) : (
                         <View style={styles.noGameCard}>
                             <Ionicons name="calendar-outline" size={40} color={colors.border} />
                             <Text style={styles.noGameText}>No active games</Text>
                             <Text style={styles.noGameSub}>The team manager has not started a game yet.</Text>
                         </View>
                     )}

                    {activeGame && (
                        <View style={styles.feedCard}>
                             <View style={styles.feedHeaderRow}>
                                <Text style={styles.sectionTitle}>PLAY BY PLAY</Text>
                             </View>
                             
                            {(!activeGame.history || activeGame.history.length === 0) ? (
                                <Text style={styles.emptyFeed}>No field activity reported yet.</Text>
                            ) : (
                                [...(activeGame.history || [])].reverse().map((event, index) => {
                                     const formatted = formatEventMessage(event);
                                     return (
                                         <TouchableOpacity 
                                             key={event.id || index} 
                                             style={styles.feedEventRow}
                                             activeOpacity={event.playerId ? 0.7 : 1}
                                             onPress={() => {
                                                 if (event.playerId) {
                                                     router.push(`/team/${teamId}/player/${event.playerId}` as any);
                                                 }
                                             }}
                                         >
                                             <View style={styles.eventIconBox}>
                                                 <Ionicons name={formatted.icon as any} size={24} color={formatted.color} />
                                             </View>
                                             <View style={styles.eventTextColumn}>
                                                 <View style={styles.eventTitleRow}>
                                                     <Text style={[styles.eventTitle, { color: formatted.color }]}>{formatted.title}</Text>
                                                     <Text style={styles.eventTime}>{formatted.time}</Text>
                                                 </View>
                                                 <Text style={styles.eventDesc}>{formatted.desc}</Text>
                                             </View>
                                         </TouchableOpacity>
                                     );
                                })
                            )}
                        </View>
                    )}
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

    topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    topAppBarTitle: { ...getTypography(colors).title, fontSize: 18, flex: 1, textAlign: 'center' },

    mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 24 },

    // Scoreboard
    scoreboard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, paddingVertical: 24, paddingHorizontal: 20, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    scoreBox: { flex: 1, alignItems: 'center' },
    scoreLabel: { ...getTypography(colors).label, marginBottom: 4 },
    scoreNumber: { ...getTypography(colors).title, fontSize: 48, lineHeight: 54 },
    scoreDivider: { width: 1, height: 50, backgroundColor: colors.border, marginHorizontal: 16 },

    noGameCard: { padding: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: 16 },
    noGameText: { ...getTypography(colors).body, fontWeight: '600', marginTop: 16 },
    noGameSub: { ...getTypography(colors).bodySmall, textAlign: 'center', marginTop: 8 },

    // Feed
    feedCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 24, borderWidth: 1, borderColor: colors.border, marginBottom: 32, ...Layout.shadow },
    feedHeaderRow: { marginBottom: 20 },
    sectionTitle: { ...getTypography(colors).label },
    
    feedEventRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
    eventIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', marginRight: 16, borderWidth: 1, borderColor: colors.border },
    eventTextColumn: { flex: 1, justifyContent: 'center', paddingTop: 2 },
    eventTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    eventTitle: { ...getTypography(colors).body, fontWeight: '600' },
    eventTime: { ...getTypography(colors).bodySmall, fontSize: 12 },
    eventDesc: { ...getTypography(colors).body, color: colors.textSecondary },
    
    emptyFeed: { ...getTypography(colors).bodySmall, textAlign: 'center', marginVertical: 24 }
});
}
