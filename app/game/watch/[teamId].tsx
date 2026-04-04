import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ActivityIndicator, Animated, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { LiveFeedService } from '../../services/LiveFeedService';
import { InteractionService } from '../../services/InteractionService';
import { TeamService } from '../../services/TeamService';
import { GameState, Team, SpectatorReaction } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { useTheme, ThemeColors } from '../../theme/ThemeContext';
import { auth } from '../../../firebaseConfig';

const EMOJIS = ['🔥', '💪', '👏', '😱', '🥏', '⚡'];

const getStreamConfig = (url?: string) => {
    if (!url) return null;
    
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        return { 
            type: 'youtube', 
            videoId: ytMatch[1],
            embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&playsinline=1`, 
            chatUrl: `https://www.youtube.com/live_chat?v=${ytMatch[1]}&embed_domain=localhost`,
            originalUrl: url 
        };
    }
    
    const twMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    if (twMatch && twMatch[1]) {
        return { 
            type: 'twitch', 
            embedUrl: `https://player.twitch.tv/?channel=${twMatch[1]}&parent=localhost&parent=127.0.0.1`, 
            originalUrl: url 
        };
    }
    
    return { type: 'unknown', originalUrl: url };
};

// --- Floating Emoji Component ---
const FloatingEmoji = ({ emoji, index }: { emoji: string; index: number }) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const scale = useRef(new Animated.Value(0.3)).current;
    const screenWidth = Dimensions.get('window').width;
    const randomX = useRef(Math.random() * 60 + 10).current; // 10-70% from left

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateY, { toValue: -300 - Math.random() * 200, duration: 2500 + Math.random() * 1000, useNativeDriver: true }),
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
                Animated.timing(scale, { toValue: 0.9, duration: 200, useNativeDriver: true }),
            ]),
            Animated.timing(opacity, { toValue: 0, duration: 3000, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.Text
            style={{
                position: 'absolute',
                bottom: 20,
                left: `${randomX}%`,
                fontSize: 28 + Math.random() * 8,
                opacity,
                transform: [{ translateY }, { scale }],
                zIndex: 999,
            }}
        >
            {emoji}
        </Animated.Text>
    );
};

// --- Momentum Bar Component ---
const MomentumBar = ({ history, team1Id, colors }: { history: any[]; team1Id: string; colors: ThemeColors }) => {
// Removed MomentumBar as requested
};

// --- Check "On Fire" status ---
const getOnFirePlayers = (history: any[]): string[] => {
    if (!history || history.length < 3) return [];
    const recentScoring = history.filter(e => e.type === 'G' || e.type === 'Goal' || e.type === 'Callahan_US').slice(-6);
    const playerCounts: Record<string, number> = {};
    recentScoring.forEach(e => {
        if (e.playerId) {
            playerCounts[e.playerId] = (playerCounts[e.playerId] || 0) + 1;
        }
    });
    return Object.entries(playerCounts).filter(([_, count]) => count >= 3).map(([id]) => id);
};

export default function LiveFeedScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [activeGame, setActiveGame] = useState<GameState | null>(null);
    const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string }[]>([]);
    const [showYTChat, setShowYTChat] = useState(false);
    const emojiCounter = useRef(0);
    const lastEmojiSentRef = useRef(0);

    // Prediction state
    const [userVote, setUserVote] = useState<string | null>(null);

    useEffect(() => {
        if (!teamId) return;
        let unsubGame: (() => void) | undefined;
        let unsubReactions: (() => void) | undefined;

        const unsubTeam = TeamService.subscribeToTeam(teamId, (t) => {
            setTeam(t);
            if (t?.activeGameId) {
                if (unsubGame) unsubGame(); 
                unsubGame = LiveFeedService.subscribeToActiveGame(t.activeGameId, (game) => {
                    setActiveGame(game);
                });
                // Subscribe to reactions
                if (unsubReactions) unsubReactions();
                unsubReactions = InteractionService.subscribeToReactions(t.activeGameId, (reactions) => {
                    const newEmojis = reactions.map(r => ({ id: r.timestamp + Math.random(), emoji: r.emoji }));
                    setFloatingEmojis(prev => {
                        const combined = [...prev, ...newEmojis.filter(ne => !prev.some(pe => Math.abs(pe.id - ne.id) < 100))];
                        return combined.slice(-20); // Keep max 20 floating
                    });
                });
            } else {
                setActiveGame(null);
                if (unsubGame) unsubGame();
                if (unsubReactions) unsubReactions();
            }
        });

        return () => {
            unsubTeam();
            if (unsubGame) unsubGame();
            if (unsubReactions) unsubReactions();
        };
    }, [teamId]);

    // Auto-clean old floating emojis
    useEffect(() => {
        const interval = setInterval(() => {
            setFloatingEmojis(prev => prev.filter(e => Date.now() - e.id < 4000));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleEmojiPress = useCallback((emoji: string) => {
        const userId = auth.currentUser?.uid || 'anon';
        const now = Date.now();
        // Add locally immediately for instant feedback
        emojiCounter.current++;
        setFloatingEmojis(prev => [...prev, { id: now + emojiCounter.current, emoji }].slice(-15));
        
        // Debounce Firebase to prevent lag from spamming
        if (activeGame?.gameId && now - lastEmojiSentRef.current > 300) {
            InteractionService.sendReaction(activeGame.gameId, emoji, userId);
            lastEmojiSentRef.current = now;
        }
    }, [activeGame?.gameId]);

    const handleVote = useCallback(async (votedTeamId: string) => {
        const userId = auth.currentUser?.uid;
        if (!userId || !activeGame?.gameId) return;
        setUserVote(votedTeamId);
        await InteractionService.castVote(
            activeGame.gameId,
            userId,
            votedTeamId,
            activeGame.team1Id,
            activeGame.team2Id
        );
    }, [activeGame?.gameId, activeGame?.team1Id, activeGame?.team2Id]);

    const formatEventMessage = (event: any) => {
        const playerName = team?.players?.[event.playerId]?.name || 'Unknown Player';
        const assistName = team?.players?.[event.assistPlayerId]?.name;
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'G': return { icon: 'disc-outline', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time };
            case 'Goal': return { icon: 'disc-outline', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time };
            case 'D': return { icon: 'hand-left-outline', color: colors.primary, title: 'Defense', desc: `Block by ${playerName}.`, time };
            case 'T': return { icon: 'close-outline', color: colors.error, title: 'Throwaway', desc: assistName ? `Turnover by ${assistName} intended for ${playerName}.` : `Turnover by ${playerName}.`, time };
            case 'Drop': return { icon: 'arrow-down-outline', color: colors.error, title: 'Drop', desc: assistName ? `Drop by ${playerName} off pass from ${assistName}.` : `Turnover by ${playerName}.`, time };
            case 'Callahan_US': return { icon: 'flash-outline', color: colors.success, title: 'Callahan!', desc: `${playerName} intercepted for a goal!`, time };
            case 'Callahan_THEM': return { icon: 'flash-outline', color: '#b45309', title: 'Opp. Callahan', desc: `Opponent intercepted for a goal.`, time };
            case 'Opponent Score': return { icon: 'flag-outline', color: colors.error, title: 'Opp. Goal', desc: 'Opponent scored.', time };
            case 'Opponent Turnover': return { icon: 'sync-outline', color: colors.success, title: 'Opp. Turnover', desc: 'Opponent turned it over.', time };
            case 'Pass': return { icon: 'swap-horizontal-outline', color: colors.textSecondary, title: 'Pass', desc: assistName ? `Pass from ${assistName} to ${playerName}.` : `${playerName} completed pass.`, time };
            case 'Halftime': return { icon: 'pause-circle-outline', color: colors.warning, title: 'HALFTIME', desc: 'First half completed.', time };
            case 'End Halftime': return { icon: 'play-circle-outline', color: colors.success, title: 'RESUME', desc: 'Second half started.', time };
            default: return { icon: 'information-circle-outline', color: colors.textSecondary, title: 'Event', desc: `Game Event: ${event.type}`, time };
        }
    };

    const streamConfig = activeGame ? getStreamConfig(activeGame.streamUrl) : null;
    const onFirePlayers = activeGame?.history ? getOnFirePlayers(activeGame.history) : [];

    // Prediction data
    const predictions = activeGame?.predictions;
    const totalVotes = (predictions?.team1Votes || 0) + (predictions?.team2Votes || 0);
    const team1Pct = totalVotes > 0 ? Math.round(((predictions?.team1Votes || 0) / totalVotes) * 100) : 50;
    const team2Pct = totalVotes > 0 ? 100 - team1Pct : 50;

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

                {/* Floating Emojis Overlay */}
                <View style={styles.emojiOverlay} pointerEvents="none">
                    {floatingEmojis.map((e) => (
                        <FloatingEmoji key={e.id} emoji={e.emoji} index={0} />
                    ))}
                </View>

                <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    
                    {/* LIVE STREAM INTEGRATION */}
                    {activeGame && streamConfig && streamConfig.type !== 'unknown' && (
                        <View style={styles.streamCard}>
                            <View style={styles.streamHeader}>
                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                    <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● LIVE</Text></View>
                                    <Text style={[styles.sectionTitle, {marginLeft: 8, marginBottom: 0, fontWeight: '700', color: colors.text}]}>Match Broadcast</Text>
                                </View>
                                <TouchableOpacity onPress={() => Linking.openURL(streamConfig.originalUrl)} style={styles.externalLinkBtn}>
                                    <Ionicons name="open-outline" size={16} color={colors.primary} />
                                    <Text style={styles.externalLinkText}>Open App</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.videoContainer}>
                                {Platform.OS === 'web' ? (
                                    <iframe 
                                        src={streamConfig.embedUrl} 
                                        style={{ width: '100%', height: '100%', border: 'none' }} 
                                        allow="autoplay; fullscreen" 
                                    />
                                ) : (
                                    <WebView 
                                        source={{ uri: streamConfig.embedUrl as string }} 
                                        style={styles.webview}
                                        allowsInlineMediaPlayback={true}
                                        mediaPlaybackRequiresUserAction={false}
                                        javaScriptEnabled={true}
                                        domStorageEnabled={true}
                                    />
                                )}
                            </View>

                            {/* YouTube Chat Toggle */}
                            {streamConfig.type === 'youtube' && streamConfig.chatUrl && (
                                <View style={{ marginTop: 12 }}>
                                    <TouchableOpacity 
                                        style={[styles.chatToggleBtn, showYTChat && { backgroundColor: colors.primaryLight, borderColor: colors.primary }]} 
                                        onPress={() => setShowYTChat(!showYTChat)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="chatbubbles-outline" size={16} color={showYTChat ? colors.primary : colors.textSecondary} />
                                        <Text style={[styles.chatToggleText, showYTChat && { color: colors.primary }]}>
                                            {showYTChat ? 'Hide Live Chat' : 'Show YouTube Chat'}
                                        </Text>
                                    </TouchableOpacity>
                                    {showYTChat && (
                                        <View style={styles.chatContainer}>
                                            {Platform.OS === 'web' ? (
                                                <iframe 
                                                    src={streamConfig.chatUrl} 
                                                    style={{ width: '100%', height: '100%', border: 'none' }} 
                                                />
                                            ) : (
                                                <WebView 
                                                    source={{ uri: streamConfig.chatUrl as string }} 
                                                    style={{ flex: 1, backgroundColor: 'transparent' }}
                                                    javaScriptEnabled={true}
                                                    domStorageEnabled={true}
                                                />
                                            )}
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {activeGame ? (
                        <>
                            {/* SCOREBOARD */}
                            <View style={styles.scoreboard}>
                                <View style={styles.scoreBox}>
                                    <Text style={styles.scoreLabel} numberOfLines={1}>
                                        {team.name.toUpperCase()}
                                    </Text>
                                    <Text style={styles.scoreNumber}>{activeGame.score1}</Text>
                                </View>
                                <View style={styles.scoreCenter}>
                                    <Text style={styles.scoreVs}>VS</Text>
                                </View>
                                <View style={styles.scoreBox}>
                                    <Text style={styles.scoreLabel} numberOfLines={1}>
                                        {(activeGame.team2Name || 'OPPONENT').toUpperCase()}
                                    </Text>
                                    <Text style={styles.scoreNumber}>{activeGame.score2}</Text>
                                </View>
                            </View>

                            {/* POSSESSION INDICATOR */}
                            <View style={[styles.possessionBar, { backgroundColor: activeGame.possession === activeGame.team1Id ? colors.primaryLight : colors.errorBg }]}>
                                <Text style={[styles.possessionText, { color: activeGame.possession === activeGame.team1Id ? colors.primary : colors.error }]}>
                                    {activeGame.possession === activeGame.team1Id ? `▶ ${team.name} Possession` : `◀ ${activeGame.team2Name || 'Opponent'} Possession`}
                                </Text>
                            </View>

                            {/* ON FIRE PLAYERS */}
                            {onFirePlayers.length > 0 && (
                                <View style={styles.onFireCard}>
                                    <View style={styles.onFireHeader}>
                                        <Text style={{ fontSize: 20 }}>🔥</Text>
                                        <Text style={styles.onFireTitle}>ON FIRE</Text>
                                        <Text style={{ fontSize: 20 }}>🔥</Text>
                                    </View>
                                    {onFirePlayers.map(pid => (
                                        <TouchableOpacity 
                                            key={pid} 
                                            style={styles.onFireRow}
                                            onPress={() => router.push(`/team/${teamId}/player/${pid}` as any)}
                                        >
                                            <Text style={styles.onFireName}>
                                                {team?.players?.[pid]?.name || 'Player'}
                                            </Text>
                                            <Text style={styles.onFireBadge}>🔥 3+ Goals</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* EMOJI REACTION BAR */}
                            <View style={styles.emojiBar}>
                                <Text style={{ ...getTypography(colors).label, marginBottom: 10 }}>REACT</Text>
                                <View style={styles.emojiRow}>
                                    {EMOJIS.map((emoji, idx) => (
                                        <TouchableOpacity
                                            key={idx}
                                            style={styles.emojiBtn}
                                            onPress={() => handleEmojiPress(emoji)}
                                            activeOpacity={0.6}
                                        >
                                            <Text style={styles.emojiBtnText}>{emoji}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* LIVE PREDICTIONS */}
                            <View style={styles.predictionCard}>
                                <Text style={{ ...getTypography(colors).label, marginBottom: 4 }}>WIN PREDICTION</Text>
                                <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 16 }}>
                                    {totalVotes > 0 ? `${team1Pct}% predict ${team.name} will win (from ${totalVotes} vote${totalVotes !== 1 ? 's' : ''})` : 'Be the first to predict the winner!'}
                                </Text>
                                
                                <View style={styles.predictionBtns}>
                                    <TouchableOpacity 
                                        style={[
                                            styles.predVoteBtn,
                                            { borderColor: colors.primary },
                                            userVote === activeGame.team1Id && { backgroundColor: colors.primaryLight }
                                        ]}
                                        onPress={() => handleVote(activeGame.team1Id)}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.predVoteName, { color: colors.primary }]} numberOfLines={1}>
                                            {team.name}
                                        </Text>
                                        {userVote === activeGame.team1Id && (
                                            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[
                                            styles.predVoteBtn,
                                            { borderColor: colors.error },
                                            userVote === (activeGame.team2Id || '__team2__') && { backgroundColor: colors.errorBg }
                                        ]}
                                        onPress={() => handleVote(activeGame.team2Id || '__team2__')}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.predVoteName, { color: colors.error }]} numberOfLines={1}>
                                            {activeGame.team2Name || 'Opponent'}
                                        </Text>
                                        {userVote === (activeGame.team2Id || '__team2__') && (
                                            <Ionicons name="checkmark-circle" size={16} color={colors.error} />
                                        )}
                                    </TouchableOpacity>
                                </View>
                                
                                {/* Prediction progress bar */}
                                {totalVotes >= 2 && (
                                    <View style={styles.predBarContainer}>
                                        <View style={[styles.predBar, styles.predBarLeft, { flex: team1Pct }]}>
                                            <Text style={styles.predBarText}>{team1Pct}%</Text>
                                        </View>
                                        <View style={[styles.predBar, styles.predBarRight, { flex: team2Pct }]}>
                                            <Text style={styles.predBarText}>{team2Pct}%</Text>
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* PLAY BY PLAY FEED */}
                            <View style={styles.feedCard}>
                                <View style={styles.feedHeaderRow}>
                                    <Text style={styles.sectionTitle}>PLAY BY PLAY</Text>
                                </View>
                                
                                {(!activeGame.history || activeGame.history.length === 0) ? (
                                    <Text style={styles.emptyFeed}>No field activity reported yet.</Text>
                                ) : (
                                    [...(activeGame.history || [])].reverse().map((event, index) => {
                                        const formatted = formatEventMessage(event);
                                        const isOnFire = event.playerId && onFirePlayers.includes(event.playerId);
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
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={[styles.eventTitle, { color: formatted.color }]}>{formatted.title}</Text>
                                                            {isOnFire && <Text style={{ fontSize: 12 }}>🔥</Text>}
                                                        </View>
                                                        <Text style={styles.eventTime}>{formatted.time}</Text>
                                                    </View>
                                                    <Text style={styles.eventDesc}>{formatted.desc}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })
                                )}
                            </View>
                        </>
                    ) : (
                        <View style={styles.noGameCard}>
                            <Ionicons name="calendar-outline" size={48} color={colors.border} />
                            <Text style={styles.noGameText}>No active games</Text>
                            <Text style={styles.noGameSub}>The team manager has not started a game yet. Check back when a match is underway.</Text>
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

    // Emoji Overlay
    emojiOverlay: { position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, zIndex: 99 },

    // Scoreboard - enhanced
    scoreboard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, paddingVertical: 24, paddingHorizontal: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    scoreBox: { flex: 1, alignItems: 'center' },
    scoreLabel: { ...getTypography(colors).label, marginBottom: 4, fontSize: 10 },
    scoreNumber: { ...getTypography(colors).title, fontSize: 48, lineHeight: 54 },
    scoreCenter: { paddingHorizontal: 16 },
    scoreVs: { ...getTypography(colors).label, fontSize: 14, color: colors.textSecondary },

    // Possession
    possessionBar: { paddingVertical: 10, borderRadius: Layout.radiusMd, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    possessionText: { ...getTypography(colors).body, fontWeight: '700', fontSize: 13 },

    // Stream
    streamCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    streamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    liveBadge: { backgroundColor: colors.error, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
    externalLinkBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    externalLinkText: { color: colors.primary, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    videoContainer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: Layout.radiusMd, overflow: 'hidden' },
    webview: { flex: 1, backgroundColor: 'transparent' },

    // YouTube Chat
    chatToggleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, paddingVertical: 10, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, gap: 6 },
    chatToggleText: { ...getTypography(colors).body, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chatContainer: { height: 300, borderRadius: Layout.radiusMd, overflow: 'hidden', marginTop: 8, borderWidth: 1, borderColor: colors.border },

    // On Fire
    onFireCard: { 
        backgroundColor: colors.surface, 
        borderRadius: Layout.radiusLg, 
        padding: 16, 
        marginBottom: 16, 
        borderWidth: 2, 
        borderColor: '#F97316', 
        ...Layout.shadow,
        shadowColor: '#F97316',
        shadowOpacity: 0.3,
        shadowRadius: 12,
    },
    onFireHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
    onFireTitle: { ...getTypography(colors).label, color: '#F97316', fontSize: 13, letterSpacing: 3 },
    onFireRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
    onFireName: { ...getTypography(colors).body, fontWeight: '700', color: '#F97316' },
    onFireBadge: { fontSize: 11, color: colors.textSecondary },

    // Emoji Reaction Bar
    emojiBar: { 
        backgroundColor: colors.surface, 
        borderRadius: Layout.radiusLg, 
        padding: 16, 
        marginBottom: 16, 
        borderWidth: 1, 
        borderColor: colors.border,
        ...Layout.shadow
    },
    emojiRow: { flexDirection: 'row', justifyContent: 'space-around' },
    emojiBtn: { 
        width: 48, 
        height: 48, 
        borderRadius: 24, 
        backgroundColor: colors.surfaceSecondary, 
        alignItems: 'center', 
        justifyContent: 'center', 
        borderWidth: 1, 
        borderColor: colors.border 
    },
    emojiBtnText: { fontSize: 24 },

    // Live Predictions
    predictionCard: { 
        backgroundColor: colors.surface, 
        borderRadius: Layout.radiusLg, 
        padding: 20, 
        marginBottom: 16, 
        borderWidth: 1, 
        borderColor: colors.border,
        ...Layout.shadow
    },
    predictionBtns: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    predVoteBtn: { 
        flex: 1, 
        paddingVertical: 14, 
        borderRadius: Layout.radiusMd, 
        borderWidth: 2, 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 6,
    },
    predVoteName: { ...getTypography(colors).button, fontSize: 14 },
    predBarContainer: { flexDirection: 'row', height: 28, borderRadius: Layout.radiusSm, overflow: 'hidden' },
    predBar: { justifyContent: 'center', alignItems: 'center', minWidth: 40 },
    predBarLeft: { backgroundColor: colors.primary, borderTopLeftRadius: Layout.radiusSm, borderBottomLeftRadius: Layout.radiusSm },
    predBarRight: { backgroundColor: colors.error, borderTopRightRadius: Layout.radiusSm, borderBottomRightRadius: Layout.radiusSm },
    predBarText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

    // No Game
    noGameCard: { padding: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: 16 },
    noGameText: { ...getTypography(colors).body, fontWeight: '600', marginTop: 16 },
    noGameSub: { ...getTypography(colors).bodySmall, textAlign: 'center', marginTop: 8, lineHeight: 20 },

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
