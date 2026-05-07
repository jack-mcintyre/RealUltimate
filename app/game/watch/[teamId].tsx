import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { auth } from '../../../firebaseConfig';
import BrandedDialog from '../../../src/components/BrandedDialog';
import { InteractionService } from '../../services/InteractionService';
import { STREAM_HOST_ALLOWLIST, validateExternalUrl } from '../../services/linkUtils';
import { LiveFeedService } from '../../services/LiveFeedService';
import { TeamService } from '../../services/TeamService';
import { GameState, Team } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';
import SceneShell from '../../components/SceneShell';

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

const MetricHelp = ({
    title,
    explanation,
    color,
    onShow,
}: {
    title: string;
    explanation: string;
    color: string;
    onShow: (title: string, explanation: string) => void;
}) => (
    <TouchableOpacity onPress={() => onShow(title, explanation)} activeOpacity={0.7} style={{ marginLeft: 6, marginTop: -2, alignSelf: 'center' }}>
        <Ionicons name="help-circle-outline" size={15} color={color} />
    </TouchableOpacity>
);

// --- Floating Emoji Component ---
const FloatingEmoji = ({ emoji, index }: { emoji: string; index: number }) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const scale = useRef(new Animated.Value(0.3)).current;
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
    }, [opacity, scale, translateY]);

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

const FlyingDisc = ({
    lane,
    direction,
    tint,
    size,
    travelMs,
    spinTurns,
    arcLift,
    onDone,
}: {
    lane: number;
    direction: 'ltr' | 'rtl';
    tint: string;
    size: number;
    travelMs: number;
    spinTurns: number;
    arcLift: number;
    onDone: () => void;
}) => {
    const screenWidth = Dimensions.get('window').width;
    const startX = direction === 'ltr' ? -120 : screenWidth + 120;
    const endX = direction === 'ltr' ? screenWidth + 120 : -120;
    const translateX = useRef(new Animated.Value(startX)).current;
    const translateY = useRef(new Animated.Value(lane)).current;
    const rotate = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;
    const scale = useRef(new Animated.Value(0.8)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(translateX, {
                toValue: endX,
                duration: travelMs,
                useNativeDriver: true,
            }),
            Animated.sequence([
                Animated.timing(translateY, {
                    toValue: lane - arcLift,
                    duration: Math.max(240, Math.round(travelMs * 0.44)),
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: lane + Math.max(14, Math.round(arcLift * 0.33)),
                    duration: Math.max(260, Math.round(travelMs * 0.56)),
                    useNativeDriver: true,
                }),
            ]),
            Animated.timing(rotate, { toValue: spinTurns, duration: travelMs, useNativeDriver: true }),
            Animated.sequence([
                Animated.delay(Math.max(240, Math.round(travelMs * 0.62))),
                Animated.timing(opacity, { toValue: 0, duration: Math.max(180, Math.round(travelMs * 0.38)), useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(scale, { toValue: 1.24, duration: Math.max(160, Math.round(travelMs * 0.2)), useNativeDriver: true }),
                Animated.timing(scale, { toValue: 0.98, duration: Math.max(260, Math.round(travelMs * 0.45)), useNativeDriver: true }),
            ]),
        ]).start(() => onDone());
    }, [arcLift, endX, lane, onDone, opacity, rotate, scale, spinTurns, translateX, translateY, travelMs]);

    const spin = rotate.interpolate({ inputRange: [0, spinTurns], outputRange: ['0deg', `${360 * spinTurns}deg`] });

    return (
        <Animated.View
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                opacity,
                transform: [
                    { translateX },
                    { translateY },
                    { perspective: 900 },
                    { rotateX: direction === 'ltr' ? '62deg' : '-62deg' },
                    { rotateY: direction === 'ltr' ? '20deg' : '-20deg' },
                    { rotate: spin },
                    { scale },
                ],
            }}
        >
            <Ionicons
                name="disc"
                size={size}
                color={tint}
                style={{
                    textShadowColor: 'rgba(0,0,0,0.45)',
                    textShadowOffset: { width: 0, height: 4 },
                    textShadowRadius: 8,
                }}
            />
        </Animated.View>
    );
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

const formatEndzoneLabel = (name: string) => {
    const trimmed = (name || '').trim().toUpperCase();
    if (!trimmed) return '';
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 1) {
        const word = words[0];
        if (word.length <= 10) return word;
        const cut = Math.ceil(word.length / 2);
        return `${word.slice(0, cut)}\n${word.slice(cut)}`;
    }
    const midpoint = Math.ceil(words.length / 2);
    return `${words.slice(0, midpoint).join(' ')}\n${words.slice(midpoint).join(' ')}`;
};

const isDirectionalEvent = (event: any) => {
    const { throwerId, receiverId } = getEventActors(event);
    if (!throwerId || !receiverId) return false;
    return ['Pass', 'Drop', 'Throwaway', 'T', 'Goal', 'G'].includes(event?.type);
};

const trajectoryColor = (event: any, colors: ThemeColors) => {
    switch (event?.type) {
        case 'Goal':
        case 'G':
            return '#facc15';
        case 'Drop':
            return '#f97316';
        case 'Throwaway':
        case 'T':
            return colors.error;
        default:
            return '#60a5fa';
    }
};

const LiveFieldTracker = ({
    events,
    colors,
    ourTeamName,
    oppTeamName,
}: {
    events: any[];
    colors: ThemeColors;
    ourTeamName: string;
    oppTeamName: string;
}) => {
    const [dim, setDim] = useState({ w: 0, h: 0 });
    const trackedEvents = (events || [])
        .filter((event) => isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition))
        .slice(-18);

    if (!trackedEvents.length) return null;

    const renderVector = (event: any, idx: number) => {
        if (dim.w <= 0 || dim.h <= 0 || !isDirectionalEvent(event)) return null;
        if (!isValidCoord(event.fromFieldPosition) || !isValidCoord(event.fieldPosition)) return null;

        const x1 = (event.fromFieldPosition.x / 100) * dim.w;
        const y1 = (event.fromFieldPosition.y / 100) * dim.h;
        const x2 = (event.fieldPosition.x / 100) * dim.w;
        const y2 = (event.fieldPosition.y / 100) * dim.h;
        const length = Math.sqrt(((x2 - x1) ** 2) + ((y2 - y1) ** 2));
        if (length < 2) return null;

        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const cX = (x1 + x2) / 2;
        const cY = (y1 + y2) / 2;
        const alpha = Math.max(0.2, (idx + 1) / trackedEvents.length);

        return (
            <View
                key={`vector-${idx}`}
                style={{
                    position: 'absolute',
                    left: cX - (length / 2),
                    top: cY - 1,
                    width: length,
                    height: 2.2,
                    borderRadius: 2,
                    backgroundColor: trajectoryColor(event, colors),
                    opacity: alpha,
                    transform: [{ rotate: `${angle}deg` }],
                    zIndex: 3,
                }}
            />
        );
    };

    return (
        <View style={stylesForMap(colors).card}>
            <View style={stylesForMap(colors).header}>
                <Text style={stylesForMap(colors).title}>LIVE FIELD TRACKER</Text>
                <Text style={stylesForMap(colors).subTitle}>Showing last {trackedEvents.length} mapped events</Text>
            </View>

            <View
                onLayout={(e) => setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                style={stylesForMap(colors).field}
            >
                <View style={stylesForMap(colors).lineLeftEndzone} />
                <View style={stylesForMap(colors).lineRightEndzone} />
                <View style={stylesForMap(colors).lineMidfield} />
                <View style={stylesForMap(colors).lineTopSideline} />
                <View style={stylesForMap(colors).lineBottomSideline} />

                <View style={stylesForMap(colors).leftLabelWrap}>
                    <View style={stylesForMap(colors).leftLabelRot}>
                        <Text style={stylesForMap(colors).endzoneText} numberOfLines={2}>{formatEndzoneLabel(oppTeamName)}</Text>
                    </View>
                </View>
                <View style={stylesForMap(colors).rightLabelWrap}>
                    <View style={stylesForMap(colors).rightLabelRot}>
                        <Text style={stylesForMap(colors).endzoneText} numberOfLines={2}>{formatEndzoneLabel(ourTeamName)}</Text>
                    </View>
                </View>

                {trackedEvents.map((event, idx) => renderVector(event, idx))}

                {trackedEvents.map((event, idx) => {
                    const marker = isValidCoord(event.fieldPosition) ? event.fieldPosition : event.fromFieldPosition;
                    if (!marker) return null;
                    const isLatest = idx === trackedEvents.length - 1;
                    return (
                        <View
                            key={`marker-${idx}`}
                            style={{
                                position: 'absolute',
                                left: `${marker.x}%`,
                                top: `${marker.y}%`,
                                width: isLatest ? 16 : 11,
                                height: isLatest ? 16 : 11,
                                borderRadius: isLatest ? 8 : 5.5,
                                marginLeft: isLatest ? -8 : -5.5,
                                marginTop: isLatest ? -8 : -5.5,
                                backgroundColor: isLatest ? '#f8fafc' : 'rgba(255,255,255,0.75)',
                                borderWidth: isLatest ? 2 : 1,
                                borderColor: isLatest ? trajectoryColor(event, colors) : 'rgba(15,23,42,0.3)',
                                opacity: isLatest ? 1 : Math.max(0.35, (idx + 1) / trackedEvents.length),
                                zIndex: 4,
                            }}
                        />
                    );
                })}
            </View>
        </View>
    );
};

const isValidCoord = (coord: any) => typeof coord?.x === 'number' && typeof coord?.y === 'number' && coord.x >= 0 && coord.y >= 0;

const zoneValueFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(100, x));
    const base = clamped / 100;
    const redZoneBonus = clamped >= 82 ? 0.35 : 0;
    const ownEndzonePenalty = clamped <= 18 ? -0.15 : 0;
    return base + redZoneBonus + ownEndzonePenalty;
};

const getEventActors = (event: any) => {
    const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined);
    const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
    return { throwerId, receiverId };
};

const classifyThrowProfile = (dx: number, dy: number, distance: number, toX: number) => {
    if (toX >= 82 && distance >= 16) return 'Red Zone Attack';
    if (distance >= 32 && dx >= 18) return 'Huck';
    if (Math.abs(dy) >= 20) return 'Break';
    if (distance <= 12) return 'Reset';
    return 'Under';
};

const isChallengeEvent = (event: any) => [
    'G',
    'Goal',
    'Callahan_US',
    'Opponent Score',
    'Callahan_THEM',
    'Throwaway',
    'T',
    'Drop',
    'Opponent Turnover',
    'D',
    'D-Block',
].includes(event?.type);

const challengeOutcomeFromEvent = (event: any) => {
    if (!event) return null;
    if (event.type === 'G' || event.type === 'Goal' || event.type === 'Callahan_US') return 'US_GOAL';
    if (event.type === 'Opponent Score' || event.type === 'Callahan_THEM') return 'THEM_GOAL';
    return 'TURNOVER';
};

const eventStableKey = (event: any) => `${event?.id || ''}-${event?.timestamp || ''}-${event?.type || ''}`;

export default function LiveFeedScreen() {
    const { colors } = useTheme();
    const styles = getStyles(colors);
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [activeGame, setActiveGame] = useState<GameState | null>(null);
    const [floatingEmojis, setFloatingEmojis] = useState<{ id: string; emoji: string; createdAt: number }[]>([]);
    const [flyingDiscs, setFlyingDiscs] = useState<{
        id: string;
        lane: number;
        direction: 'ltr' | 'rtl';
        tint: string;
        size: number;
        travelMs: number;
        spinTurns: number;
        arcLift: number;
    }[]>([]);
    const [showYTChat, setShowYTChat] = useState(false);
    const [scoreCelebration, setScoreCelebration] = useState<{ side: 'US' | 'THEM'; title: string; subtitle: string; accent: string; icon: string } | null>(null);
    const emojiCounter = useRef(0);
    const discCounter = useRef(0);
    const lastEmojiSentRef = useRef(0);
    const seenReactionIdsRef = useRef<Set<string>>(new Set());
    const celebrationScale = useRef(new Animated.Value(0.7)).current;
    const celebrationOpacity = useRef(new Animated.Value(0)).current;
    const celebrationBurst = useRef(new Animated.Value(0)).current;
    const celebrationTranslateY = useRef(new Animated.Value(-120)).current;
    const celebrationTilt = useRef(new Animated.Value(0)).current;
    const celebrationOrbit = useRef(new Animated.Value(0)).current;
    const lastScoringEventKeyRef = useRef<string | null>(null);

    // Prediction state
    const [userVote, setUserVote] = useState<string | null>(null);
    const [fanChallengePick, setFanChallengePick] = useState<'US_GOAL' | 'THEM_GOAL' | 'TURNOVER' | null>(null);
    const [fanChallengeScore, setFanChallengeScore] = useState({ correct: 0, total: 0, lastResult: '' });
    const [infoDialog, setInfoDialog] = useState<{ title: string; message: string; icon?: keyof typeof Ionicons.glyphMap } | null>(null);
    const challengeAnchorRef = useRef<string | null>(null);

    const openMetricHelp = (title: string, explanation: string) => {
        setInfoDialog({ title, message: explanation, icon: 'help-circle-outline' });
    };

    const launchFlyingDiscs = useCallback((count: number, tint: string) => {
        const palette = [tint, '#facc15', '#f8fafc', '#38bdf8'];
        setFlyingDiscs((prev) => {
            const next = [...prev];
            for (let i = 0; i < count; i++) {
                discCounter.current += 1;
                next.push({
                    id: `disc-${Date.now()}-${discCounter.current}`,
                    lane: 70 + Math.random() * 300,
                    direction: Math.random() > 0.5 ? 'ltr' : 'rtl',
                    tint: palette[i % palette.length],
                    size: 30 + Math.round(Math.random() * 24),
                    travelMs: 900 + Math.round(Math.random() * 1500),
                    spinTurns: 3 + Math.round(Math.random() * 4),
                    arcLift: 36 + Math.round(Math.random() * 68),
                });
            }
            return next.slice(-30);
        });
    }, []);

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
                    const unseen = reactions.filter((reaction) => !seenReactionIdsRef.current.has(reaction.id));
                    if (!unseen.length) return;

                    unseen.forEach((reaction) => seenReactionIdsRef.current.add(reaction.id));
                    setFloatingEmojis((prev) => {
                        const next = [
                            ...prev,
                            ...unseen.map((reaction) => ({
                                id: reaction.id,
                                emoji: reaction.emoji,
                                createdAt: reaction.timestamp,
                            })),
                        ];
                        return next.slice(-30);
                    });
                });
            } else {
                setActiveGame(null);
                if (unsubGame) unsubGame();
                if (unsubReactions) unsubReactions();
                seenReactionIdsRef.current.clear();
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
            const cutoff = Date.now() - 4200;
            setFloatingEmojis((prev) => prev.filter((e) => e.createdAt > cutoff));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleEmojiPress = useCallback((emoji: string) => {
        const uid = auth.currentUser?.uid;
        const now = Date.now();
        if (emoji === '🥏') {
            launchFlyingDiscs(4, colors.primary);
        }
        // Add locally immediately for instant feedback
        emojiCounter.current++;
        setFloatingEmojis((prev) => [
            ...prev,
            { id: `local-${now}-${emojiCounter.current}`, emoji, createdAt: now }
        ].slice(-20));
        
        // Debounce Firebase to prevent lag from spamming
        if (activeGame?.gameId && uid && now - lastEmojiSentRef.current > 300) {
            InteractionService.sendReaction(activeGame.gameId, emoji, uid);
            lastEmojiSentRef.current = now;
        }
    }, [activeGame?.gameId, colors.primary, launchFlyingDiscs]);

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

    const handleFanChallengePick = useCallback((pick: 'US_GOAL' | 'THEM_GOAL' | 'TURNOVER') => {
        const latest = [...(activeGame?.history || [])].reverse().find(isChallengeEvent);
        challengeAnchorRef.current = latest ? eventStableKey(latest) : null;
        setFanChallengePick(pick);
    }, [activeGame?.history]);

    useEffect(() => {
        if (!fanChallengePick || !activeGame?.history?.length) return;

        const latest = [...activeGame.history].reverse().find(isChallengeEvent);
        if (!latest) return;

        const latestKey = eventStableKey(latest);
        if (latestKey === challengeAnchorRef.current) return;

        const outcome = challengeOutcomeFromEvent(latest);
        if (!outcome) return;

        setFanChallengeScore((prev) => {
            const correct = fanChallengePick === outcome;
            return {
                correct: prev.correct + (correct ? 1 : 0),
                total: prev.total + 1,
                lastResult: correct ? 'Correct read!' : `Missed: ${outcome.replace('_', ' ')}`,
            };
        });

        setFanChallengePick(null);
        challengeAnchorRef.current = latestKey;
    }, [activeGame?.history, fanChallengePick]);

    useEffect(() => {
        if (!activeGame?.history?.length) return;

        const latestScore = [...activeGame.history].reverse().find((event) => (
            event.type === 'G' ||
            event.type === 'Goal' ||
            event.type === 'Callahan_US' ||
            event.type === 'Opponent Score' ||
            event.type === 'Callahan_THEM' ||
            event.type === 'D' ||
            event.type === 'D-Block'
        ));
        if (!latestScore) return;

        const scoreKey = eventStableKey(latestScore);
        if (lastScoringEventKeyRef.current === scoreKey) return;
        lastScoringEventKeyRef.current = scoreKey;

        const isUsScore = latestScore.type === 'G' || latestScore.type === 'Goal' || latestScore.type === 'Callahan_US';
        const isThemScore = latestScore.type === 'Opponent Score' || latestScore.type === 'Callahan_THEM';
        const isBlock = latestScore.type === 'D' || latestScore.type === 'D-Block';

        const side: 'US' | 'THEM' = isThemScore ? 'THEM' : 'US';
        const accent = isBlock ? colors.primary : (side === 'US' ? colors.success : colors.error);
        const title = isBlock
            ? 'BLOCK!'
            : (latestScore.type === 'Callahan_US' || latestScore.type === 'Callahan_THEM')
                ? 'CALLAHAN!'
                : 'GOAL!';
        const subtitle = isBlock
            ? `${team?.name || 'Defense'} earned the turn`
            : side === 'US'
                ? `${team?.name || 'Us'} just scored`
                : `${activeGame?.team2Name || 'Opponent'} answered`;
        const icon = isBlock ? 'shield-checkmark' : (title === 'CALLAHAN!' ? 'flash' : 'disc');

        setScoreCelebration({ side, title, subtitle, accent, icon });
        launchFlyingDiscs(isBlock ? 6 : 10, accent);

        if (Platform.OS !== 'web') {
            if (isBlock) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            } else {
                Haptics.notificationAsync(isUsScore ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
            }
        }

        celebrationScale.setValue(0.65);
        celebrationOpacity.setValue(0);
        celebrationBurst.setValue(0);
        celebrationTranslateY.setValue(-24);
        celebrationTilt.setValue(0);
        celebrationOrbit.setValue(0);
        Animated.sequence([
            Animated.parallel([
                Animated.timing(celebrationOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
                Animated.spring(celebrationScale, { toValue: 1.08, friction: 6, tension: 120, useNativeDriver: true }),
                Animated.spring(celebrationTranslateY, { toValue: 0, friction: 8, tension: 120, useNativeDriver: true }),
                Animated.timing(celebrationBurst, { toValue: 1, duration: 520, useNativeDriver: true }),
                Animated.timing(celebrationOrbit, { toValue: 1, duration: 520, useNativeDriver: true }),
            ]),
            Animated.sequence([
                Animated.timing(celebrationTilt, { toValue: 0.34, duration: 110, useNativeDriver: true }),
                Animated.timing(celebrationTilt, { toValue: 0.72, duration: 120, useNativeDriver: true }),
                Animated.timing(celebrationTilt, { toValue: 1, duration: 120, useNativeDriver: true }),
            ]),
            Animated.delay(250),
            Animated.parallel([
                Animated.timing(celebrationOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(celebrationTranslateY, { toValue: -16, duration: 200, useNativeDriver: true }),
            ]),
        ]).start(() => setScoreCelebration(null));
    }, [activeGame?.history, activeGame?.team2Name, celebrationBurst, celebrationOpacity, celebrationOrbit, celebrationScale, celebrationTilt, celebrationTranslateY, colors.error, colors.primary, colors.success, launchFlyingDiscs, team?.name]);

    const celebrationRingScale = celebrationBurst.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.45] });
    const celebrationRingOpacity = celebrationBurst.interpolate({ inputRange: [0, 1], outputRange: [0.65, 0] });
    const celebrationRingRotate = celebrationOrbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '380deg'] });
    const celebrationTiltRotate = celebrationTilt.interpolate({ inputRange: [0, 0.34, 0.72, 1], outputRange: ['-10deg', '8deg', '-6deg', '0deg'] });

    const formatEventMessage = (event: any) => {
        const playerName = team?.players?.[event.playerId]?.name || 'Unknown Player';
        const assistName = team?.players?.[event.assistPlayerId]?.name;
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'Pickup': return { icon: 'radio-button-on-outline', color: colors.primary, title: 'Pickup', desc: `${playerName} secured possession.`, time };
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

    const handleOpenStreamExternal = async () => {
        const candidate = streamConfig?.originalUrl || '';
        const validated = validateExternalUrl(candidate, STREAM_HOST_ALLOWLIST);
        if (!validated.ok) {
            Alert.alert('Blocked URL', 'This stream link is invalid or not from an allowed streaming host.');
            return;
        }
        await Linking.openURL(validated.url);
    };

    // Prediction data
    const predictions = activeGame?.predictions;
    const totalVotes = (predictions?.team1Votes || 0) + (predictions?.team2Votes || 0);
    const team1Pct = totalVotes > 0 ? Math.round(((predictions?.team1Votes || 0) / totalVotes) * 100) : 50;
    const team2Pct = totalVotes > 0 ? 100 - team1Pct : 50;

    const liveHistory = activeGame?.history || [];
    const recentWindow = liveHistory.slice(-6);

    let runSide: 'US' | 'THEM' | null = null;
    let runCount = 0;
    for (let i = liveHistory.length - 1; i >= 0; i--) {
        const event = liveHistory[i];
        const usScore = event.type === 'G' || event.type === 'Goal' || event.type === 'Callahan_US';
        const themScore = event.type === 'Opponent Score' || event.type === 'Callahan_THEM';
        if (!usScore && !themScore) continue;

        const side: 'US' | 'THEM' = usScore ? 'US' : 'THEM';
        if (!runSide) {
            runSide = side;
            runCount = 1;
        } else if (runSide === side) {
            runCount += 1;
        } else {
            break;
        }
    }

    const turnoverEvents = recentWindow.filter((event) => [
        'Throwaway',
        'T',
        'Drop',
        'Opponent Turnover',
        'D',
        'D-Block',
    ].includes(event.type)).length;

    const scoreDiff = activeGame ? Math.abs(activeGame.score1 - activeGame.score2) : 0;
    const target = activeGame?.gameTarget || 15;
    const highLeverage = activeGame ? Math.max(activeGame.score1, activeGame.score2) >= Math.max(2, target - 4) : false;
    const pressureIndex = Math.min(100, Math.max(20, (scoreDiff <= 2 ? 42 : 22) + (highLeverage ? 28 : 0) + (turnoverEvents * 7)));

    let epvPulseTotal = 0;
    let epvPulseSamples = 0;
    const liveThrowProfiles: Record<string, number> = {};

    liveHistory.forEach((event) => {
        const { throwerId, receiverId } = getEventActors(event);
        const isCompletion = event.type === 'Pass' || event.type === 'Goal' || event.type === 'G';
        const isTurn = event.type === 'Throwaway' || event.type === 'T' || event.type === 'Drop';
        if (!throwerId || !receiverId || !(isCompletion || isTurn)) return;
        if (!isValidCoord(event.fromFieldPosition) || !isValidCoord(event.fieldPosition)) return;

        const fromCoord = event.fromFieldPosition!;
        const toCoord = event.fieldPosition!;
        const dx = toCoord.x - fromCoord.x;
        const dy = toCoord.y - fromCoord.y;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        const profile = classifyThrowProfile(dx, dy, distance, toCoord.x);
        liveThrowProfiles[profile] = (liveThrowProfiles[profile] || 0) + 1;

        const delta = zoneValueFromX(toCoord.x) - zoneValueFromX(fromCoord.x);
        epvPulseTotal += delta;
        epvPulseSamples += 1;
    });

    const epvPulse = epvPulseSamples > 0 ? epvPulseTotal / epvPulseSamples : 0;
    const topLiveProfiles = Object.entries(liveThrowProfiles)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([name, count]) => `${name} (${count})`);

    const latestCoordEvent = [...liveHistory].reverse().find((event) => isValidCoord(event.fieldPosition));
    const latestX = latestCoordEvent?.fieldPosition?.x;
    let territoryAlert = 'Midfield balance';
    if (typeof latestX === 'number') {
        if (activeGame?.possession === activeGame?.team1Id && latestX >= 72) territoryAlert = `${team?.name || 'Us'} attacking red zone`;
        if (activeGame?.possession !== activeGame?.team1Id && latestX >= 72) territoryAlert = 'Defensive red-zone alert';
        if (activeGame?.possession === activeGame?.team1Id && latestX <= 30) territoryAlert = `${team?.name || 'Us'} pinned deep`;
    }

    const momentumText = runSide
        ? `${runSide === 'US' ? (team?.name || 'Us') : (activeGame?.team2Name || 'Opponent')} on a ${runCount}-point run`
        : 'No scoring run yet';

    const spectatorTeam1Possesses = !!activeGame && activeGame.possession === activeGame.team1Id;
    const spectatorDiscOwnerName = activeGame
        ? (spectatorTeam1Possesses ? (team?.name || 'Us') : (activeGame.team2Name || 'Opponent')).trim() || 'Team'
        : '';
    const spectatorDiscBorderColor = spectatorTeam1Possesses ? colors.primary : colors.error;
    const spectatorDiscBgColor = spectatorTeam1Possesses ? colors.primaryLight : colors.errorBg;
    const spectatorDiscIconColor = spectatorDiscBorderColor;

    if (team) {
        return (
            <SceneShell>
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

                <View style={styles.frisbeeOverlay} pointerEvents="none">
                    {flyingDiscs.map((disc) => (
                        <FlyingDisc
                            key={disc.id}
                            lane={disc.lane}
                            direction={disc.direction}
                            tint={disc.tint}
                            size={disc.size}
                            travelMs={disc.travelMs}
                            spinTurns={disc.spinTurns}
                            arcLift={disc.arcLift}
                            onDone={() => setFlyingDiscs((prev) => prev.filter((item) => item.id !== disc.id))}
                        />
                    ))}
                </View>

                {scoreCelebration && (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.scoreCelebrationOverlay,
                            {
                                opacity: celebrationOpacity,
                                transform: [{ translateY: celebrationTranslateY }, { scale: celebrationScale }, { rotate: celebrationTiltRotate }],
                            },
                        ]}
                    >
                        <Animated.View
                            style={[
                                styles.scoreCelebrationRing,
                                {
                                    borderColor: scoreCelebration.accent,
                                    opacity: celebrationRingOpacity,
                                    transform: [{ scale: celebrationRingScale }, { rotate: celebrationRingRotate }],
                                },
                            ]}
                        />
                        <View style={[
                            styles.scoreCelebrationCard,
                            {
                                borderColor: scoreCelebration.accent,
                                backgroundColor: colors.surface,
                                shadowColor: scoreCelebration.accent,
                            }
                        ]}>
                            <View style={[styles.scoreCelebrationIconWrap, { borderColor: scoreCelebration.accent }]}>
                                <Ionicons name={scoreCelebration.icon as any} size={17} color={scoreCelebration.accent} />
                            </View>
                            <Text style={styles.scoreCelebrationTitle}>{scoreCelebration.title}</Text>
                            <Text style={[
                                styles.scoreCelebrationTeam,
                                { color: scoreCelebration.accent }
                            ]}>
                                {scoreCelebration.subtitle}
                            </Text>
                        </View>
                    </Animated.View>
                )}

                <BrandedDialog
                    visible={!!infoDialog}
                    title={infoDialog?.title || ''}
                    message={infoDialog?.message || ''}
                    colors={colors}
                    icon={infoDialog?.icon}
                    onPrimary={() => setInfoDialog(null)}
                />

                <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 190 }}>
                    
                    {/* LIVE STREAM INTEGRATION */}
                    {activeGame && streamConfig && streamConfig.type !== 'unknown' && (
                        <View style={styles.streamCard}>
                            <View style={styles.streamHeader}>
                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                    <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● LIVE</Text></View>
                                    <Text style={[styles.sectionTitle, {marginLeft: 8, marginBottom: 0, fontWeight: '700', color: colors.text}]}>Match Broadcast</Text>
                                </View>
                                <TouchableOpacity onPress={handleOpenStreamExternal} style={styles.externalLinkBtn}>
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
                            {/* SCOREBOARD (matches recorder: scores + center disc) */}
                            <View style={styles.scoreboard}>
                                <View
                                    style={[
                                        styles.scoreBox,
                                        spectatorTeam1Possesses ? styles.scoreBoxPossessionOur : styles.scoreBoxPossessionDim,
                                    ]}
                                >
                                    <Text style={styles.scoreLabel} numberOfLines={1}>
                                        {team.name.toUpperCase()}
                                    </Text>
                                    <Text style={styles.scoreNumber}>{activeGame.score1}</Text>
                                </View>
                                <View style={styles.scoreboardDiscColumn}>
                                    <View
                                        style={[
                                            styles.discPill,
                                            {
                                                borderColor: spectatorDiscBorderColor,
                                                backgroundColor: spectatorDiscBgColor,
                                            },
                                        ]}
                                    >
                                        <Ionicons name="radio-button-on" size={22} color={spectatorDiscIconColor} />
                                    </View>
                                    <Text style={styles.discPillCaption} numberOfLines={4}>
                                        {spectatorDiscOwnerName}
                                        {'\n'}Disc
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.scoreBox,
                                        !spectatorTeam1Possesses ? styles.scoreBoxPossessionOpp : styles.scoreBoxPossessionDim,
                                    ]}
                                >
                                    <Text style={styles.scoreLabel} numberOfLines={1}>
                                        {(activeGame.team2Name || 'OPPONENT').toUpperCase()}
                                    </Text>
                                    <Text style={styles.scoreNumber}>{activeGame.score2}</Text>
                                </View>
                            </View>

                            <LiveFieldTracker
                                events={activeGame.history || []}
                                colors={colors}
                                ourTeamName={team.name}
                                oppTeamName={activeGame.team2Name || 'Opponent'}
                            />

                            {/* LIVE INTELLIGENCE LAYER */}
                            <View style={styles.intelCard}>
                                <View style={styles.intelHeader}>
                                    <View style={styles.intelBadge}><Text style={styles.intelBadgeText}>AI</Text></View>
                                    <Text style={styles.intelTitle}>Live Intelligence Layer</Text>
                                    <MetricHelp
                                        title="Live Intelligence Layer"
                                        explanation="This card summarizes momentum, pressure, possession value shift (EPV pulse), and current field territory context from tracked events."
                                        color={colors.textSecondary}
                                        onShow={openMetricHelp}
                                    />
                                </View>

                                <View style={styles.intelGrid}>
                                    <View style={styles.intelPill}>
                                        <View style={styles.metricLabelRow}>
                                            <Text style={styles.intelLabel}>Momentum</Text>
                                            <MetricHelp
                                                title="Momentum"
                                                explanation="Momentum detects active scoring runs by checking who has scored most recently in sequence."
                                                color={colors.textSecondary}
                                                onShow={openMetricHelp}
                                            />
                                        </View>
                                        <Text style={styles.intelValue} numberOfLines={2}>{momentumText}</Text>
                                    </View>
                                    <View style={styles.intelPill}>
                                        <View style={styles.metricLabelRow}>
                                            <Text style={styles.intelLabel}>Pressure Index</Text>
                                            <MetricHelp
                                                title="Pressure Index"
                                                explanation="Pressure Index increases in close-score late-game moments and when recent turnover volume spikes."
                                                color={colors.textSecondary}
                                                onShow={openMetricHelp}
                                            />
                                        </View>
                                        <Text style={styles.intelValue}>{pressureIndex}</Text>
                                    </View>
                                </View>

                                <View style={styles.intelGrid}>
                                    <View style={styles.intelPill}>
                                        <View style={styles.metricLabelRow}>
                                            <Text style={styles.intelLabel}>EPV Pulse</Text>
                                            <MetricHelp
                                                title="EPV Pulse"
                                                explanation="EPV Pulse is the rolling average possession-value change from tracked throws during the live game. Positive values suggest stronger field progression."
                                                color={colors.textSecondary}
                                                onShow={openMetricHelp}
                                            />
                                        </View>
                                        <Text style={[styles.intelValue, { color: epvPulse >= 0 ? colors.success : colors.error }]}>{epvPulse.toFixed(2)}</Text>
                                    </View>
                                    <View style={styles.intelPill}>
                                        <View style={styles.metricLabelRow}>
                                            <Text style={styles.intelLabel}>Territory Alert</Text>
                                            <MetricHelp
                                                title="Territory Alert"
                                                explanation="Territory Alert flags when possession enters attacking red zone, defensive danger zone, or deep pinned positions."
                                                color={colors.textSecondary}
                                                onShow={openMetricHelp}
                                            />
                                        </View>
                                        <Text style={styles.intelValue} numberOfLines={2}>{territoryAlert}</Text>
                                    </View>
                                </View>

                                <Text style={styles.intelSubtext}>Top throw signatures: {topLiveProfiles.length ? topLiveProfiles.join(' • ') : 'Collecting data...'}</Text>
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

                            {/* FAN CHALLENGE */}
                            <View style={styles.challengeCard}>
                                <Text style={{ ...getTypography(colors).label, marginBottom: 6 }}>FAN CHALLENGE</Text>
                                <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 12 }}>
                                    Predict the next impact event. Your score updates live.
                                </Text>

                                <View style={styles.challengeRow}>
                                    <TouchableOpacity
                                        style={[styles.challengeBtn, fanChallengePick === 'US_GOAL' && { borderColor: colors.success, backgroundColor: colors.success }]}
                                        onPress={() => handleFanChallengePick('US_GOAL')}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[styles.challengeBtnText, fanChallengePick === 'US_GOAL' && { color: '#fff' }]}>Us Goal</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.challengeBtn, fanChallengePick === 'THEM_GOAL' && { borderColor: colors.error, backgroundColor: colors.error }]}
                                        onPress={() => handleFanChallengePick('THEM_GOAL')}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[styles.challengeBtnText, fanChallengePick === 'THEM_GOAL' && { color: '#fff' }]}>Opp Goal</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.challengeBtn, fanChallengePick === 'TURNOVER' && { borderColor: colors.primary, backgroundColor: colors.primary }]}
                                        onPress={() => handleFanChallengePick('TURNOVER')}
                                        activeOpacity={0.75}
                                    >
                                        <Text style={[styles.challengeBtnText, fanChallengePick === 'TURNOVER' && { color: '#fff' }]}>Turnover</Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.challengeScore}>
                                    Score: {fanChallengeScore.correct}/{fanChallengeScore.total}
                                    {fanChallengeScore.lastResult ? ` • ${fanChallengeScore.lastResult}` : ''}
                                </Text>
                            </View>

                            {/* PLAY BY PLAY FEED */}
                            <View style={styles.feedCard}>
                                <View style={styles.feedHeaderRow}>
                                    <View style={styles.metricLabelRow}>
                                        <Text style={styles.sectionTitle}>PLAY BY PLAY</Text>
                                        <MetricHelp
                                            title="Play by Play"
                                            explanation="This feed lists each tracked event in reverse chronological order so spectators can follow possession swings in real time."
                                            color={colors.textSecondary}
                                            onShow={openMetricHelp}
                                        />
                                    </View>
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

                {activeGame && (
                    <View style={styles.emojiDock}>
                        <Text style={styles.emojiDockLabel}>REACT</Text>
                        <View style={styles.emojiRow}>
                            {EMOJIS.map((emoji, idx) => (
                                <TouchableOpacity
                                    key={`dock-${idx}`}
                                    style={styles.emojiBtn}
                                    onPress={() => handleEmojiPress(emoji)}
                                    activeOpacity={0.6}
                                >
                                    <Text style={styles.emojiBtnText}>{emoji}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>
            </SceneShell>
        );
    }

    return (
        <SceneShell>
        <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
        </View>
        </SceneShell>
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
    frisbeeOverlay: { position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, zIndex: 120 },
    scoreCelebrationOverlay: {
        position: 'absolute',
        top: 90,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 140,
    },
    scoreCelebrationRing: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        borderWidth: 3,
    },
    scoreCelebrationCard: {
        minWidth: 190,
        borderWidth: 2,
        borderRadius: Layout.radiusLg,
        paddingVertical: 14,
        paddingHorizontal: 18,
        alignItems: 'center',
        ...Layout.shadow,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 18,
        elevation: 10,
    },
    scoreCelebrationIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceSecondary,
        marginBottom: 4,
    },
    scoreCelebrationTitle: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: 1 },
    scoreCelebrationTeam: { marginTop: 2, fontSize: 14, fontWeight: '700' },

    // Scoreboard (aligned with game recorder layout)
    scoreboard: {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: Layout.radiusLg,
        paddingVertical: 18,
        paddingHorizontal: 8,
        marginBottom: 16,
        alignItems: 'stretch',
        borderWidth: 1,
        borderColor: colors.border,
        ...Layout.shadow,
    },
    scoreBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 4, borderRadius: Layout.radiusMd },
    scoreBoxPossessionOur: {
        backgroundColor: colors.primaryLight,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    scoreBoxPossessionOpp: {
        backgroundColor: colors.errorBg,
        borderWidth: 2,
        borderColor: colors.error,
    },
    scoreBoxPossessionDim: { opacity: 0.72 },
    scoreboardDiscColumn: { width: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    discPill: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
    },
    discPillCaption: {
        ...getTypography(colors).caption,
        color: colors.text,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 15,
        fontSize: 11,
        maxWidth: 118,
    },
    scoreLabel: { ...getTypography(colors).label, marginBottom: 4, fontSize: 10 },
    scoreNumber: { ...getTypography(colors).title, fontSize: 48, lineHeight: 54 },

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
    emojiDock: {
        position: 'absolute',
        left: Layout.padding,
        right: Layout.padding,
        bottom: 12,
        backgroundColor: colors.surface,
        borderRadius: Layout.radiusLg,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: colors.border,
        ...Layout.shadow,
    },
    emojiDockLabel: { ...getTypography(colors).label, marginBottom: 8 },
    emojiRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
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

    // Live intelligence
    intelCard: {
        backgroundColor: colors.surface,
        borderRadius: Layout.radiusLg,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
        ...Layout.shadow,
    },
    intelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    intelBadge: {
        backgroundColor: colors.primary,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginRight: 8,
    },
    intelBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
    intelTitle: { ...getTypography(colors).body, fontWeight: '700' },
    intelGrid: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    intelPill: {
        flex: 1,
        backgroundColor: colors.surfaceSecondary,
        borderRadius: Layout.radiusMd,
        paddingVertical: 9,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: colors.border,
        minHeight: 62,
    },
    intelLabel: { ...getTypography(colors).bodySmall, fontSize: 11, marginBottom: 2 },
    intelValue: { ...getTypography(colors).body, fontWeight: '700', fontSize: 13 },
    intelSubtext: { ...getTypography(colors).bodySmall, marginTop: 3 },
    metricLabelRow: { flexDirection: 'row', alignItems: 'center' },

    // Fan challenge
    challengeCard: {
        backgroundColor: colors.surface,
        borderRadius: Layout.radiusLg,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
        ...Layout.shadow,
    },
    challengeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    challengeBtn: {
        flex: 1,
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: Layout.radiusMd,
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceSecondary,
    },
    challengeBtnText: { ...getTypography(colors).button, fontSize: 12, color: colors.text },
    challengeScore: { ...getTypography(colors).bodySmall, color: colors.textSecondary },

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

const stylesForMap = (colors: ThemeColors) => StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: Layout.radiusLg,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
        ...Layout.shadow,
    },
    header: { marginBottom: 8 },
    title: { ...getTypography(colors).label, marginBottom: 2 },
    subTitle: { ...getTypography(colors).bodySmall, color: colors.textSecondary },
    field: {
        width: '100%',
        height: 190,
        backgroundColor: '#15803d',
        borderRadius: Layout.radiusMd,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: '#166534',
        position: 'relative',
    },
    lineLeftEndzone: { position: 'absolute', left: '18%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
    lineRightEndzone: { position: 'absolute', left: '82%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
    lineMidfield: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
    lineTopSideline: { position: 'absolute', left: 0, right: 0, top: '8%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
    lineBottomSideline: { position: 'absolute', left: 0, right: 0, bottom: '8%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
    leftLabelWrap: { position: 'absolute', left: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
    rightLabelWrap: { position: 'absolute', right: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
    leftLabelRot: { width: 170, transform: [{ rotate: '-90deg' }] },
    rightLabelRot: { width: 170, transform: [{ rotate: '90deg' }] },
    endzoneText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 15,
        lineHeight: 17,
        fontWeight: 'bold',
        letterSpacing: 1.5,
        textAlign: 'center',
    },
});
