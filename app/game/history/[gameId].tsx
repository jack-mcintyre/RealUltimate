import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { auth } from '../../../firebaseConfig';
import BrandedDialog from '../../../src/components/BrandedDialog';
import { GameService } from '../../services/GameService';
import { STREAM_HOST_ALLOWLIST, validateExternalUrl } from '../../services/linkUtils';
import { TeamService } from '../../services/TeamService';
import { GameState, PlayerStats, PredictionSnapshot, Team } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';

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
    <TouchableOpacity onPress={() => onShow(title, explanation)} style={{ marginLeft: 6, marginTop: -2, alignSelf: 'center' }} activeOpacity={0.7}>
        <Ionicons name="help-circle-outline" size={15} color={color} />
    </TouchableOpacity>
);

const getStreamConfig = (url?: string) => {
    if (!url) return null;
    
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (ytMatch && ytMatch[1]) {
        return { type: 'youtube', videoId: ytMatch[1], embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&playsinline=1`, originalUrl: url };
    }
    
    const twMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
    if (twMatch && twMatch[1]) {
        return { type: 'twitch', embedUrl: `https://player.twitch.tv/?channel=${twMatch[1]}&parent=localhost&parent=127.0.0.1`, originalUrl: url };
    }
    
    return { type: 'unknown', originalUrl: url };
};

// --- Shareable Box Score Card Component ---
const BoxScoreCard = React.forwardRef<View, {
    teamName: string;
    opponentName: string;
    ourScore: number;
    theirScore: number;
    mvpName: string | null;
    mvpStats: string;
    date: string;
    isWin: boolean;
    colors: ThemeColors;
}>(({ teamName, opponentName, ourScore, theirScore, mvpName, mvpStats, date, isWin, colors }, ref) => {
    return (
        <View ref={ref as any} style={{
            width: 360,
            backgroundColor: isWin ? '#0F172A' : '#1E1B4B',
            borderRadius: 20,
            padding: 32,
            alignItems: 'center',
            overflow: 'hidden',
        }} collapsable={false}>
            {/* Gradient accent bar */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: isWin ? '#22C55E' : '#EF4444' }} />
            
            {/* Header */}
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold', letterSpacing: 3, marginBottom: 4 }}>MATCH RESULT</Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 20 }}>{date}</Text>
            
            {/* Scoreboard */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22 }}>{teamName.charAt(0)}</Text>
                    </View>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{teamName}</Text>
                </View>
                
                <View style={{ paddingHorizontal: 16 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 44, letterSpacing: -2 }}>
                        {ourScore}
                        <Text style={{ color: 'rgba(255,255,255,0.3)' }}> - </Text>
                        {theirScore}
                    </Text>
                </View>
                
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22 }}>{opponentName.charAt(0)}</Text>
                    </View>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>{opponentName}</Text>
                </View>
            </View>
            
            {/* Result Badge */}
            <View style={{ 
                backgroundColor: isWin ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', 
                paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20, marginBottom: 20,
                borderWidth: 1, borderColor: isWin ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'
            }}>
                <Text style={{ color: isWin ? '#4ADE80' : '#FCA5A5', fontWeight: 'bold', fontSize: 12, letterSpacing: 2 }}>
                    {isWin ? 'VICTORY' : 'DEFEAT'}
                </Text>
            </View>
            
            {/* MVP */}
            {mvpName && (
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 }}>MVP</Text>
                    <Text style={{ color: '#FBBF24', fontWeight: '700', fontSize: 16 }}>{mvpName}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>{mvpStats}</Text>
                </View>
            )}
            
            {/* Branding */}
            <View style={{ position: 'absolute', bottom: 10, right: 16 }}>
                <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: 'bold', letterSpacing: 1 }}>REALULTIMATE</Text>
            </View>
        </View>
    );
});

BoxScoreCard.displayName = 'BoxScoreCard';

// --- Prediction Chart (Mini) ---
const PredictionChart = ({ snapshots, team1Name, team2Name, colors }: { snapshots: PredictionSnapshot[]; team1Name: string; team2Name: string; colors: ThemeColors }) => {
    if (!snapshots || snapshots.length < 2) return null;

    const maxHeight = 100;
    
    return (
        <View style={{ 
            backgroundColor: colors.surface, 
            borderRadius: Layout.radiusLg, 
            padding: 24, 
            marginBottom: 16, 
            borderWidth: 1, 
            borderColor: colors.border, 
            ...Layout.shadow 
        }}>
            <Text style={{ ...getTypography(colors).label, marginBottom: 4 }}>PREDICTION TRACKER</Text>
            <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 16 }}>
                How spectator predictions shifted over the match. Based on {snapshots[snapshots.length - 1]?.totalVotes || 0} votes.
            </Text>
            
            {/* Simple bar chart visualization */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: maxHeight + 30, gap: 6 }}>
                    {snapshots.map((snap, idx) => (
                        <View key={idx} style={{ alignItems: 'center', width: 36 }}>
                            {/* Team 1 bar */}
                            <View style={{ 
                                width: 14, 
                                height: Math.max(4, (snap.team1Pct / 100) * maxHeight), 
                                backgroundColor: colors.primary, 
                                borderTopLeftRadius: 3, 
                                borderTopRightRadius: 3,
                                marginBottom: 2,
                            }} />
                            {/* Score label */}
                            <Text style={{ fontSize: 8, color: colors.textSecondary, fontWeight: '600' }}>
                                {snap.score1}-{snap.score2}
                            </Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.primary }} />
                    <Text style={{ ...getTypography(colors).bodySmall, fontSize: 11 }}>{team1Name} Win %</Text>
                </View>
            </View>
        </View>
    );
};

// --- Field Map Visualizer ---
const isValidCoord = (coord: any) => typeof coord?.x === 'number' && typeof coord?.y === 'number' && coord.x >= 0 && coord.y >= 0;

const getEventActors = (event: any) => {
    const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined);
    const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
    return { throwerId, receiverId };
};

const isDirectionalEvent = (event: any) => {
    if (!event) return false;
    const { throwerId, receiverId } = getEventActors(event);
    if (!throwerId || !receiverId) return false;

    return ['Pass', 'Drop', 'Throwaway', 'T', 'Goal', 'G'].includes(event.type);
};

const getReplayLineColor = (event: any) => {
    switch (event?.type) {
        case 'Goal':
        case 'G':
            return '#facc15';
        case 'Drop':
            return '#f97316';
        case 'Throwaway':
        case 'T':
            return '#ef4444';
        default:
            return '#60a5fa';
    }
};

const getReplayEventVisual = (event: any, colors: ThemeColors) => {
    switch (event?.type) {
        case 'Pickup':
            return { icon: 'radio-button-on', color: colors.primary, label: 'Disc Secured' };
        case 'T':
        case 'Throwaway':
            return { icon: 'close-circle', color: colors.error, label: 'Throwaway' };
        case 'Drop':
            return { icon: 'arrow-down-circle', color: '#f97316', label: 'Drop' };
        case 'D':
        case 'D-Block':
            return { icon: 'hand-left', color: colors.primary, label: 'Block' };
        case 'Opponent Turnover':
            return { icon: 'sync', color: colors.success, label: 'Opponent Turnover' };
        case 'Callahan_US':
            return { icon: 'flash', color: colors.success, label: 'Callahan' };
        case 'Callahan_THEM':
            return { icon: 'flash', color: '#b45309', label: 'Opp Callahan' };
        case 'Opponent Score':
            return { icon: 'flag', color: colors.error, label: 'Opponent Goal' };
        case 'Halftime':
            return { icon: 'pause-circle', color: colors.warning, label: 'Halftime' };
        case 'End Halftime':
            return { icon: 'play-circle', color: colors.success, label: 'Second Half Start' };
        case 'G':
        case 'Goal':
            return { icon: 'disc', color: '#FACC15', label: 'Goal' };
        case 'Pass':
            return { icon: 'swap-horizontal', color: '#60a5fa', label: 'Pass' };
        default:
            return { icon: 'ellipse', color: colors.textSecondary, label: event?.type || 'Event' };
    }
};

const getEventCoord = (event: any) => {
    if (isValidCoord(event?.fieldPosition)) return event.fieldPosition;
    if (isValidCoord(event?.fromFieldPosition)) return event.fromFieldPosition;
    return null;
};

const possessionStartTriggers = new Set([
    'Opponent Turnover',
    'D',
    'D-Block',
    'Callahan_US',
    'Callahan_THEM',
    'Opponent Score',
    'Goal',
    'G',
    'Halftime',
    'End Halftime',
    'T',
    'Throwaway',
    'Drop',
]);

const getPossessionStartCoord = (events: any[], activeIdx: number) => {
    for (let i = activeIdx; i >= 0; i--) {
        const event = events[i];
        if (i === 0 || possessionStartTriggers.has(event.type)) {
            return getEventCoord(event);
        }
    }
    return null;
};

const shortPlayerName = (players: Record<string, any> | undefined, playerId?: string) => {
    if (!playerId) return 'Unknown';
    const fullName = players?.[playerId]?.name || 'Unknown';
    return fullName.split(' ')[0] || fullName;
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

const zoneValueFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(100, x));
    const base = clamped / 100;
    const redZoneBonus = clamped >= 82 ? 0.35 : 0;
    const ownEndzonePenalty = clamped <= 18 ? -0.15 : 0;
    return base + redZoneBonus + ownEndzonePenalty;
};

const zoneBucket = (coord: { x: number; y: number }) => {
    const xZone = coord.x < 33 ? 'Backfield' : coord.x < 67 ? 'Midfield' : 'Attack';
    const yZone = coord.y < 33 ? 'Home Lane' : coord.y < 67 ? 'Center Lane' : 'Far Lane';
    return `${xZone} • ${yZone}`;
};

const classifyThrowProfile = (dx: number, dy: number, distance: number, toX: number) => {
    if (toX >= 82 && distance >= 16) return 'Red Zone Attack';
    if (distance >= 32 && dx >= 18) return 'Huck';
    if (Math.abs(dy) >= 20) return 'Break';
    if (distance <= 12) return 'Reset';
    return 'Under';
};

const estimateWinProb = (ourScore: number, oppScore: number, target: number) => {
    const scoreDiff = ourScore - oppScore;
    const pace = (ourScore + oppScore) - target;
    const z = (scoreDiff * 0.85) + (pace * 0.18);
    return 1 / (1 + Math.exp(-z));
};

type ChemistryPairing = {
    key: string;
    throwerId: string;
    receiverId: string;
    thrower: string;
    receiver: string;
    attempts: number;
    completions: number;
    turnovers: number;
    goalLinks: number;
    distanceTotal: number;
    distanceSamples: number;
    netAdvanceTotal: number;
    netAdvanceSamples: number;
    completionPct: number;
    turnoverPct: number;
    avgDistance: number;
    avgNetAdvance: number;
    chemistryScore: number;
};

const buildPassChemistry = (history: any[], players: Record<string, any> | undefined) => {
    if (!history?.length || !players) {
        return {
            pairings: [] as ChemistryPairing[],
            topChemistry: [] as ChemistryPairing[],
            mostUsed: null as ChemistryPairing | null,
            mostTrusted: null as ChemistryPairing | null,
            mostExplosive: null as ChemistryPairing | null,
        };
    }

    const pairings: Record<string, Omit<ChemistryPairing, 'completionPct' | 'turnoverPct' | 'avgDistance' | 'avgNetAdvance' | 'chemistryScore'>> = {};

    history.forEach((event: any) => {
        const isCompletion = event.type === 'Pass' || event.type === 'Goal' || event.type === 'G';
        const isTurn = event.type === 'Throwaway' || event.type === 'T' || event.type === 'Drop';
        if (!isCompletion && !isTurn) return;

        const { throwerId, receiverId } = getEventActors(event);
        if (!throwerId || !receiverId) return;

        const key = `${throwerId}|${receiverId}`;
        if (!pairings[key]) {
            pairings[key] = {
                key,
                throwerId,
                receiverId,
                thrower: shortPlayerName(players, throwerId),
                receiver: shortPlayerName(players, receiverId),
                attempts: 0,
                completions: 0,
                turnovers: 0,
                goalLinks: 0,
                distanceTotal: 0,
                distanceSamples: 0,
                netAdvanceTotal: 0,
                netAdvanceSamples: 0,
            };
        }

        pairings[key].attempts += 1;
        if (isCompletion) pairings[key].completions += 1;
        if (isTurn) pairings[key].turnovers += 1;
        if (event.type === 'Goal' || event.type === 'G') pairings[key].goalLinks += 1;

        if (isValidCoord(event.fromFieldPosition) && isValidCoord(event.fieldPosition)) {
            const dx = event.fieldPosition.x - event.fromFieldPosition.x;
            const dy = event.fieldPosition.y - event.fromFieldPosition.y;
            pairings[key].distanceTotal += Math.sqrt((dx * dx) + (dy * dy));
            pairings[key].distanceSamples += 1;
            pairings[key].netAdvanceTotal += dx;
            pairings[key].netAdvanceSamples += 1;
        }
    });

    const finalized = Object.values(pairings)
        .filter((pair) => pair.attempts > 0)
        .map((pair) => {
            const completionPct = Math.round((pair.completions / pair.attempts) * 100);
            const turnoverPct = Math.round((pair.turnovers / pair.attempts) * 100);
            const avgDistance = pair.distanceSamples > 0 ? pair.distanceTotal / pair.distanceSamples : 0;
            const avgNetAdvance = pair.netAdvanceSamples > 0 ? pair.netAdvanceTotal / pair.netAdvanceSamples : 0;
            const confidence = Math.min(1, Math.log(pair.attempts + 1) / Math.log(12));
            const goalWeight = Math.min(1, pair.goalLinks / 3);
            const distanceWeight = Math.max(0, Math.min(1, avgDistance / 45));

            const chemistryScore = Math.round(
                confidence * (
                    completionPct * 0.55 +
                    (100 - turnoverPct) * 0.1 +
                    goalWeight * 100 * 0.2 +
                    distanceWeight * 100 * 0.15
                )
            );

            return {
                ...pair,
                completionPct,
                turnoverPct,
                avgDistance: Math.round(avgDistance),
                avgNetAdvance: Math.round(avgNetAdvance),
                chemistryScore,
            };
        })
        .sort((a, b) => {
            if (b.chemistryScore !== a.chemistryScore) return b.chemistryScore - a.chemistryScore;
            return b.attempts - a.attempts;
        });

    return {
        pairings: finalized,
        topChemistry: finalized.slice(0, 8),
        mostUsed: finalized.length ? [...finalized].sort((a, b) => b.attempts - a.attempts)[0] : null,
        mostTrusted: finalized.length
            ? [...finalized].filter((pair) => pair.attempts >= 3).sort((a, b) => {
                if (b.completionPct !== a.completionPct) return b.completionPct - a.completionPct;
                return b.attempts - a.attempts;
            })[0] || null
            : null,
        mostExplosive: finalized.length
            ? [...finalized].filter((pair) => pair.distanceSamples > 0).sort((a, b) => b.avgDistance - a.avgDistance)[0] || null
            : null,
    };
};

const resolveReplayCoords = (mapEvents: any[], activeIdx: number, activeEvent: any) => {
    let prevEvent = null;
    for (let i = activeIdx - 1; i >= 0; i--) {
        if (isValidCoord(mapEvents[i].fieldPosition) || isValidCoord(mapEvents[i].fromFieldPosition)) {
            prevEvent = mapEvents[i];
            break;
        }
    }

    const { throwerId, receiverId } = getEventActors(activeEvent);
    const isGoal = activeEvent.type === 'Goal' || activeEvent.type === 'G';

    // For goal events, always prefer the goal event endpoint when available.
    if (isGoal && throwerId && receiverId) {
        const goalFrom = isValidCoord(activeEvent?.fromFieldPosition) ? activeEvent.fromFieldPosition : null;
        const goalTo = isValidCoord(activeEvent?.fieldPosition) ? activeEvent.fieldPosition : null;

        for (let i = activeIdx - 1; i >= 0; i--) {
            const candidate = mapEvents[i];
            if (candidate.type !== 'Pass') continue;

            const actors = getEventActors(candidate);
            if (actors.throwerId === throwerId && actors.receiverId === receiverId) {
                const from = goalFrom || (isValidCoord(candidate.fromFieldPosition)
                    ? candidate.fromFieldPosition
                    : (isValidCoord(prevEvent?.fieldPosition) ? prevEvent.fieldPosition : null));
                const to = goalTo || (isValidCoord(candidate.fieldPosition)
                    ? candidate.fieldPosition
                    : null);

                if (from || to || goalTo) {
                    return { eventFrom: from, eventTo: to, prevEvent };
                }
            }
        }

        // If no linked assist-pass found, avoid generic previous-event fallback for goals.
        return { eventFrom: goalFrom, eventTo: goalTo, prevEvent };
    }

    const eventFrom = isValidCoord(activeEvent?.fromFieldPosition)
        ? activeEvent.fromFieldPosition
        : (isValidCoord(prevEvent?.fieldPosition) ? prevEvent.fieldPosition : null);
    const eventTo = isValidCoord(activeEvent?.fieldPosition) ? activeEvent.fieldPosition : null;
    return { eventFrom, eventTo, prevEvent };
};

const FieldMapVisualizer = ({
    events,
    activeEventId,
    colors,
    ourTeamName,
    oppTeamName,
    players,
}: {
    events: any[];
    activeEventId: string | null;
    colors: any;
    ourTeamName: string;
    oppTeamName: string;
    players?: Record<string, any>;
}) => {
    const [dim, setDim] = useState({ w: 0, h: 0 });

    if (!events || events.length === 0) return null;

    const mapEvents = events.filter((event: any) => isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition));
    if (mapEvents.length === 0) return null;

    const activeEventIdx = activeEventId ? mapEvents.findIndex((e: any) => e.id === activeEventId) : -1;
    let activeEvent = null;
    let resolvedActiveIdx = activeEventIdx;

    if (activeEventIdx !== -1) {
        activeEvent = mapEvents[activeEventIdx];
    } else {
         for (let i = mapEvents.length - 1; i >= 0; i--) {
             if (isValidCoord(mapEvents[i].fieldPosition) || isValidCoord(mapEvents[i].fromFieldPosition)) {
                 activeEvent = mapEvents[i];
                 resolvedActiveIdx = i;
                 break;
             }
         }
    }

    const { eventFrom, eventTo, prevEvent } = activeEvent
        ? resolveReplayCoords(mapEvents, resolvedActiveIdx, activeEvent)
        : { eventFrom: null, eventTo: null, prevEvent: null };

    if (!activeEvent || (!eventFrom && !eventTo)) {
        if (!activeEventId) return null;
        return (
            <View style={{ width: '100%', height: 120, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="location-outline" size={24} color={colors.textSecondary} style={{ marginBottom: 4 }} />
                <Text style={{ color: colors.textSecondary }}>No field position data for this event.</Text>
            </View>
        );
    }

    const activeMarker = eventTo || eventFrom;
    const { x, y } = activeMarker;
    const { throwerId, receiverId } = getEventActors(activeEvent);
    const throwerName = shortPlayerName(players, throwerId);
    const receiverName = shortPlayerName(players, receiverId || activeEvent?.playerId);
    const isDirectional = isDirectionalEvent(activeEvent);
    const eventVisual = getReplayEventVisual(activeEvent, colors);
    const isPassLike = activeEvent.type === 'Pass' || activeEvent.type === 'Goal' || activeEvent.type === 'G';

    const markerColor = eventVisual.color;
    const markerSize = isDirectional ? 20 : 24;

    const possessionStartCoord = getPossessionStartCoord(mapEvents, resolvedActiveIdx);
    const separationThreshold = 3;
    const hasSeparateStartMarker = !!(
        possessionStartCoord &&
        (Math.abs(possessionStartCoord.x - activeMarker.x) > separationThreshold || Math.abs(possessionStartCoord.y - activeMarker.y) > separationThreshold)
    );
    const showPossessionStartMarker = activeEvent?.type === 'Pickup' && hasSeparateStartMarker;

    let lineStyle: any = null;
    let arrowStyle: any = null;
    let contextLineStyle: any = null;
    const shouldDrawVector = dim.w > 0 && !!eventFrom && !!eventTo && isDirectionalEvent(activeEvent);
    if (shouldDrawVector) {
        const x1 = (eventFrom.x / 100) * dim.w;
        const y1 = (eventFrom.y / 100) * dim.h;
        const x2 = (eventTo.x / 100) * dim.w;
        const y2 = (eventTo.y / 100) * dim.h;

        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        if (length < 2) {
            lineStyle = null;
            arrowStyle = null;
        } else {
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const cX = (x1 + x2) / 2;
        const cY = (y1 + y2) / 2;
        const unitX = (x2 - x1) / length;
        const unitY = (y2 - y1) / length;
        const arrowX = x2 - (unitX * 14);
        const arrowY = y2 - (unitY * 14);
        const lineColor = getReplayLineColor(activeEvent);

        lineStyle = {
            position: 'absolute',
            left: cX - length / 2,
            top: cY - 1,
            width: length,
            height: 2.5,
            backgroundColor: lineColor,
            zIndex: 4,
            transform: [{ rotate: `${angle}deg` }],
        };

        arrowStyle = {
            position: 'absolute',
            left: arrowX - 6,
            top: arrowY - 6,
            width: 0,
            height: 0,
            borderTopWidth: 6,
            borderBottomWidth: 6,
            borderLeftWidth: 10,
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            borderLeftColor: lineColor,
            zIndex: 6,
            transform: [{ rotate: `${angle}deg` }],
        };
        }
    }

    // Standalone events intentionally render as marker-only (no contextual tail).

    const activeReplayLabel = isPassLike && throwerId
        ? `${throwerName} to ${receiverName}`
        : `${eventVisual.label}: ${shortPlayerName(players, activeEvent.playerId)}`;

    return (
        <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                <Ionicons name="location" size={18} color={colors.textSecondary} />
                <Text style={{ ...getTypography(colors).label, marginBottom: 0 }}>PLAY VISUALIZER</Text>
            </View>
            <View 
                onLayout={(e) => setDim({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                style={{ width: '100%', height: 200, backgroundColor: '#15803d', borderRadius: Layout.radiusMd, overflow: 'hidden', borderWidth: 2, borderColor: '#166534', position: 'relative' }}
            >
                {/* Field lines */}
                <View style={{ position: 'absolute', left: '18%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
                <View style={{ position: 'absolute', left: '82%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
                <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <View style={{ position: 'absolute', left: 0, right: 0, top: '8%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: '8%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                
                <View style={{ position: 'absolute', left: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ width: 170, transform: [{ rotate: '-90deg' }] }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 17, fontWeight: 'bold', letterSpacing: 1.5, textAlign: 'center' }} numberOfLines={2}>
                            {formatEndzoneLabel(oppTeamName)}
                        </Text>
                    </View>
                </View>
                <View style={{ position: 'absolute', right: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                     <View style={{ width: 170, transform: [{ rotate: '90deg' }] }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 17, fontWeight: 'bold', letterSpacing: 1.5, textAlign: 'center' }} numberOfLines={2}>
                            {formatEndzoneLabel(ourTeamName)}
                        </Text>
                    </View>
                </View>

                {/* Trajectory vector */}
                {contextLineStyle && <View style={contextLineStyle} />}
                {lineStyle && <View style={lineStyle} />}
                {arrowStyle && (
                    <View style={arrowStyle} />
                )}

                {/* Pass start marker */}
                {shouldDrawVector && eventFrom && (
                    <View style={{
                        position: 'absolute', left: `${eventFrom.x}%`, top: `${eventFrom.y}%`,
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: '#60a5fa', borderWidth: 2, borderColor: '#fff',
                        marginLeft: -7, marginTop: -7,
                        zIndex: 5,
                    }} />
                )}

                {showPossessionStartMarker && possessionStartCoord && (
                    <View style={{
                        position: 'absolute', left: `${possessionStartCoord.x}%`, top: `${possessionStartCoord.y}%`,
                        width: 16, height: 16, borderRadius: 8,
                        backgroundColor: 'rgba(15,23,42,0.85)',
                        borderWidth: 2, borderColor: '#e2e8f0',
                        marginLeft: -8, marginTop: -8,
                        alignItems: 'center', justifyContent: 'center',
                        zIndex: 5,
                    }}>
                        <Ionicons name="play" size={9} color="#e2e8f0" />
                    </View>
                )}

                {/* Active Marker */}
                <View style={{
                    position: 'absolute', left: `${x}%`, top: `${y}%`,
                    width: markerSize, height: markerSize, borderRadius: markerSize / 2,
                    backgroundColor: isDirectional ? markerColor : 'rgba(15,23,42,0.78)',
                    borderWidth: 2,
                    borderColor: isDirectional ? '#000' : markerColor,
                    marginLeft: -(markerSize / 2), marginTop: -(markerSize / 2),
                    shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 4, elevation: 4,
                    zIndex: 7,
                }} />

                {!isDirectional && (
                    <View style={{
                        position: 'absolute',
                        left: `${x}%`,
                        top: `${y}%`,
                        marginLeft: -8,
                        marginTop: -8,
                        zIndex: 8,
                    }}>
                        <Ionicons name={eventVisual.icon as any} size={16} color={markerColor} />
                    </View>
                )}
            </View>

            <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusSm, padding: 10 }}>
                <Text style={{ ...getTypography(colors).label, marginBottom: 2 }}>{activeEvent.type.toUpperCase()}</Text>
                <Text style={{ ...getTypography(colors).bodySmall, color: colors.text }}>{activeReplayLabel}</Text>
                {!isDirectional && (
                    <Text style={{ ...getTypography(colors).bodySmall, color: colors.textSecondary, marginTop: 4 }}>
                        Standalone events are shown as single map markers.
                    </Text>
                )}
            </View>
        </View>
    );
};

export default function GameHistoryScreen() {
    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);
    const { gameId, newGame } = useLocalSearchParams<{ gameId: string, newGame?: string }>();
    const [game, setGame] = useState<GameState | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const [activeMapEventId, setActiveMapEventId] = useState<string | null>(null);
    const [isReplayAutoPlaying, setIsReplayAutoPlaying] = useState(false);
    const [replaySpeedMs, setReplaySpeedMs] = useState<number>(1200);
    const [scrubberWidth, setScrubberWidth] = useState(0);
    const [isRepairingLegacy, setIsRepairingLegacy] = useState(false);
    const [streamEmbedKey, setStreamEmbedKey] = useState<number>(0);
    const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState(newGame === 'true');
    const [infoDialog, setInfoDialog] = useState<{ title: string; message: string; icon?: keyof typeof Ionicons.glyphMap; accentColor?: string } | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const boxScoreRef = useRef<View>(null);
    const [isSharing, setIsSharing] = useState(false);

    const openMetricHelp = (title: string, explanation: string) => {
        setInfoDialog({ title, message: explanation, icon: 'help-circle-outline' });
    };

    useEffect(() => {
        if (!gameId) return;
        let cancelled = false;
        let teamUnsub: (() => void) | null = null;

        const loadContent = async () => {
            const fetchedGame = await GameService.getGameById(gameId);
            if (cancelled) return;
            setGame(fetchedGame);

            if (fetchedGame?.team1Id) {
                teamUnsub = TeamService.subscribeToTeam(fetchedGame.team1Id, (t) => {
                    if (!cancelled) setTeam(t);
                });
            }
        };

        loadContent();

        return () => {
            cancelled = true;
            if (teamUnsub) teamUnsub();
        };
    }, [gameId]);

    useEffect(() => {
        if (!game?.history?.length) return;
        const replayable = game.history.filter((event: any) => isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition));
        if (!replayable.length) return;

        const hasActive = activeMapEventId ? replayable.some((event: any) => event.id === activeMapEventId) : false;
        if (!hasActive) {
            setActiveMapEventId(replayable[replayable.length - 1].id || null);
        }
    }, [game?.gameId, game?.history, activeMapEventId]);

    useEffect(() => {
        if (!isReplayAutoPlaying) return;

        const replayable = (game?.history || []).filter((event: any) => isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition));
        if (replayable.length <= 1) return;

        const timer = setInterval(() => {
            setActiveMapEventId((currentId) => {
                const idx = currentId ? replayable.findIndex((event: any) => event.id === currentId) : -1;
                if (idx === -1) {
                    return replayable[0].id || null;
                }

                if (idx >= replayable.length - 1) {
                    setIsReplayAutoPlaying(false);
                    return replayable[replayable.length - 1].id || null;
                }

                return replayable[idx + 1].id || null;
            });
        }, replaySpeedMs);

        return () => clearInterval(timer);
    }, [isReplayAutoPlaying, replaySpeedMs, game?.history]);

    const formatEventMessage = (event: any) => {
        const playerName = team?.players?.[event.playerId]?.name || 'Unknown Player';
        const assistName = team?.players?.[event.assistPlayerId]?.name;
        const throwerName = team?.players?.[event.fromPlayerId || event.assistPlayerId]?.name;
        const receiverName = team?.players?.[event.toPlayerId || event.playerId]?.name;
        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        switch (event.type) {
            case 'Pickup': return { icon: 'radio-button-on', color: colors.primary, title: 'Pickup', desc: `${playerName} secured the disc.`, time };
            case 'G': return { icon: 'disc', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time, isGoal: true };
            case 'Goal': return { icon: 'disc', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time, isGoal: true };
            case 'D': return { icon: 'hand-left', color: colors.primary, title: 'Defense', desc: `Block by ${playerName}.`, time };
            case 'T': return { icon: 'close-circle', color: colors.error, title: 'Throwaway', desc: throwerName && receiverName ? `Throwaway by ${throwerName} intended for ${receiverName}.` : (assistName ? `Turnover by ${assistName} intended for ${playerName}.` : `Turnover by ${playerName}.`), time };
            case 'Drop': return { icon: 'arrow-down-circle', color: colors.warning, title: 'Drop', desc: throwerName && receiverName ? `Drop by ${receiverName} off pass from ${throwerName}.` : (assistName ? `Drop by ${playerName} off pass from ${assistName}.` : `Turnover by ${playerName}.`), time };
            case 'Pass': return { icon: 'swap-horizontal', color: colors.textSecondary, title: 'Pass', desc: throwerName && receiverName ? `Pass from ${throwerName} to ${receiverName}.` : (assistName ? `Pass from ${assistName} to ${playerName}.` : `${playerName} completed pass.`), time };
            case 'Callahan_US': return { icon: 'flash', color: colors.success, title: `${team?.name} Callahan`, desc: `${playerName} intercepted for a goal!`, time, isGoal: true };
            case 'Callahan_THEM': return { icon: 'flash', color: '#b45309', title: 'Opp. Callahan', desc: `Opponent intercepted ${playerName} for a goal!`, time };
            case 'Opponent Score': return { icon: 'flag', color: colors.error, title: 'Opponent Goal', desc: `Opponent scored.`, time, isGoal: true };
            case 'Opponent Turnover': return { icon: 'sync', color: colors.success, title: 'Opp. Turnover', desc: `Opponent turned it over.`, time };
            case 'Halftime': return { icon: 'pause-circle', color: colors.textSecondary, title: 'HALFTIME', desc: `First half completed.`, time };
            case 'End Halftime': return { icon: 'play-circle', color: colors.textSecondary, title: 'RESUME', desc: `Second half started.`, time };
            default: return { icon: 'information-circle', color: colors.textSecondary, title: 'System Event', desc: `Game Event: ${event.type}`, time };
        }
    };

    const handleDelete = () => {
        setShowDeleteConfirm(true);
    };

    const handleDeleteConfirmed = async () => {
        setShowDeleteConfirm(false);
        try {
            const requesterId = auth.currentUser?.uid || '';
            if (!requesterId) {
                throw new Error('Not authenticated');
            }
            await GameService.deleteGame(gameId, requesterId);
            router.replace('/(tabs)/teams');
        } catch {
            setInfoDialog({
                title: 'Delete Failed',
                message: 'Could not delete this match record. Please try again.',
                icon: 'warning-outline',
                accentColor: colors.error,
            });
        }
    };

    // --- SHARE BOX SCORE ---
    const handleShareBoxScore = async () => {
        setIsSharing(true);
        try {
            if (Platform.OS === 'web') {
                // On web, just use the Share API with text
                const shareText = `${team?.name} ${ourScore} - ${theirScore} ${opponentName}${mvp ? ` | MVP: ${mvp.name}` : ''} #RealUltimate`;
                if (navigator.share) {
                    await navigator.share({ text: shareText });
                } else {
                    await navigator.clipboard.writeText(shareText);
                    setInfoDialog({ title: 'Copied', message: 'Score copied to clipboard.', icon: 'copy-outline' });
                }
            } else {
                // On native, capture the box score card as an image
                if (boxScoreRef.current) {
                    const uri = await captureRef(boxScoreRef, {
                        format: 'png',
                        quality: 1,
                    });
                    
                    const isAvailable = await Sharing.isAvailableAsync();
                    if (isAvailable) {
                        await Sharing.shareAsync(uri, {
                            mimeType: 'image/png',
                            dialogTitle: 'Share Match Result',
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Share error:', e);
        } finally {
            setIsSharing(false);
        }
    };

    // --- TIMESTAMP BOOKMARKS ---
    const handleWatchGoal = (event: any) => {
        if (!streamConfig || !streamConfig.videoId || !event.gameElapsedSec) return;
        
        // Subtract estimated stream delay (15 seconds)
        const adjustedSeconds = Math.max(0, event.gameElapsedSec - 15);
        if (streamConfig.type === 'youtube') {
            const ytUrl = `https://www.youtube.com/embed/${streamConfig.videoId}?start=${adjustedSeconds}&autoplay=1`;
            setActiveStreamUrl(ytUrl);
            setStreamEmbedKey(prev => prev + 1);
        } else if (streamConfig.type === 'twitch') {
            const h = Math.floor(adjustedSeconds / 3600);
            const m = Math.floor((adjustedSeconds % 3600) / 60);
            const s = adjustedSeconds % 60;
            const twUrl = `https://player.twitch.tv/?video=${streamConfig.videoId}&time=${h}h${m}m${s}s&parent=localhost&autoplay=true`;
            setActiveStreamUrl(twUrl);
            setStreamEmbedKey(prev => prev + 1);
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
    const finalResultLabel = ourScore === theirScore ? 'Tie' : (isWin ? 'Win' : 'Loss');

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
        const { throwerId } = getEventActors(e);

        if (e.playerId && stats[e.playerId]) {
            if (e.type === 'G' || e.type === 'Goal') stats[e.playerId].goals++;
            if (e.type === 'Callahan_US') { stats[e.playerId].goals++; stats[e.playerId].blocks++; stats[e.playerId].callahans++; }
            if (e.type === 'D' || e.type === 'D-Block') stats[e.playerId].blocks++;
            if (e.type === 'T' || e.type === 'Drop' || e.type === 'Callahan_THEM') { stats[e.playerId].turns++; teamTurns++; }
        }

        if (e.type === 'Pass' && throwerId && stats[throwerId]) {
            stats[throwerId].passes++;
        }

        if (e.timeElapsedMs) {
            const possessionPlayerId = e.type === 'Pass' ? throwerId || e.playerId : e.playerId;
            if (possessionPlayerId && stats[possessionPlayerId]) {
                stats[possessionPlayerId].timeWithDisc += e.timeElapsedMs;
            }
        }

        if ((e.type === 'G' || e.type === 'Goal') && e.assistPlayerId && stats[e.assistPlayerId]) {
            stats[e.assistPlayerId].assists++;
        }

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
    const mvpStatsStr = mvp ? `${mvp.goals}G ${mvp.assists}A ${mvp.blocks}D${mvp.callahans > 0 ? ` ${mvp.callahans}C` : ''}` : '';
    const passChemistry = buildPassChemistry(game.history || [], team.players);

    const throwProfileStats: Record<string, { attempts: number; completions: number; turnovers: number; goals: number; distanceSum: number; samples: number }> = {};
    const completionHeat: Record<string, number> = {};
    const turnoverHeat: Record<string, number> = {};
    const scoringHeat: Record<string, number> = {};
    const workloadStats: Record<string, { id: string; name: string; touches: number; discMs: number; passAttempts: number; passTurnovers: number }> = {};

    let epvTotal = 0;
    let epvSamples = 0;
    let epvPositiveCount = 0;
    let clutchSuccess = 0;
    let clutchErrors = 0;
    let clutchSamples = 0;
    let runOurScore = 0;
    let runOppScore = 0;
    let prevWinProb = estimateWinProb(0, 0, game.gameTarget || 15);
    let biggestPositiveSwing: { swingPct: number; event: any; score: string } | null = null;
    let biggestNegativeSwing: { swingPct: number; event: any; score: string } | null = null;
    let forcedOpponentTurnovers = 0;
    let opponentScoringEvents = 0;
    let opponentRedZoneScores = 0;

    const ensureThrowProfile = (name: string) => {
        if (!throwProfileStats[name]) {
            throwProfileStats[name] = { attempts: 0, completions: 0, turnovers: 0, goals: 0, distanceSum: 0, samples: 0 };
        }
    };

    const ensureWorkload = (playerId?: string, defaultName = 'Unknown') => {
        if (!playerId) return;
        if (!workloadStats[playerId]) {
            workloadStats[playerId] = { id: playerId, name: team.players?.[playerId]?.name || defaultName, touches: 0, discMs: 0, passAttempts: 0, passTurnovers: 0 };
        }
    };

    (game.history || []).forEach((event: any) => {
        const { throwerId, receiverId } = getEventActors(event);
        const isCompletion = event.type === 'Pass' || event.type === 'Goal' || event.type === 'G';
        const isTurnover = event.type === 'Drop' || event.type === 'Throwaway' || event.type === 'T';

        ensureWorkload(throwerId);
        ensureWorkload(receiverId);

        if (throwerId) {
            workloadStats[throwerId].touches += 1;
            if (isCompletion || isTurnover) workloadStats[throwerId].passAttempts += 1;
            if (isTurnover) workloadStats[throwerId].passTurnovers += 1;
            if (event.timeElapsedMs) workloadStats[throwerId].discMs += event.timeElapsedMs;
        }
        if (receiverId && isCompletion) {
            workloadStats[receiverId].touches += 1;
        }

        if (isDirectionalEvent(event) && isValidCoord(event.fromFieldPosition) && isValidCoord(event.fieldPosition)) {
            const dx = event.fieldPosition.x - event.fromFieldPosition.x;
            const dy = event.fieldPosition.y - event.fromFieldPosition.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy));
            const profileName = classifyThrowProfile(dx, dy, distance, event.fieldPosition.x);
            ensureThrowProfile(profileName);
            throwProfileStats[profileName].attempts += 1;
            throwProfileStats[profileName].distanceSum += distance;
            throwProfileStats[profileName].samples += 1;
            if (isCompletion) throwProfileStats[profileName].completions += 1;
            if (isTurnover) throwProfileStats[profileName].turnovers += 1;
            if (event.type === 'Goal' || event.type === 'G') throwProfileStats[profileName].goals += 1;

            const fromValue = zoneValueFromX(event.fromFieldPosition.x);
            const toValue = zoneValueFromX(event.fieldPosition.x);
            const delta = toValue - fromValue;
            epvTotal += delta;
            epvSamples += 1;
            if (delta > 0) epvPositiveCount += 1;

            const bucket = zoneBucket(event.fieldPosition);
            if (isCompletion) completionHeat[bucket] = (completionHeat[bucket] || 0) + 1;
            if (isTurnover) turnoverHeat[bucket] = (turnoverHeat[bucket] || 0) + 1;
            if (event.type === 'Goal' || event.type === 'G') scoringHeat[bucket] = (scoringHeat[bucket] || 0) + 1;

            const highLeverage = Math.abs(runOurScore - runOppScore) <= 2 && Math.max(runOurScore, runOppScore) >= Math.max(2, game.gameTarget - 6);
            if (highLeverage) {
                clutchSamples += 1;
                if (isCompletion) clutchSuccess += 1;
                if (isTurnover) clutchErrors += 1;
            }
        }

        if (event.type === 'D' || event.type === 'D-Block' || event.type === 'Opponent Turnover' || event.type === 'Callahan_US') {
            forcedOpponentTurnovers += 1;
        }

        let scoreChanged = false;
        if (event.type === 'G' || event.type === 'Goal' || event.type === 'Callahan_US') {
            runOurScore += 1;
            scoreChanged = true;
        } else if (event.type === 'Opponent Score' || event.type === 'Callahan_THEM') {
            runOppScore += 1;
            opponentScoringEvents += 1;
            if (isValidCoord(event.fieldPosition) && event.fieldPosition.x >= 82) {
                opponentRedZoneScores += 1;
            }
            scoreChanged = true;
        }

        if (scoreChanged) {
            const nextWinProb = estimateWinProb(runOurScore, runOppScore, game.gameTarget || 15);
            const swingPct = Math.round((nextWinProb - prevWinProb) * 100);

            if (!biggestPositiveSwing || swingPct > biggestPositiveSwing.swingPct) {
                biggestPositiveSwing = { swingPct, event, score: `${runOurScore}-${runOppScore}` };
            }
            if (!biggestNegativeSwing || swingPct < biggestNegativeSwing.swingPct) {
                biggestNegativeSwing = { swingPct, event, score: `${runOurScore}-${runOppScore}` };
            }

            prevWinProb = nextWinProb;
        }
    });

    const throwProfileRows = Object.entries(throwProfileStats)
        .map(([name, s]) => ({
            name,
            attempts: s.attempts,
            completionPct: s.attempts ? Math.round((s.completions / s.attempts) * 100) : 0,
            turnoverPct: s.attempts ? Math.round((s.turnovers / s.attempts) * 100) : 0,
            avgDistance: s.samples ? Math.round(s.distanceSum / s.samples) : 0,
            goals: s.goals,
        }))
        .sort((a, b) => b.attempts - a.attempts);

    const topZone = (zones: Record<string, number>) => {
        const entries = Object.entries(zones);
        if (!entries.length) return null;
        entries.sort((a, b) => b[1] - a[1]);
        return { zone: entries[0][0], count: entries[0][1] };
    };

    const topCompletionZone = topZone(completionHeat);
    const topTurnoverZone = topZone(turnoverHeat);
    const topScoringZone = topZone(scoringHeat);

    const workloadRows = Object.values(workloadStats)
        .map((p) => {
            const loadScore = Math.round((p.touches * 1.3) + (p.discMs / 12000) + (p.passAttempts * 0.6) + (p.passTurnovers * 1.2));
            return {
                ...p,
                loadScore,
                avgHoldSec: p.passAttempts > 0 ? ((p.discMs / 1000) / p.passAttempts).toFixed(1) : '0.0',
            };
        })
        .sort((a, b) => b.loadScore - a.loadScore);

    const virtualLinePlayers = workloadRows.slice(0, 7);
    const virtualLinePlayerIds = virtualLinePlayers.map((p) => p.id);
    let lineChemistrySum = 0;
    let lineChemistryCount = 0;
    const linePairTotal = (virtualLinePlayerIds.length * (virtualLinePlayerIds.length - 1)) / 2;

    for (let i = 0; i < virtualLinePlayerIds.length; i++) {
        for (let j = i + 1; j < virtualLinePlayerIds.length; j++) {
            const a = virtualLinePlayerIds[i];
            const b = virtualLinePlayerIds[j];
            const forward = passChemistry.pairings.find((p) => p.throwerId === a && p.receiverId === b);
            const reverse = passChemistry.pairings.find((p) => p.throwerId === b && p.receiverId === a);
            const best = forward && reverse
                ? (forward.chemistryScore >= reverse.chemistryScore ? forward : reverse)
                : (forward || reverse || null);

            if (best) {
                lineChemistrySum += best.chemistryScore;
                lineChemistryCount += 1;
            }
        }
    }

    const virtualLineChemistry = lineChemistryCount > 0 ? Math.round(lineChemistrySum / lineChemistryCount) : 0;
    const virtualLineCoverage = linePairTotal > 0 ? Math.round((lineChemistryCount / linePairTotal) * 100) : 0;

    const epvAverage = epvSamples > 0 ? (epvTotal / epvSamples) : 0;
    const epvPositiveRate = epvSamples > 0 ? Math.round((epvPositiveCount / epvSamples) * 100) : 0;
    const clutchRating = clutchSamples > 0
        ? Math.max(0, Math.min(100, Math.round(50 + (clutchSuccess * 7) - (clutchErrors * 10))))
        : 50;
    const currentWinProbPct = Math.round(prevWinProb * 100);
    const opponentConversionOnDPoints = dLinePoints > 0 ? 100 - dLineEff : 0;
    const forcedOpponentTurnRate = (forcedOpponentTurnovers + opponentScoringEvents) > 0
        ? Math.round((forcedOpponentTurnovers / (forcedOpponentTurnovers + opponentScoringEvents)) * 100)
        : 0;
    const opponentRedZoneThreat = opponentScoringEvents > 0
        ? Math.round((opponentRedZoneScores / opponentScoringEvents) * 100)
        : 0;

    const replayableMapEvents = (game.history || []).filter((event: any) => isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition));
    const activeMapIndex = activeMapEventId ? replayableMapEvents.findIndex((event: any) => event.id === activeMapEventId) : -1;
    const canStepBackward = activeMapIndex > 0;
    const canStepForward = activeMapIndex !== -1 && activeMapIndex < replayableMapEvents.length - 1;

    const stepReplayEvent = (direction: -1 | 1) => {
        if (!replayableMapEvents.length) return;
        setIsReplayAutoPlaying(false);

        if (activeMapIndex === -1) {
            setActiveMapEventId(replayableMapEvents[replayableMapEvents.length - 1].id || null);
            return;
        }

        const nextIdx = Math.max(0, Math.min(replayableMapEvents.length - 1, activeMapIndex + direction));
        setActiveMapEventId(replayableMapEvents[nextIdx].id || null);
    };

    const activeMapSafeIndex = activeMapIndex === -1 ? Math.max(replayableMapEvents.length - 1, 0) : activeMapIndex;
    const replayProgressPct = replayableMapEvents.length > 1
        ? (activeMapSafeIndex / (replayableMapEvents.length - 1)) * 100
        : 0;

    const handleScrubberPress = (event: any) => {
        if (!replayableMapEvents.length || scrubberWidth <= 0) return;
        const x = typeof event?.nativeEvent?.locationX === 'number' ? event.nativeEvent.locationX : 0;
        const pct = Math.max(0, Math.min(1, x / scrubberWidth));
        const idx = Math.round(pct * (replayableMapEvents.length - 1));
        setActiveMapEventId(replayableMapEvents[idx].id || null);
        setIsReplayAutoPlaying(false);
    };

    const cycleReplaySpeed = () => {
        setReplaySpeedMs((prev) => {
            if (prev === 1800) return 1200;
            if (prev === 1200) return 700;
            return 1800;
        });
    };

    const replaySpeedLabel = replaySpeedMs === 1800 ? '0.75x' : replaySpeedMs === 1200 ? '1x' : '1.5x';

    const handleRepairLegacyData = async () => {
        if (!gameId || !isCoach || isRepairingLegacy) return;
        setIsRepairingLegacy(true);
        try {
            const result = await GameService.repairLegacyGameData(gameId);
            const refreshed = await GameService.getGameById(gameId);
            setGame(refreshed);

            setInfoDialog({
                title: 'Repair Complete',
                message: result.updated > 0
                    ? `Updated ${result.updated} of ${result.total} events with legacy pass/map data.`
                    : 'No legacy issues found to repair.',
                icon: 'construct-outline',
            });
        } catch {
            setInfoDialog({
                title: 'Repair Failed',
                message: 'Could not repair legacy game data.',
                icon: 'warning-outline',
                accentColor: colors.error,
            });
        } finally {
            setIsRepairingLegacy(false);
        }
    };

    const navToPlayer = (playerId: string) => {
        router.push(`/team/${team.id}/player/${playerId}`);
    };

    const streamConfig = getStreamConfig(game.streamUrl);
    const matchDate = game.history && game.history.length > 0 ? new Date(game.history[0].timestamp).toLocaleDateString() : 'Unknown Date';

    const handleOpenStreamExternal = async () => {
        const candidate = streamConfig?.originalUrl || '';
        const validated = validateExternalUrl(candidate, STREAM_HOST_ALLOWLIST);
        if (!validated.ok) {
            setInfoDialog({
                title: 'Blocked URL',
                message: 'This stream link is invalid or not from an allowed streaming host.',
                icon: 'warning-outline',
                accentColor: colors.error,
            });
            return;
        }
        await Linking.openURL(validated.url);
    };

    // Prediction data
    const predictionSnapshots = game.predictions?.snapshots || [];
    const hasPredictions = predictionSnapshots.length >= 2 && (game.predictions?.team1Votes || 0) + (game.predictions?.team2Votes || 0) >= 3;

    return (
        <View style={styles.container}>
            {/* UPGRADED WELCOME MODAL */}
            <Modal visible={showWelcomeModal} animationType="fade" transparent={true}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowWelcomeModal(false)}>
                    <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowWelcomeModal(false)}>
                            <Ionicons name="close" size={24} color={colors.textSecondary} />
                        </TouchableOpacity>
                        
                        {/* Animated result icon */}
                        <View style={[styles.modalIconBg, { backgroundColor: isWin ? '#dcfce7' : colors.errorBg }]}>
                            <Ionicons name={isWin ? "trophy" : "shield-half"} size={48} color={isWin ? colors.success : colors.error} />
                        </View>
                        <Text style={styles.modalHeader}>{isWin ? "Victory! 🎉" : "Tough battle out there."}</Text>
                        
                        {/* Score card */}
                        <View style={styles.modalScoreCard}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                <View style={{ alignItems: 'center', flex: 1 }}>
                                    <Text style={{ ...getTypography(colors).label, marginBottom: 4 }}>{team.name}</Text>
                                    <Text style={{ ...getTypography(colors).title, fontSize: 36, color: ourScore > theirScore ? colors.success : colors.text }}>{ourScore}</Text>
                                </View>
                                <Text style={{ ...getTypography(colors).title, fontSize: 20, color: colors.textSecondary, marginHorizontal: 12 }}>-</Text>
                                <View style={{ alignItems: 'center', flex: 1 }}>
                                    <Text style={{ ...getTypography(colors).label, marginBottom: 4 }}>{opponentName}</Text>
                                    <Text style={{ ...getTypography(colors).title, fontSize: 36, color: theirScore > ourScore ? colors.error : colors.text }}>{theirScore}</Text>
                                </View>
                            </View>
                        </View>

                        {mvp && (
                            <View style={styles.modalMvpSection}>
                                <Text style={styles.modalMvpTitle}>PLAYER OF THE MATCH</Text>
                                <View style={styles.modalMvpRow}>
                                    <View style={styles.modalMvpAvatar}>
                                        <Text style={styles.modalMvpAvatarText}>{mvp.name.substring(0,1).toUpperCase()}</Text>
                                    </View>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.modalPrimaryMvpName}>{mvp.name}</Text>
                                        <Text style={styles.modalMvpStats}>{mvpStatsStr}</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                            <TouchableOpacity style={styles.modalBtn} onPress={() => setShowWelcomeModal(false)} activeOpacity={0.8}>
                                <Text style={styles.modalBtnText}>View Report</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.modalBtn, { backgroundColor: '#7E22CE' }]} 
                                onPress={() => { setShowWelcomeModal(false); setTimeout(handleShareBoxScore, 300); }}
                                activeOpacity={0.8}
                            >
                                <Ionicons name="share-social" size={18} color="#fff" style={{ marginRight: 6 }} />
                                <Text style={styles.modalBtnText}>Share</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Modal>

            <BrandedDialog
                visible={!!infoDialog}
                title={infoDialog?.title || ''}
                message={infoDialog?.message || ''}
                colors={colors}
                icon={infoDialog?.icon}
                accentColor={infoDialog?.accentColor}
                onPrimary={() => setInfoDialog(null)}
            />

            <BrandedDialog
                visible={showDeleteConfirm}
                title="Delete Match Record?"
                message="This permanently removes the full match report and event history."
                colors={colors}
                icon="trash-outline"
                accentColor={colors.error}
                primaryLabel="Delete"
                secondaryLabel="Cancel"
                dismissOnBackdrop={false}
                onPrimary={handleDeleteConfirmed}
                onSecondary={() => setShowDeleteConfirm(false)}
            />

            <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                <View style={styles.topAppBar}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/teams')}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.topAppBarTitle} numberOfLines={1}>Match Report</Text>
                    <TouchableOpacity style={styles.backButton} onPress={handleShareBoxScore} disabled={isSharing}>
                        <Ionicons name="share-social-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                <View style={styles.mainContent}>
                    
                    {/* LIVE STREAM INTEGRATION */}
                    {streamConfig && streamConfig.type !== 'unknown' && (
                        <View style={styles.streamCard}>
                            <View style={styles.streamHeader}>
                                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                    <View style={[styles.liveBadge, { backgroundColor: colors.textSecondary }]}><Text style={styles.liveBadgeText}>VOD</Text></View>
                                    <Text style={[styles.sectionTitle, {marginLeft: 8, marginBottom: 0, fontWeight: '700', color: colors.text}]}>Match Recording</Text>
                                </View>
                                <TouchableOpacity onPress={handleOpenStreamExternal} style={styles.externalLinkBtn}>
                                    <Ionicons name="open-outline" size={16} color={colors.primary} />
                                    <Text style={styles.externalLinkText}>Open</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={styles.videoContainer}>
                                {Platform.OS === 'web' ? (
                                    <iframe 
                                        key={streamEmbedKey}
                                        src={activeStreamUrl || streamConfig.embedUrl} 
                                        style={{ width: '100%', height: '100%', border: 'none' }} 
                                        allow="autoplay; fullscreen" 
                                    />
                                ) : (
                                    <WebView 
                                        key={streamEmbedKey}
                                        source={{ uri: (activeStreamUrl || streamConfig.embedUrl) as string }} 
                                        style={styles.webview}
                                        allowsInlineMediaPlayback={true}
                                        mediaPlaybackRequiresUserAction={false}
                                        javaScriptEnabled={true}
                                        domStorageEnabled={true}
                                    />
                                )}
                            </View>
                        </View>
                    )}

                    {/* MATCH HEADER */}
                    <View style={[styles.card, { alignItems: 'center', paddingVertical: 24, paddingBottom: 32 }]}>
                        <Text style={styles.matchDate}>{matchDate}</Text>
                        <Text style={styles.matchTeams}>{team.name} vs {opponentName}</Text>
                        
                        <View style={styles.finalScoreBox}>
                            <TouchableOpacity style={styles.scoreSide} onPress={() => router.push(`/team/${team.id}`)}>
                                <TeamLogo name={team.name} />
                                <Text style={styles.scoreLabel} numberOfLines={1}>{team.name.toUpperCase()}</Text>
                                <Text style={[styles.scoreNumber, { color: ourScore > theirScore ? colors.success : colors.text }]}>{ourScore}</Text>
                            </TouchableOpacity>
                            
                            <View style={styles.scoreCenter}>
                                <Text style={styles.scoreDivider}>-</Text>
                            </View>

                            <TouchableOpacity style={styles.scoreSide} disabled={!!isGuest}>
                                <TeamLogo name={opponentName} isGuest={!!isGuest} />
                                <Text style={styles.scoreLabel} numberOfLines={1}>{opponentName.toUpperCase()}</Text>
                                <Text style={[styles.scoreNumber, { color: theirScore > ourScore ? colors.error : colors.text }]}>{theirScore}</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.finalText}>FINAL</Text>
                    </View>

                    {/* SHAREABLE BOX SCORE CARD (rendered off-screen for capture) */}
                    <View style={{ position: 'absolute', left: -9999, top: -9999 }}>
                        <ViewShot ref={boxScoreRef as any} options={{ format: 'png', quality: 1 }}>
                            <BoxScoreCard
                                ref={boxScoreRef}
                                teamName={team.name}
                                opponentName={opponentName}
                                ourScore={ourScore}
                                theirScore={theirScore}
                                mvpName={mvp?.name || null}
                                mvpStats={mvpStatsStr}
                                date={matchDate}
                                isWin={isWin}
                                colors={colors}
                            />
                        </ViewShot>
                    </View>

                    {/* SHARE TO SOCIALS BUTTON */}
                    <TouchableOpacity 
                        style={styles.shareBtn} 
                        onPress={handleShareBoxScore}
                        activeOpacity={0.7}
                        disabled={isSharing}
                    >
                        <Ionicons name="share-social" size={20} color="#fff" />
                        <Text style={styles.shareBtnText}>{isSharing ? 'Generating...' : 'Share Box Score to Socials'}</Text>
                    </TouchableOpacity>

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
                                    {mvp.goals} Goals • {mvp.assists} Assists • {mvp.blocks} Ds {mvp.callahans > 0 ? `• ${mvp.callahans} Callahans` : ''}
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
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>HEAD-TO-HEAD MATCHUP</Text>
                            <MetricHelp
                                title="Head-to-Head Matchup"
                                explanation="O-Line conversion tracks holds when your offense starts with possession. D-Line breaks track scores after your defense earns a turn."
                                color={colors.textSecondary}
                                onShow={openMetricHelp}
                            />
                        </View>
                        <View style={styles.h2hGrid}>
                            <View style={styles.h2hSide}>
                                <Text style={styles.h2hTitle} numberOfLines={1}>{team.name.toUpperCase()}</Text>
                                <Text style={[styles.h2hStat, { color: colors.success }]}>{oLineEff}% <Text style={styles.h2hLabel}>O-Line Conv.</Text></Text>
                                <Text style={[styles.h2hStat, { color: colors.primary }]}>{dLineEff}% <Text style={styles.h2hLabel}>D-Line Breaks</Text></Text>
                                <Text style={styles.h2hStat}>{teamTurns} <Text style={styles.h2hLabel}>Turnovers</Text></Text>
                            </View>
                            <View style={styles.h2hDivider} />
                            <View style={styles.h2hSide}>
                                <Text style={styles.h2hTitle} numberOfLines={1}>{opponentName.toUpperCase()}</Text>
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

                    {/* PREDICTION REPLAY CHART */}
                    {hasPredictions && (
                        <PredictionChart 
                            snapshots={predictionSnapshots} 
                            team1Name={team.name} 
                            team2Name={opponentName} 
                            colors={colors} 
                        />
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

                    {/* PASSING ANALYTICS */}
                    {team.players && passChemistry.topChemistry.length > 0 && (
                        <View style={styles.card}>
                            <View style={styles.sectionTitleRow}>
                                <Text style={styles.sectionTitle}>CHEMISTRY MATRIX</Text>
                                <MetricHelp
                                    title="Chemistry Matrix"
                                    explanation="Chemistry combines completion reliability, turnover control, goal links, throw threat, and sample confidence into one score."
                                    color={colors.textSecondary}
                                    onShow={openMetricHelp}
                                />
                            </View>
                            <Text style={styles.sectionSubtitle}>Weighted by completion %, turnover control, goal links, throw distance, and usage confidence.</Text>

                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                {passChemistry.mostUsed && (
                                    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusSm, padding: 8 }}>
                                        <Text style={{ ...getTypography(colors).label, marginBottom: 2 }}>Most Used</Text>
                                        <Text style={{ ...getTypography(colors).bodySmall, color: colors.text }} numberOfLines={1}>
                                            {passChemistry.mostUsed.thrower} to {passChemistry.mostUsed.receiver}
                                        </Text>
                                    </View>
                                )}
                                {passChemistry.mostTrusted && (
                                    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusSm, padding: 8 }}>
                                        <Text style={{ ...getTypography(colors).label, marginBottom: 2 }}>Most Trusted</Text>
                                        <Text style={{ ...getTypography(colors).bodySmall, color: colors.text }} numberOfLines={1}>
                                            {passChemistry.mostTrusted.thrower} to {passChemistry.mostTrusted.receiver}
                                        </Text>
                                    </View>
                                )}
                                {passChemistry.mostExplosive && (
                                    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusSm, padding: 8 }}>
                                        <Text style={{ ...getTypography(colors).label, marginBottom: 2 }}>Most Explosive</Text>
                                        <Text style={{ ...getTypography(colors).bodySmall, color: colors.text }} numberOfLines={1}>
                                            {passChemistry.mostExplosive.thrower} to {passChemistry.mostExplosive.receiver}
                                        </Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.tableHeader}>
                                <Text style={[styles.tableCol, { flex: 2, textAlign: 'left' }]}>Pairing</Text>
                                <Text style={styles.tableCol}>ATT</Text>
                                <Text style={styles.tableCol}>CMP%</Text>
                                <Text style={styles.tableCol}>TRN%</Text>
                                <Text style={styles.tableCol}>CHM</Text>
                            </View>
                            {passChemistry.topChemistry.map((pair, idx) => {
                                return (
                                    <View key={idx} style={styles.tableRow}>
                                        <Text style={[styles.tableCellName, { flex: 2 }]} numberOfLines={1}>
                                            <Text style={{fontWeight: 'bold'}}>{pair.thrower}</Text> to {pair.receiver}
                                        </Text>
                                        <Text style={styles.tableCell}>{pair.attempts}</Text>
                                        <Text style={[styles.tableCell, { color: pair.completionPct >= 75 ? colors.success : colors.text }]}>{pair.completionPct}%</Text>
                                        <Text style={[styles.tableCell, { color: pair.turnoverPct > 25 ? colors.error : colors.text }]}>{pair.turnoverPct}%</Text>
                                        <Text style={[styles.tableCell, { color: pair.chemistryScore >= 70 ? colors.primary : colors.text }]}>{pair.chemistryScore}</Text>
                                    </View>
                                )
                            })}

                            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                                {passChemistry.topChemistry.slice(0, 3).map((pair) => (
                                    <Text key={pair.key} style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                                        {pair.thrower} to {pair.receiver}: {pair.completions}/{pair.attempts} ({pair.completionPct}%)
                                        {pair.avgDistance > 0 ? `, Avg. distance ${pair.avgDistance}` : ''}
                                    </Text>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* EXPECTED POSSESSION VALUE */}
                    <View style={styles.card}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>EXPECTED POSSESSION VALUE (BETA)</Text>
                            <MetricHelp
                                title="Expected Possession Value (EPV)"
                                explanation="EPV estimates field-value change on each tracked throw. Positive values mean possessions are moving into stronger scoring territory, negative values mean possessions are drifting backward or becoming lower-value."
                                color={colors.textSecondary}
                                onShow={openMetricHelp}
                            />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <View style={[styles.statPill, { flex: 1 }]}>
                                <Text style={styles.statPillLabel}>Avg EPV Delta</Text>
                                <Text style={[styles.statPillValue, { color: epvAverage >= 0 ? colors.success : colors.error }]}>{epvAverage.toFixed(2)}</Text>
                            </View>
                            <View style={[styles.statPill, { flex: 1 }]}>
                                <Text style={styles.statPillLabel}>Positive EPV%</Text>
                                <Text style={styles.statPillValue}>{epvPositiveRate}%</Text>
                            </View>
                        </View>
                    </View>

                    {/* THROW PROFILE ENGINE */}
                    {throwProfileRows.length > 0 && (
                        <View style={styles.card}>
                            <View style={styles.sectionTitleRow}>
                                <Text style={styles.sectionTitle}>THROW PROFILE ENGINE (AUTO)</Text>
                                <MetricHelp
                                    title="Throw Profile Engine"
                                    explanation="Each throw is bucketed by distance and angle into profiles like Under, Break, Reset, Huck, and Red Zone Attack. This helps identify your offense identity and which throw types are most stable under pressure."
                                    color={colors.textSecondary}
                                    onShow={openMetricHelp}
                                />
                            </View>
                            <View style={styles.tableHeader}>
                                <Text style={[styles.tableCol, { flex: 2, textAlign: 'left' }]}>Type</Text>
                                <Text style={styles.tableCol}>ATT</Text>
                                <Text style={styles.tableCol}>CMP%</Text>
                                <Text style={styles.tableCol}>AVG D</Text>
                            </View>
                            {throwProfileRows.slice(0, 5).map((row) => (
                                <View key={row.name} style={styles.tableRow}>
                                    <Text style={[styles.tableCellName, { flex: 2 }]}>{row.name}</Text>
                                    <Text style={styles.tableCell}>{row.attempts}</Text>
                                    <Text style={[styles.tableCell, { color: row.completionPct >= 75 ? colors.success : colors.text }]}>{row.completionPct}%</Text>
                                    <Text style={styles.tableCell}>{row.avgDistance}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* VIRTUAL LINE CHEMISTRY */}
                    {virtualLinePlayers.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>VIRTUAL LINE CHEMISTRY (TOP 7 TOUCHES)</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                                <View style={[styles.statPill, { flex: 1 }]}>
                                    <Text style={styles.statPillLabel}>Line Chemistry</Text>
                                    <Text style={[styles.statPillValue, { color: virtualLineChemistry >= 70 ? colors.primary : colors.text }]}>{virtualLineChemistry}</Text>
                                </View>
                                <View style={[styles.statPill, { flex: 1 }]}>
                                    <Text style={styles.statPillLabel}>Pair Coverage</Text>
                                    <Text style={styles.statPillValue}>{virtualLineCoverage}%</Text>
                                </View>
                            </View>
                            <Text style={styles.sectionSubtitle}>Core unit: {virtualLinePlayers.map((p) => p.name.split(' ')[0]).join(', ')}</Text>
                        </View>
                    )}

                    {/* CLUTCH + SPECTATOR INTELLIGENCE */}
                    <View style={styles.card}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>CLUTCH + LIVE INTELLIGENCE</Text>
                            <MetricHelp
                                title="Clutch + Live Intelligence"
                                explanation="Clutch Rating rises when high-leverage throws are completed and drops when high-leverage errors occur. The win probability card is only shown as 'current' while a game is active."
                                color={colors.textSecondary}
                                onShow={openMetricHelp}
                            />
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                            <View style={[styles.statPill, { flex: 1 }]}>
                                <Text style={styles.statPillLabel}>Clutch Rating</Text>
                                <Text style={[styles.statPillValue, { color: clutchRating >= 60 ? colors.success : colors.text }]}>{clutchRating}</Text>
                            </View>
                            <View style={[styles.statPill, { flex: 1 }]}>
                                <Text style={styles.statPillLabel}>{game.isGameActive ? 'Current Win Prob.' : 'Final Result'}</Text>
                                <Text style={styles.statPillValue}>{game.isGameActive ? `${currentWinProbPct}%` : finalResultLabel}</Text>
                            </View>
                        </View>
                        {biggestPositiveSwing && (
                            <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                                Biggest positive swing: {biggestPositiveSwing.swingPct > 0 ? '+' : ''}{biggestPositiveSwing.swingPct}% ({biggestPositiveSwing.score})
                            </Text>
                        )}
                        {biggestNegativeSwing && (
                            <Text style={{ ...getTypography(colors).bodySmall }}>
                                Biggest negative swing: {biggestNegativeSwing.swingPct}% ({biggestNegativeSwing.score})
                            </Text>
                        )}
                    </View>

                    {/* HEATMAP HOTSPOTS */}
                    <View style={styles.card}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>HEATMAP HOTSPOTS (TEXT SUMMARY)</Text>
                            <MetricHelp
                                title="Heatmap Hotspots"
                                explanation="Hotspots summarize where completions, turnovers, and scores most frequently finish on the field."
                                color={colors.textSecondary}
                                onShow={openMetricHelp}
                            />
                        </View>
                        <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                            Completion hotspot: {topCompletionZone ? `${topCompletionZone.zone} (${topCompletionZone.count})` : 'Not enough data'}
                        </Text>
                        <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                            Turnover hotspot: {topTurnoverZone ? `${topTurnoverZone.zone} (${topTurnoverZone.count})` : 'Not enough data'}
                        </Text>
                        <Text style={{ ...getTypography(colors).bodySmall }}>
                            Scoring hotspot: {topScoringZone ? `${topScoringZone.zone} (${topScoringZone.count})` : 'Not enough data'}
                        </Text>
                    </View>

                    {/* WORKLOAD / FATIGUE */}
                    {workloadRows.length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>WORKLOAD / FATIGUE PROXY</Text>
                            <View style={styles.tableHeader}>
                                <Text style={[styles.tableCol, { flex: 2, textAlign: 'left' }]}>Player</Text>
                                <Text style={styles.tableCol}>Load</Text>
                                <Text style={styles.tableCol}>Touch</Text>
                                <Text style={styles.tableCol}>Hold(s)</Text>
                            </View>
                            {workloadRows.slice(0, 5).map((row) => (
                                <View key={row.id} style={styles.tableRow}>
                                    <Text style={[styles.tableCellName, { flex: 2 }]} numberOfLines={1}>{row.name.split(' ')[0]}</Text>
                                    <Text style={[styles.tableCell, { color: row.loadScore >= 16 ? colors.warning : colors.text }]}>{row.loadScore}</Text>
                                    <Text style={styles.tableCell}>{row.touches}</Text>
                                    <Text style={styles.tableCell}>{row.avgHoldSec}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* OPPONENT SCOUT CARD */}
                    <View style={styles.card}>
                        <View style={styles.sectionTitleRow}>
                            <Text style={styles.sectionTitle}>OPPONENT SCOUT CARD (BETA)</Text>
                            <MetricHelp
                                title="Opponent Scout Card"
                                explanation="Summarizes how often opponents convert after surviving your defense, how often your team forces turns, and where opponent scores are finishing."
                                color={colors.textSecondary}
                                onShow={openMetricHelp}
                            />
                        </View>
                        <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                            Conversion vs our D-line: {opponentConversionOnDPoints}%
                        </Text>
                        <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                            Forced opponent turn rate: {forcedOpponentTurnRate}%
                        </Text>
                        <Text style={{ ...getTypography(colors).bodySmall }}>
                            Opponent red-zone threat: {opponentRedZoneThreat}%
                        </Text>
                    </View>

                    {/* TIMELINE with Timestamp Bookmarks & Map */}
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>EVENT TIMELINE ({game.history?.length || 0})</Text>
                        
                        {(game.advancedTracking || game.fieldMapEnabled) && (
                            <>
                                {isCoach && (
                                    <TouchableOpacity
                                        style={[styles.watchGoalBtn, {
                                            marginBottom: 8,
                                            alignSelf: 'flex-end',
                                            backgroundColor: colors.surfaceSecondary,
                                            borderWidth: 1,
                                            borderColor: colors.border,
                                            opacity: isRepairingLegacy ? 0.7 : 1,
                                        }]}
                                        onPress={handleRepairLegacyData}
                                        disabled={isRepairingLegacy}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="construct" size={13} color={colors.primary} />
                                        <Text style={styles.watchGoalText}>{isRepairingLegacy ? 'Repairing...' : 'Repair Legacy Data'}</Text>
                                    </TouchableOpacity>
                                )}

                                {replayableMapEvents.length > 0 && (
                                    <View style={{ marginBottom: 10 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <TouchableOpacity
                                                style={[styles.watchGoalBtn, { opacity: canStepBackward ? 1 : 0.4 }]}
                                                onPress={() => stepReplayEvent(-1)}
                                                disabled={!canStepBackward}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="chevron-back" size={14} color={colors.primary} />
                                                <Text style={styles.watchGoalText}>Prev</Text>
                                            </TouchableOpacity>

                                            <Text style={{ ...getTypography(colors).bodySmall, color: colors.textSecondary }}>
                                                Step {activeMapSafeIndex + 1} / {replayableMapEvents.length}
                                            </Text>

                                            <TouchableOpacity
                                                style={[styles.watchGoalBtn, { opacity: canStepForward ? 1 : 0.4 }]}
                                                onPress={() => stepReplayEvent(1)}
                                                disabled={!canStepForward}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={styles.watchGoalText}>Next</Text>
                                                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                                            </TouchableOpacity>
                                        </View>

                                        <TouchableOpacity
                                            activeOpacity={1}
                                            onPress={handleScrubberPress}
                                            onLayout={(e) => setScrubberWidth(e.nativeEvent.layout.width)}
                                            style={{
                                                height: 24,
                                                justifyContent: 'center',
                                                marginBottom: 8,
                                            }}
                                        >
                                            <View style={{
                                                height: 6,
                                                borderRadius: 4,
                                                backgroundColor: colors.border,
                                                overflow: 'hidden',
                                            }}>
                                                <View style={{
                                                    width: `${replayProgressPct}%`,
                                                    height: '100%',
                                                    backgroundColor: colors.primary,
                                                }} />
                                            </View>
                                            <View style={{
                                                position: 'absolute',
                                                left: `${replayProgressPct}%`,
                                                marginLeft: -7,
                                                top: 5,
                                                width: 14,
                                                height: 14,
                                                borderRadius: 7,
                                                borderWidth: 2,
                                                borderColor: '#fff',
                                                backgroundColor: colors.primary,
                                            }} />
                                        </TouchableOpacity>

                                        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                                            <TouchableOpacity
                                                style={styles.watchGoalBtn}
                                                onPress={() => setIsReplayAutoPlaying((prev) => !prev)}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name={isReplayAutoPlaying ? 'pause' : 'play'} size={12} color={colors.primary} />
                                                <Text style={styles.watchGoalText}>{isReplayAutoPlaying ? 'Pause' : 'Autoplay'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.watchGoalBtn}
                                                onPress={cycleReplaySpeed}
                                                activeOpacity={0.7}
                                            >
                                                <Ionicons name="speedometer" size={12} color={colors.primary} />
                                                <Text style={styles.watchGoalText}>{replaySpeedLabel}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                <FieldMapVisualizer 
                                    events={game.history || []} 
                                    activeEventId={activeMapEventId} 
                                    colors={colors} 
                                    ourTeamName={team.name} 
                                    oppTeamName={opponentName} 
                                    players={team.players}
                                />
                            </>
                        )}

                        {streamConfig && streamConfig.videoId && (
                            <Text style={[styles.sectionSubtitle, { color: colors.primary }]}> 
                                🎥 Tap Watch to skip the video to the match event.
                            </Text>
                        )}
                        {(!game.history || game.history.length === 0) ? (
                            <Text style={styles.emptyText}>No events recorded.</Text>
                        ) : (
                            [...game.history].map((event, index) => {
                                 const formatted = formatEventMessage(event);
                                 const canWatch = streamConfig?.videoId && event.gameElapsedSec && event.gameElapsedSec > 0;
                                 const canMap = isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition);
                                 
                                 return (
                                     <View key={event.id || index} style={[styles.feedEventRow, activeMapEventId === event.id && { backgroundColor: isDark ? '#1e293b' : '#f1f5f9', borderRadius: 8, padding: 4 }]}>
                                         <View style={[styles.eventIconBox, { borderColor: formatted.color }]}>
                                             <Ionicons name={formatted.icon as any} size={18} color={formatted.color} />
                                         </View>
                                         <View style={styles.eventTextColumn}>
                                             <View style={styles.eventTitleRow}>
                                                 <Text style={[styles.eventTitle, { color: formatted.color }]}>{formatted.title}</Text>
                                                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                     {canMap && (
                                                         <TouchableOpacity 
                                                             style={styles.watchGoalBtn}
                                                             onPress={() => setActiveMapEventId(event.id || null)}
                                                             activeOpacity={0.7}
                                                         >
                                                             <Ionicons name="map" size={12} color={colors.textSecondary} />
                                                             <Text style={[styles.watchGoalText, { color: colors.textSecondary }]}>Map</Text>
                                                         </TouchableOpacity>
                                                     )}
                                                     {canWatch && (
                                                         <TouchableOpacity 
                                                             style={styles.watchGoalBtn}
                                                             onPress={() => handleWatchGoal(event)}
                                                             activeOpacity={0.7}
                                                         >
                                                             <Ionicons name="play-circle" size={14} color={colors.primary} />
                                                             <Text style={styles.watchGoalText}>Watch</Text>
                                                         </TouchableOpacity>
                                                     )}
                                                     <Text style={styles.eventTime}>{formatted.time}</Text>
                                                 </View>
                                             </View>
                                             <Text style={styles.eventDesc}>{formatted.desc}</Text>
                                         </View>
                                     </View>
                                 );
                            }).reverse()
                        )}
                    </View>

                    {hasPredictions && (
                        <PredictionChart 
                            snapshots={predictionSnapshots} 
                            team1Name={team.name} 
                            team2Name={opponentName} 
                            colors={colors} 
                        />
                    )}

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
    streamCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    streamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    liveBadge: { backgroundColor: colors.error, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
    externalLinkBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    externalLinkText: { color: colors.primary, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    videoContainer: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: Layout.radiusMd, overflow: 'hidden' },
    webview: { flex: 1, backgroundColor: 'transparent' },
    
    sectionTitle: { ...getTypography(colors).label, marginBottom: 16 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    sectionSubtitle: { ...getTypography(colors).bodySmall, marginTop: -8, marginBottom: 16 },

    matchDate: { ...getTypography(colors).label, color: colors.textSecondary, marginBottom: 8 },
    matchTeams: { ...getTypography(colors).title, fontSize: 22, textAlign: 'center', marginBottom: 24 },
    
    // Share Button
    shareBtn: { 
        flexDirection: 'row', 
        backgroundColor: '#7E22CE', 
        paddingVertical: 16, 
        borderRadius: Layout.radiusMd, 
        alignItems: 'center', 
        justifyContent: 'center', 
        marginBottom: 16, 
        gap: 8,
        ...Layout.shadow,
        shadowColor: '#7E22CE',
        shadowOpacity: 0.3,
        shadowRadius: 12,
    },
    shareBtnText: { ...getTypography(colors).button, color: '#fff' },

    // Watch Goal Button
    watchGoalBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 3, 
        backgroundColor: colors.primaryLight, 
        paddingHorizontal: 8, 
        paddingVertical: 3, 
        borderRadius: 8 
    },
    watchGoalText: { color: colors.primary, fontSize: 11, fontWeight: '700' },

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
    modalScoreCard: { backgroundColor: colors.surfaceSecondary, paddingVertical: 16, paddingHorizontal: 24, borderRadius: Layout.radiusMd, marginBottom: 24, width: '100%' },
    modalScoreText: { ...getTypography(colors).title, fontSize: 24 },
    modalMvpSection: { width: '100%', alignItems: 'flex-start', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20, marginBottom: 24 },
    modalMvpTitle: { ...getTypography(colors).label, color: colors.textSecondary, marginBottom: 12 },
    modalMvpRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    modalMvpAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    modalMvpAvatarText: { color: colors.onPrimary, fontWeight: 'bold', fontSize: 20 },
    modalPrimaryMvpName: { ...getTypography(colors).title, fontSize: 18, color: colors.text, marginBottom: 2 },
    modalMvpStats: { ...getTypography(colors).bodySmall, color: colors.primary, fontWeight: '600' },
    modalBtn: { flex: 1, flexDirection: 'row', backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
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

    statPill: {
        backgroundColor: colors.surfaceSecondary,
        borderRadius: Layout.radiusMd,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    statPillLabel: { ...getTypography(colors).bodySmall, marginBottom: 2 },
    statPillValue: { ...getTypography(colors).title, fontSize: 20 },

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
