import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { onValue, ref } from 'firebase/database';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { auth, db } from '../../../firebaseConfig';
import BrandedDialog from '../../../src/components/BrandedDialog';
import DemoRecorderStartModal from '../../components/DemoRecorderStartModal';
import HalftimeTimerModal from '../../components/HalftimeTimerModal';
import SceneShell from '../../components/SceneShell';
import { useGame } from '../../hooks/useGame';
import { flipFieldCoord, GameService } from '../../services/GameService';
import { ObserverRecordingScope, ObserverSessionService } from '../../services/ObserverSessionService';
import { TeamService } from '../../services/TeamService';
import { EventType, FieldCoordinate, GameState, GUEST_TEAM_ID, Player, Team, isRealTeamId } from '../../services/types';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../theme/ThemeContext';

const formatClock = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- Custom 3D Tactile Button ---
const TactileButton = ({ 
    title, 
    icon, 
    color, 
    onPress, 
    disabled, 
    flex = 1 
}: { 
    title: string; 
    icon: any; 
    color: string; 
    onPress: () => void; 
    disabled?: boolean; 
    flex?: number;
}) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const handlePressIn = () => {
        if (!disabled) {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            }
            Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, speed: 55, bounciness: 2 }).start();
        }
    };

    const handlePressOut = () => {
        if (!disabled) Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 80, useNativeDriver: true }).start();
    };

    return (
        <TouchableWithoutFeedback 
            onPress={disabled ? undefined : onPress} 
            onPressIn={disabled ? undefined : handlePressIn} 
            onPressOut={disabled ? undefined : handlePressOut}
        >
            <Animated.View style={[
                styles.tacticalBtn, 
                { backgroundColor: color, flex: flex ?? 1, transform: [{ scale: scaleAnim }] },
                disabled && styles.tacticalBtnDisabled
            ]}>
                <Ionicons name={icon} size={30} color={colors.onPrimary} style={{ marginBottom: 4 }} />
                <Text style={styles.tacticalBtnText}>{title}</Text>
            </Animated.View>
        </TouchableWithoutFeedback>
    );
};

// --- Field Map Inline Component (Premium Input) - HORIZONTAL ---
const FieldMap = ({
    coord,
    onLocationSelect,
    colors,
    ourTeamName,
    oppTeamName,
}: {
    coord: FieldCoordinate | null;
    onLocationSelect: (coord: FieldCoordinate) => void;
    colors: ThemeColors;
    ourTeamName: string;
    oppTeamName: string;
}) => {
    const [fieldLayout, setFieldLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

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

    const handleFieldPress = (event: any) => {
        // Use pageX/pageY relative to the field element via onLayout dimensions
        const { locationX, locationY, offsetX, offsetY } = event.nativeEvent;
        // Web uses offsetX/Y, Native uses locationX/Y
        const locX = offsetX !== undefined ? offsetX : locationX;
        const locY = offsetY !== undefined ? offsetY : locationY;
        
        const { width, height } = fieldLayout;
        
        if (width === 0 || height === 0 || locX === undefined || locY === undefined) return;
        
        // Horizontal field: x = across the length (left=their endzone, right=our endzone)
        // y = across the width (top=sideline, bottom=sideline)
        const rawX = Math.round((locX / width) * 100);
        const rawY = Math.round((locY / height) * 100);
        const newCoord = { 
            x: Math.max(0, Math.min(100, rawX)), 
            y: Math.max(0, Math.min(100, rawY)) 
        };
        
        // Safety check to ensure we never set NaN
        if (isNaN(newCoord.x) || isNaN(newCoord.y)) return;
        
        onLocationSelect(newCoord);
    };

    return (
        <View style={{ width: '100%', marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ ...getTypography(colors).label, fontSize: 13, letterSpacing: 1, marginBottom: 0 }}>FIELD MAP</Text>
                {coord && (
                    <TouchableOpacity onPress={() => onLocationSelect({ x: -1, y: -1 })}>
                        <Text style={{ ...getTypography(colors).bodySmall, color: colors.error, fontWeight: 'bold' }}>Clear Marker</Text>
                    </TouchableOpacity>
                )}
            </View>
            {/* HORIZONTAL field — left = their endzone, right = our endzone */}
            <TouchableOpacity 
                activeOpacity={1} 
                onPress={handleFieldPress}
                onLayout={(e) => setFieldLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
                style={{
                    width: '100%',
                    height: 200,
                    backgroundColor: '#15803d',
                    borderRadius: Layout.radiusMd,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: '#166534',
                    position: 'relative',
                }}
            >
                {/* pointerEvents="none" ensures that tapping on lines/labels doesn't mess up locationX coordinates */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    {/* Endzone lines (vertical) */}
                    <View style={{ position: 'absolute', left: '18%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
                    <View style={{ position: 'absolute', left: '82%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.5)' }} />
                    {/* Midfield (vertical center line) */}
                    <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                    {/* Sidelines (horizontal) */}
                    <View style={{ position: 'absolute', left: 0, right: 0, top: '8%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                    <View style={{ position: 'absolute', left: 0, right: 0, bottom: '8%', height: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                    
                    {/* Endzone labels (flipped to face outwards) */}
                    <View style={{ position: 'absolute', left: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ width: 170, transform: [{ rotate: '-90deg' }] }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 17, fontWeight: 'bold', letterSpacing: 1.5, textAlign: 'center' }} numberOfLines={2}>{formatEndzoneLabel(oppTeamName)}</Text>
                        </View>
                    </View>
                    <View style={{ position: 'absolute', right: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                         <View style={{ width: 170, transform: [{ rotate: '90deg' }] }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 17, fontWeight: 'bold', letterSpacing: 1.5, textAlign: 'center' }} numberOfLines={2}>{formatEndzoneLabel(ourTeamName)}</Text>
                        </View>
                    </View>

                    {/* Tap marker */}
                    {coord && coord.x !== -1 && (
                        <View style={{
                            position: 'absolute',
                            left: `${coord.x}%`,
                            top: `${coord.y}%`,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: '#FACC15',
                            borderWidth: 3,
                            borderColor: '#fff',
                            marginLeft: -11,
                            marginTop: -11,
                            shadowColor: '#FACC15',
                            shadowOpacity: 0.8,
                            shadowRadius: 8,
                            elevation: 6,
                        }} />
                    )}
                </View>
            </TouchableOpacity>
        </View>
    );
};

type PlayerPrepMetrics = {
    id: string;
    name: string;
    goals: number;
    assists: number;
    blocks: number;
    turns: number;
    passAttempts: number;
    passCompletions: number;
    passTurnovers: number;
    receptions: number;
    touches: number;
};

type LineAssistIntel = {
    offense: string[];
    defense: string[];
    corePair: string | null;
    riskPair: string | null;
    notes: string[];
    confidence: number;
};

const getEventActors = (event: any) => {
    const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined);
    const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
    return { throwerId, receiverId };
};

const buildLineAssistIntel = (team: Team | null, pastGames: GameState[], lineupSize = 7): LineAssistIntel | null => {
    if (!team?.players) return null;

    const playerIds = Object.keys(team.players);
    if (!playerIds.length) return null;

    const metrics: Record<string, PlayerPrepMetrics> = {};
    playerIds.forEach((id) => {
        metrics[id] = {
            id,
            name: team.players[id].name,
            goals: 0,
            assists: 0,
            blocks: 0,
            turns: 0,
            passAttempts: 0,
            passCompletions: 0,
            passTurnovers: 0,
            receptions: 0,
            touches: 0,
        };
    });

    const pairings: Record<string, { throwerName: string; receiverName: string; attempts: number; completions: number; turnovers: number }> = {};
    let totalTrackedPasses = 0;

    pastGames.forEach((game) => {
        (game.history || []).forEach((event: any) => {
            const { throwerId, receiverId } = getEventActors(event);
            const isCompletion = event.type === 'Pass' || event.type === 'Goal' || event.type === 'G';
            const isTurn = event.type === 'Throwaway' || event.type === 'T' || event.type === 'Drop';

            if (event.playerId && metrics[event.playerId]) {
                if (event.type === 'Goal' || event.type === 'G') metrics[event.playerId].goals += 1;
                if (event.type === 'Callahan_US') {
                    metrics[event.playerId].goals += 1;
                    metrics[event.playerId].blocks += 1;
                }
                if (event.type === 'D' || event.type === 'D-Block') metrics[event.playerId].blocks += 1;
                if (event.type === 'Throwaway' || event.type === 'T' || event.type === 'Drop' || event.type === 'Callahan_THEM') {
                    metrics[event.playerId].turns += 1;
                }
            }

            if ((event.type === 'Goal' || event.type === 'G') && event.assistPlayerId && metrics[event.assistPlayerId]) {
                metrics[event.assistPlayerId].assists += 1;
            }

            if (throwerId && metrics[throwerId] && (isCompletion || isTurn)) {
                metrics[throwerId].touches += 1;
                metrics[throwerId].passAttempts += 1;
                totalTrackedPasses += 1;

                if (isCompletion) metrics[throwerId].passCompletions += 1;
                if (isTurn) {
                    metrics[throwerId].passTurnovers += 1;
                    metrics[throwerId].turns += 1;
                }

                if (receiverId && metrics[receiverId] && isCompletion) {
                    metrics[receiverId].receptions += 1;
                    metrics[receiverId].touches += 1;
                }

                if (receiverId && metrics[receiverId]) {
                    const key = `${throwerId}|${receiverId}`;
                    if (!pairings[key]) {
                        pairings[key] = {
                            throwerName: metrics[throwerId].name,
                            receiverName: metrics[receiverId].name,
                            attempts: 0,
                            completions: 0,
                            turnovers: 0,
                        };
                    }
                    pairings[key].attempts += 1;
                    if (isCompletion) pairings[key].completions += 1;
                    if (isTurn) pairings[key].turnovers += 1;
                }
            }
        });
    });

    const players = Object.values(metrics).map((p) => {
        const passPct = p.passAttempts > 0 ? p.passCompletions / p.passAttempts : 0;
        const offenseScore =
            (p.goals * 2.2) +
            (p.assists * 1.9) +
            (p.receptions * 0.8) +
            (passPct * 20) +
            (p.touches * 0.25) -
            (p.passTurnovers * 1.4) -
            (p.turns * 0.8);

        const defenseScore =
            (p.blocks * 2.4) +
            ((p.goals > 0 ? 0.4 : 0)) +
            ((1 - passPct) * 4) +
            (p.touches * 0.15) -
            (p.turns * 0.6);

        return {
            ...p,
            offenseScore,
            defenseScore,
        };
    });

    const offense = [...players]
        .sort((a, b) => b.offenseScore - a.offenseScore)
        .slice(0, lineupSize)
        .map((p) => p.name.split(' ')[0]);

    const defense = [...players]
        .sort((a, b) => b.defenseScore - a.defenseScore)
        .slice(0, lineupSize)
        .map((p) => p.name.split(' ')[0]);

    const reliablePairs = Object.values(pairings).filter((pair) => pair.attempts >= 3);
    const corePair = reliablePairs.length
        ? [...reliablePairs].sort((a, b) => {
            const aPct = a.completions / a.attempts;
            const bPct = b.completions / b.attempts;
            if (bPct !== aPct) return bPct - aPct;
            return b.attempts - a.attempts;
        })[0]
        : null;

    const riskPair = reliablePairs.length
        ? [...reliablePairs].sort((a, b) => {
            const aRisk = a.turnovers / a.attempts;
            const bRisk = b.turnovers / b.attempts;
            if (bRisk !== aRisk) return bRisk - aRisk;
            return b.attempts - a.attempts;
        })[0]
        : null;

    const offenseAnchor = players.length ? [...players].sort((a, b) => b.offenseScore - a.offenseScore)[0] : null;
    const defenseAnchor = players.length ? [...players].sort((a, b) => b.defenseScore - a.defenseScore)[0] : null;

    const notes: string[] = [];
    if (offenseAnchor) notes.push(`Offensive hub: ${offenseAnchor.name.split(' ')[0]} (${offenseAnchor.goals}G/${offenseAnchor.assists}A historical impact).`);
    if (defenseAnchor) notes.push(`Defensive tone-setter: ${defenseAnchor.name.split(' ')[0]} (${defenseAnchor.blocks} blocks tracked).`);
    if (corePair) {
        const pct = Math.round((corePair.completions / corePair.attempts) * 100);
        notes.push(`Lean on ${corePair.throwerName.split(' ')[0]} to ${corePair.receiverName.split(' ')[0]} (${pct}% on ${corePair.attempts} looks).`);
    }
    if (riskPair && riskPair.turnovers > 0) {
        const riskPct = Math.round((riskPair.turnovers / riskPair.attempts) * 100);
        notes.push(`Watch-risk link: ${riskPair.throwerName.split(' ')[0]} to ${riskPair.receiverName.split(' ')[0]} (${riskPct}% turnovers).`);
    }

    const confidence = Math.max(20, Math.min(99, Math.round((Math.log(totalTrackedPasses + 1) / Math.log(220)) * 100)));

    return {
        offense,
        defense,
        corePair: corePair ? `${corePair.throwerName.split(' ')[0]} to ${corePair.receiverName.split(' ')[0]}` : null,
        riskPair: riskPair && riskPair.turnovers > 0 ? `${riskPair.throwerName.split(' ')[0]} to ${riskPair.receiverName.split(' ')[0]}` : null,
        notes,
        confidence,
    };
};

export default function RecorderScreen() {
    const {
        teamId,
        scheduledGameId,
        prefOpponentName,
        prefOpponentTeamId,
        prefLocation,
        tournamentId,
        tournamentMatchId,
        tournamentParticipantId,
        tournamentSlot,
        dualGameId: dualGameIdParam,
    } = useLocalSearchParams<{
        teamId: string;
        scheduledGameId?: string;
        prefOpponentName?: string;
        prefOpponentTeamId?: string;
        prefLocation?: string;
        tournamentId?: string;
        tournamentMatchId?: string;
        tournamentParticipantId?: string;
        tournamentSlot?: 'A' | 'B';
        dualGameId?: string;
    }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const isDualObserverPortal = teamId === 'dual_observer';
    const resolvedDualGameId = typeof dualGameIdParam === 'string' ? dualGameIdParam : Array.isArray(dualGameIdParam) ? dualGameIdParam[0] : '';
    const resolvedPrefOpponentTeamId =
        typeof prefOpponentTeamId === 'string'
            ? prefOpponentTeamId
            : Array.isArray(prefOpponentTeamId)
              ? prefOpponentTeamId[0]
              : '';
    const resolvedScheduledGameId =
        typeof scheduledGameId === 'string' ? scheduledGameId : Array.isArray(scheduledGameId) ? scheduledGameId[0] : '';

    const [ourTeam, setOurTeam] = useState<Team | null>(null);
    const [dualTeam1, setDualTeam1] = useState<Team | null>(null);
    const [dualTeam2, setDualTeam2] = useState<Team | null>(null);
    const [opponentAccessCode, setOpponentAccessCode] = useState('');
    const [opponentName, setOpponentName] = useState('');
    const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);
    const [allTeams, setAllTeams] = useState<Team[]>([]);
    const [opponentSearch, setOpponentSearch] = useState('');
    const [selectedOpponentTeamId, setSelectedOpponentTeamId] = useState<string | null>(null);

    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [observerRosterView, setObserverRosterView] = useState<'ours' | 'opponent'>('ours');
    const gameSubscriptionKey = isDualObserverPortal ? (resolvedDualGameId || undefined) : ourTeam?.activeGameId || undefined;
    const { gameState, recordEvent, undo, canUndo, startGame, endGame, updateStreamUrl, handOffRecording, overrideRecordingControl } = useGame(gameSubscriptionKey);

    const [lineup1, setLineup1] = useState<string[]>([]);
    const [lineup2, setLineup2] = useState<string[]>([]);
    const activeLineup = isDualObserverPortal && observerRosterView === 'opponent' ? lineup2 : lineup1;
    const setActiveLineup = (action: React.SetStateAction<string[]>) => {
        if (isDualObserverPortal && observerRosterView === 'opponent') {
            setLineup2(action);
        } else {
            setLineup1(action);
        }
    };

    // --- Setup State ---
    const [advancedTrackingSetup, setAdvancedTrackingSetup] = useState(false);
    const [observerModeSetup, setObserverModeSetup] = useState(false);
    const [fieldMapSetup, setFieldMapSetup] = useState(false);
    const [sotgEnabledSetup, setSotgEnabledSetup] = useState(false);
    const [streamUrlSetup, setStreamUrlSetup] = useState('');
    const [gameLocationSetup, setGameLocationSetup] = useState('');
    const [showSotgModal, setShowSotgModal] = useState(false);
    const [showMapGuideModal, setShowMapGuideModal] = useState(false);
    const [showHalftimeTimer, setShowHalftimeTimer] = useState(false);
    const [halftimeTimerState, setHalftimeTimerState] = useState({ isRunning: false, isEnded: false, display: '10:00' });
    const [showLineIntelHelp, setShowLineIntelHelp] = useState(false);
    const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);
    const [endGameConfirmCopy, setEndGameConfirmCopy] = useState({
        title: 'End Match',
        message: 'Finalize and view match report?',
    });
    const [sotgForm, setSotgForm] = useState({ rules: 2, fouls: 2, fairness: 2, attitude: 2, communication: 2 });
    const [prepGames, setPrepGames] = useState<GameState[]>([]);
    const [isPrepIntelLoading, setIsPrepIntelLoading] = useState(false);
    const [inGameStreamUrl, setInGameStreamUrl] = useState('');
    const [isSavingLiveStream, setIsSavingLiveStream] = useState(false);
    
    // In-Game Advanced Tracking
    const [discHolderId, setDiscHolderId] = useState<string | null>(null);
    const [prevHolderId, setPrevHolderId] = useState<string | null>(null);
    const [possessionStartTime, setPossessionStartTime] = useState<number | 0>(0);

    // Field Map
    const [pendingFieldCoord, setPendingFieldCoord] = useState<FieldCoordinate | null>(null);
    const [lastKnownPlayerCoords, setLastKnownPlayerCoords] = useState<Record<string, FieldCoordinate>>({});
    const [pendingPassTargetId, setPendingPassTargetId] = useState<string | null>(null);

    // Bench Hand-off
    const [showHandoffModal, setShowHandoffModal] = useState(false);
    const [handoffPinInput, setHandoffPinInput] = useState('');
    const [showMultiRecorderWarning, setShowMultiRecorderWarning] = useState(false);
    const [showDelegateModal, setShowDelegateModal] = useState(false);
    const [delegatePin, setDelegatePin] = useState('');
    const [delegateScope, setDelegateScope] = useState<ObserverRecordingScope>('team');
    const [isCreatingDelegateSession, setIsCreatingDelegateSession] = useState(false);

    // Check if current user is the active recorder
    const currentUserId = auth.currentUser?.uid;
    const isActiveRecorder = !gameState.currentRecorderId || gameState.currentRecorderId === currentUserId;
    const isObserverRecording = gameState.recordingLockOwner === 'observer' && !!gameState.delegatedRecorderUid;
    const isCoachViewLockedByObserver = isObserverRecording && !isActiveRecorder;
    const hasAppliedPrefillRef = useRef(false);
    const demoOpponentAutoFilledRef = useRef(false);

    const [demoPackProfile, setDemoPackProfile] = useState<{
        pack: boolean;
        coachId: string | null;
        followId: string | null;
    }>({ pack: false, coachId: null, followId: null });
    const [showDemoRecorderStartModal, setShowDemoRecorderStartModal] = useState(false);
    const [demoSetupGuideExpanded, setDemoSetupGuideExpanded] = useState(true);

    const selectedOpponentTeam = selectedOpponentTeamId
        ? allTeams.find((team) => team.id === selectedOpponentTeamId) || null
        : null;

    const filteredOpponentTeams = allTeams
        .filter((team) => team.id !== ourTeam?.id)
        .filter((team) => {
            const query = opponentSearch.trim().toLowerCase();
            if (!query) return false;
            return team.name.toLowerCase().includes(query);
        })
        .slice(0, 6);
    const hasOpponentSearchQuery = opponentSearch.trim().length > 0;
    const isObserverModeActive = gameState.recordingMode === 'observer';

    const rosterPerspectiveTeamId = isDualObserverPortal
        ? (observerRosterView === 'ours' ? gameState.team1Id : gameState.team2Id)
        : isObserverModeActive
            ? (observerRosterView === 'ours' ? (ourTeam?.id ?? '') : (gameState.team2Id || ''))
            : (ourTeam?.id ?? '');

    const rosterPlayers = (() => {
        if (isDualObserverPortal) {
            const tid = observerRosterView === 'ours' ? gameState.team1Id : gameState.team2Id;
            const live = tid === gameState.team1Id ? dualTeam1 : dualTeam2;
            if (live?.players && Object.keys(live.players).length > 0) return Object.values(live.players);
            const snap = gameState.neutralObserverRosters?.[tid || ''];
            return snap ? Object.values(snap) : [];
        }
        return ourTeam?.players ? Object.values(ourTeam.players) : [];
    })();

    const opponentRosterPlayers = (() => {
        if (isDualObserverPortal) {
            const tid = observerRosterView === 'ours' ? gameState.team2Id : gameState.team1Id;
            const live = tid === gameState.team1Id ? dualTeam1 : dualTeam2;
            if (live?.players && Object.keys(live.players).length > 0) return Object.values(live.players);
            const snap = gameState.neutralObserverRosters?.[tid || ''];
            return snap ? Object.values(snap) : [];
        }
        if (gameState.opponentRosterSnapshot) return Object.values(gameState.opponentRosterSnapshot);
        return opponentTeam?.players ? Object.values(opponentTeam.players) : [];
    })();

    const selectedOurPlayerId = rosterPlayers.some((player) => player.id === selectedPlayer) ? selectedPlayer : null;
    const selectedOpponentPlayerId = opponentRosterPlayers.some((player) => player.id === selectedPlayer) ? selectedPlayer : null;
    const activeLineType = rosterPerspectiveTeamId && gameState.possession === rosterPerspectiveTeamId ? 'O' : 'D';
    const offensivePerspective = !!rosterPerspectiveTeamId && gameState.possession === rosterPerspectiveTeamId;

    const loadTaggedLineup = (line: 'O' | 'D') => {
        const tagged = rosterPlayers.filter((player) => player.primaryLine === line);
        const flex = rosterPlayers.filter((player) => !player.primaryLine || player.primaryLine === 'flex');
        const fallback = rosterPlayers.filter((player) => player.primaryLine && player.primaryLine !== line);
        const nextLineup = [...tagged, ...flex, ...fallback].slice(0, lineupSize).map((player) => player.id);
        if (nextLineup.length > 0) {
            setActiveLineup(nextLineup);
        }
    };

    const buildLineupEventDetails = () => ({
        lineupPlayerIds: activeLineup.slice(0, lineupSize),
        lineType: activeLineType,
        pointNumber: gameState.currentPointNumber || 1,
    });

    const buildRosterSnapshot = (players?: Record<string, Player>) => {
        if (!players) return undefined;
        return Object.fromEntries(
            Object.values(players).map((player) => {
                const snapshot = {
                    id: player.id,
                    name: player.name,
                    ...(player.number ? { number: player.number } : {}),
                    teamId: player.teamId,
                    ...(player.primaryLine ? { primaryLine: player.primaryLine } : {}),
                    ...(player.position ? { position: player.position } : {}),
                };
                return [player.id, snapshot];
            })
        );
    };

    // Show multi-recorder warning if someone else is recording
    useEffect(() => {
        if (gameState.isGameActive && gameState.currentRecorderId && currentUserId && gameState.currentRecorderId !== currentUserId) {
            setShowMultiRecorderWarning(true);
        } else {
            setShowMultiRecorderWarning(false);
        }
    }, [gameState.currentRecorderId, currentUserId, gameState.isGameActive]);

    // Sync selected player visually with disc holder if tracking is on
    useEffect(() => {
        if (gameState.isGameActive && gameState.advancedTracking && gameState.possession === ourTeam?.id) {
            setSelectedPlayer(discHolderId);
        }
    }, [discHolderId, gameState.possession, gameState.advancedTracking, gameState.isGameActive, ourTeam?.id]);

    useEffect(() => {
        let isCancelled = false;
        let fallbackUnsubscribe: (() => void) | undefined;

        const dedupeTeams = (teams: Team[]) => {
            const keyed = new Map<string, Team>();
            teams.forEach((entry) => {
                if (!entry?.id || !entry?.name) return;
                if (!keyed.has(entry.id)) keyed.set(entry.id, entry);
            });
            return Array.from(keyed.values());
        };

        TeamService.getAllTeams()
            .then((teams) => {
                if (isCancelled) return;

                const normalized = dedupeTeams(teams);
                if (normalized.length > 0) {
                    setAllTeams(normalized);
                    return;
                }

                const userId = auth.currentUser?.uid;
                if (!userId) {
                    setAllTeams([]);
                    return;
                }

                fallbackUnsubscribe = TeamService.getTeamsForUser(userId, (coached, spectated) => {
                    if (isCancelled) return;
                    setAllTeams(dedupeTeams([...coached, ...spectated]));
                });
            })
            .catch(() => {
                if (!isCancelled) setAllTeams([]);
            });

        return () => {
            isCancelled = true;
            if (fallbackUnsubscribe) fallbackUnsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!currentUserId) {
            setDemoPackProfile({ pack: false, coachId: null, followId: null });
            return;
        }
        const profileRef = ref(db, `users/${currentUserId}/profile`);
        return onValue(profileRef, (snap) => {
            const d = snap.val();
            if (!d) {
                setDemoPackProfile({ pack: false, coachId: null, followId: null });
                return;
            }
            setDemoPackProfile({
                pack: !!d.demoSamplePackV1,
                coachId: typeof d.demoUniversityIowaTeamId === 'string' ? d.demoUniversityIowaTeamId : null,
                followId: typeof d.demoIowaStateTeamId === 'string' ? d.demoIowaStateTeamId : null,
            });
        });
    }, [currentUserId]);

    useEffect(() => {
        if (hasAppliedPrefillRef.current) return;
        const hasPrefill = !!(prefOpponentName || prefLocation || resolvedPrefOpponentTeamId);
        if (!hasPrefill) return;

        if (prefOpponentName) {
            setOpponentName(prefOpponentName);
        }
        if (prefLocation) {
            setGameLocationSetup(prefLocation);
        }

        if (resolvedPrefOpponentTeamId) {
            setSelectedOpponentTeamId(resolvedPrefOpponentTeamId);
            setOpponentAccessCode('');
            setOpponentSearch('');
        }

        hasAppliedPrefillRef.current = true;
    }, [prefOpponentName, prefLocation, resolvedPrefOpponentTeamId]);

    useEffect(() => {
        if (isDualObserverPortal || !teamId) return;
        if (resolvedScheduledGameId) return;
        if (resolvedPrefOpponentTeamId) return;
        if (demoOpponentAutoFilledRef.current) return;
        if (!demoPackProfile.pack || teamId !== demoPackProfile.coachId || !demoPackProfile.followId) return;
        const opp = allTeams.find((t) => t.id === demoPackProfile.followId);
        if (!opp) return;
        setSelectedOpponentTeamId(demoPackProfile.followId);
        setOpponentName(opp.name);
        setOpponentSearch(opp.name);
        setOpponentAccessCode('');
        demoOpponentAutoFilledRef.current = true;
    }, [
        isDualObserverPortal,
        teamId,
        resolvedScheduledGameId,
        resolvedPrefOpponentTeamId,
        demoPackProfile.pack,
        demoPackProfile.coachId,
        demoPackProfile.followId,
        allTeams,
    ]);

    useEffect(() => {
        setInGameStreamUrl(gameState.streamUrl || '');
    }, [gameState.streamUrl]);

    useEffect(() => {
        if (!gameState.isGameActive || !gameState.fieldMapEnabled) return;

        let isMounted = true;
        AsyncStorage.getItem('realultimate.mapGuideSeen.v1')
            .then((value) => {
                if (!isMounted || value === 'true') return;
                setShowMapGuideModal(true);
                return AsyncStorage.setItem('realultimate.mapGuideSeen.v1', 'true');
            })
            .catch(() => {
                if (isMounted) setShowMapGuideModal(true);
            });

        return () => {
            isMounted = false;
        };
    }, [gameState.isGameActive, gameState.fieldMapEnabled]);

    const normalizeCoord = (coord: FieldCoordinate | null | undefined): FieldCoordinate | undefined => {
        if (!coord) return undefined;
        if (coord.x < 0 || coord.y < 0) return undefined;
        return coord;
    };

    const rememberPlayerCoord = (playerId?: string | null, coord?: FieldCoordinate) => {
        if (!playerId || !coord) return;
        setLastKnownPlayerCoords(prev => ({ ...prev, [playerId]: coord }));
    };

    const completeTrackedPass = (receiverId: string, receiverCoord?: FieldCoordinate) => {
        if (!discHolderId || discHolderId === receiverId) return;

        const timeElapsedMs = possessionStartTime ? Date.now() - possessionStartTime : 0;
        const throwerCoord = normalizeCoord(lastKnownPlayerCoords[discHolderId]);

        recordEvent('Pass', {
            playerId: receiverId,
            assistPlayerId: discHolderId,
            fromPlayerId: discHolderId,
            toPlayerId: receiverId,
            timeElapsedMs,
            fromFieldPosition: throwerCoord,
            fieldPosition: receiverCoord,
        });

        rememberPlayerCoord(receiverId, receiverCoord);
        // Keep the confirmed receiver marker visible so a second tap is not needed.
        setPendingFieldCoord(receiverCoord || null);
        setPendingPassTargetId(null);
        setPrevHolderId(discHolderId);
        setDiscHolderId(receiverId);
        setSelectedPlayer(receiverId);
        setPossessionStartTime(Date.now());
    };

    const handlePlayerPress = (playerId: string) => {
        if (!gameState.isGameActive || !gameState.advancedTracking || gameState.possession !== rosterPerspectiveTeamId) {
            setSelectedPlayer(playerId);
            return;
        }
        
        if (!discHolderId) {
            setDiscHolderId(playerId);
            const pickupCoord = normalizeCoord(pendingFieldCoord);
            rememberPlayerCoord(playerId, pickupCoord);
            recordEvent('Pickup', {
                playerId,
                fieldPosition: pickupCoord,
            });
            setPossessionStartTime(Date.now());
        } else if (discHolderId !== playerId) {
            // With field map enabled, choose receiver first, then map tap confirms the pass endpoint.
            if (gameState.fieldMapEnabled) {
                setPendingPassTargetId(playerId);
                setSelectedPlayer(playerId);
                return;
            }

            const receiverCoord = normalizeCoord(pendingFieldCoord);
            completeTrackedPass(playerId, receiverCoord);
        }
    };

    // Animation specific
    const goalAnim = useRef(new Animated.Value(0)).current;
    const [goalSide, setGoalSide] = useState<'US' | 'THEM' | null>(null);

    const triggerGoalAnimation = (side: 'US' | 'THEM') => {
        setGoalSide(side);
        goalAnim.setValue(0);
        Animated.sequence([
            Animated.timing(goalAnim, { toValue: 1.5, duration: 300, useNativeDriver: true }),
            Animated.timing(goalAnim, { toValue: 0, duration: 400, delay: 500, useNativeDriver: true })
        ]).start();
    };

    const handleGoal = (type: EventType, details: any = {}) => {
        recordEvent(type, details);
        triggerGoalAnimation(type === 'Opponent Score' || type === 'Callahan_THEM' ? 'THEM' : 'US');
    };

    const handleAction = (type: EventType) => {
        if (pendingPassTargetId) {
            Alert.alert('Finish Pass First', 'Tap the receiver location on the map to confirm this pass before logging another event.');
            return;
        }

        const timeElapsedMs = possessionStartTime ? Date.now() - possessionStartTime : 0;
        const actorId = (() => {
            if (isDualObserverPortal) {
                return gameState.advancedTracking && gameState.possession === rosterPerspectiveTeamId
                    ? (discHolderId || selectedOurPlayerId || undefined)
                    : (selectedOurPlayerId || discHolderId || undefined);
            }
            if (type === 'Opponent Score' || type === 'Opponent Turnover' || type === 'Callahan_THEM') {
                return (isObserverModeActive ? selectedOpponentPlayerId : null) || undefined;
            }
            if (type === 'D' || type === 'Callahan_US') {
                return selectedOurPlayerId || undefined;
            }
            return gameState.advancedTracking && gameState.possession === rosterPerspectiveTeamId
                ? (discHolderId || selectedOurPlayerId || undefined)
                : (selectedOurPlayerId || discHolderId || undefined);
        })();
        const actorCoord = normalizeCoord(pendingFieldCoord);

        if (actorId && actorCoord) {
            rememberPlayerCoord(actorId, actorCoord);
        }

        if (type === 'G') {
            const assisterId = gameState.advancedTracking ? prevHolderId : undefined;
            const recentAssistPass = (gameState.history || []).slice().reverse().find((event: any) => {
                if (event.type !== 'Pass') return false;
                const throwerId = event.fromPlayerId || event.assistPlayerId || event.playerId;
                const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
                return throwerId === assisterId && receiverId === actorId;
            });

            handleGoal('G', { 
                playerId: actorId,
                assistPlayerId: assisterId,
                fromPlayerId: assisterId,
                toPlayerId: actorId,
                ...buildLineupEventDetails(),
                fromFieldPosition: recentAssistPass?.fromFieldPosition || (assisterId ? normalizeCoord(lastKnownPlayerCoords[assisterId]) : undefined),
                timeElapsedMs,
                // In ultimate, a goal is caught in the endzone; default to the scorer's tracked catch spot.
                fieldPosition: (actorId ? normalizeCoord(lastKnownPlayerCoords[actorId]) : undefined) || actorCoord,
            });
        } else if (type === 'Callahan_US' || type === 'Callahan_THEM' || type === 'Opponent Score') {
            handleGoal(type, { playerId: actorId, fieldPosition: actorCoord, ...buildLineupEventDetails() });
        } else {
            recordEvent(type, {
                playerId: actorId,
                fromPlayerId: actorId,
                ...buildLineupEventDetails(),
                timeElapsedMs,
                fieldPosition: actorCoord,
            });
        }

        setPendingFieldCoord(null);

        if (gameState.advancedTracking) {
             setDiscHolderId(null);
             setPrevHolderId(null);
             setPossessionStartTime(0);
        } else {
            setSelectedPlayer(null);
        }
    };

    const toggleActiveSub = (playerId: string) => {
        setActiveLineup(prev => {
            if (prev.includes(playerId)) {
                if (selectedPlayer === playerId) setSelectedPlayer(null);
                if (discHolderId === playerId) setDiscHolderId(null);
                return prev.filter(id => id !== playerId);
            }
            if (prev.length < lineupSize) return [...prev, playerId];
            return prev;
        });
    };

    const [gameTarget, setGameTarget] = useState<number>(15);
    const [firstPossession, setFirstPossession] = useState<'US' | 'THEM'>('US');
    const [gameFormat, setGameFormat] = useState<'7v7' | '5v5' | 'custom'>('7v7');
    const [softCapMinutes, setSoftCapMinutes] = useState('75');
    const [hardCapMinutes, setHardCapMinutes] = useState('90');
    const [timeoutDurationSec, setTimeoutDurationSec] = useState('70');
    const [clockNow, setClockNow] = useState(Date.now());
    const [showHeaderClock, setShowHeaderClock] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [showLineupEditor, setShowLineupEditor] = useState(false);
    const [showStreamEditor, setShowStreamEditor] = useState(false);
    const lineupSize = (gameState.isGameActive ? gameState.gameFormat : gameFormat) === '5v5' ? 5 : 7;

    useEffect(() => {
        if (!gameState.isGameActive) return;
        const timer = setInterval(() => setClockNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [gameState.isGameActive]);

    useEffect(() => {
        setLineup1((prev) => prev.slice(0, lineupSize));
        setLineup2((prev) => prev.slice(0, lineupSize));
    }, [lineupSize]);

    useEffect(() => {
        if (!gameState.isGameActive) setShowHeaderClock(false);
    }, [gameState.isGameActive]);

    useEffect(() => {
        if (!isDualObserverPortal || !gameState.isGameActive) return;
        
        // Auto-populate Team 1
        setLineup1((prev) => {
            if (prev.length > 0) return prev;
            const tid = gameState.team1Id;
            const liveVals = dualTeam1?.players ? Object.values(dualTeam1.players) : [];
            const snapVals = Object.values(gameState.neutralObserverRosters?.[tid] || {});
            const pool = liveVals.length > 0 ? liveVals : snapVals;
            return pool.slice(0, lineupSize).map((p) => p.id).filter(Boolean);
        });

        // Auto-populate Team 2
        setLineup2((prev) => {
            if (prev.length > 0) return prev;
            const tid = gameState.team2Id;
            if (!tid) return prev;
            const liveVals = dualTeam2?.players ? Object.values(dualTeam2.players) : [];
            const snapVals = Object.values(gameState.neutralObserverRosters?.[tid] || {});
            const pool = liveVals.length > 0 ? liveVals : snapVals;
            return pool.slice(0, lineupSize).map((p) => p.id).filter(Boolean);
        });
    }, [isDualObserverPortal, gameState.isGameActive, gameState.team1Id, gameState.team2Id, dualTeam1, dualTeam2, gameState.neutralObserverRosters, lineupSize]);

    useEffect(() => {
        if (!teamId || isDualObserverPortal) return;
        const unsubscribe = TeamService.subscribeToTeam(teamId, (t) => {
            setOurTeam(t);
            if (t?.players) {
                setActiveLineup(prev => {
                    if (prev.length > 0) return prev;
                    return Object.keys(t.players!).slice(0, lineupSize);
                });
            }
        });
        return unsubscribe;
    }, [teamId, isDualObserverPortal, lineupSize]);

    useEffect(() => {
        if (!isDualObserverPortal || !gameState.team1Id || !gameState.team2Id) return;
        const unsub1 = TeamService.subscribeToTeam(gameState.team1Id, setDualTeam1);
        const unsub2 = TeamService.subscribeToTeam(gameState.team2Id, setDualTeam2);
        return () => {
            unsub1();
            unsub2();
        };
    }, [isDualObserverPortal, gameState.team1Id, gameState.team2Id]);

    useEffect(() => {
        if (isDualObserverPortal) return;
        if (!ourTeam?.id) return;

        let cancelled = false;
        setIsPrepIntelLoading(true);

        GameService.getPastGamesForTeam(ourTeam.id)
            .then((games) => {
                if (!cancelled) setPrepGames(games);
            })
            .catch(() => {
                if (!cancelled) setPrepGames([]);
            })
            .finally(() => {
                if (!cancelled) setIsPrepIntelLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [ourTeam?.id, isDualObserverPortal]);

    const executeStartGame = async () => {
        if (!ourTeam) return;
        const currentUser = auth.currentUser;
        if (!currentUser) {
            Alert.alert("Error", "You must be logged in to start a game.");
            return;
        }

        setIsLoading(true);
        try {
            let oppTeamId = GUEST_TEAM_ID;
            let opponentDisplayName = '';
            let resolvedOpponentTeam: Team | null = null;

            if (selectedOpponentTeam) {
                oppTeamId = selectedOpponentTeam.id;
                opponentDisplayName = selectedOpponentTeam.name;
                resolvedOpponentTeam = selectedOpponentTeam;
                setOpponentTeam(selectedOpponentTeam);
            } else if (opponentName.trim()) {
                opponentDisplayName = opponentName.trim();
                setOpponentTeam(null);
            } else if (opponentAccessCode.trim()) {
                const foundTeam = await TeamService.lookupTeamByAccessCode(opponentAccessCode.trim().toUpperCase());
                if (!foundTeam) {
                    Alert.alert("Error", "Invalid Opponent Access Code.");
                    setIsLoading(false);
                    return;
                }
                oppTeamId = foundTeam.id || GUEST_TEAM_ID;
                opponentDisplayName = foundTeam.name;
                resolvedOpponentTeam = foundTeam;
                setOpponentTeam(foundTeam);
            } else {
                Alert.alert("Error", "Please select or enter an opponent.");
                setIsLoading(false);
                return;
            }

            if (observerModeSetup && (!resolvedOpponentTeam || !isRealTeamId(oppTeamId))) {
                Alert.alert(
                    "Registered opponent required",
                    "Observer mode records both rosters, so choose a registered opponent from search or enter their access code."
                );
                setIsLoading(false);
                return;
            }

            const initialPossessionId = firstPossession === 'US' ? ourTeam.id : oppTeamId;

            await startGame(
                ourTeam.id,
                oppTeamId,
                opponentDisplayName,
                gameLocationSetup.trim(),
                gameTarget,
                initialPossessionId,
                advancedTrackingSetup, sotgEnabledSetup, streamUrlSetup, fieldMapSetup,
                currentUser.uid,
                tournamentId && tournamentMatchId ? {
                    tournamentId,
                    matchId: tournamentMatchId,
                    participantId: tournamentParticipantId,
                    slot: tournamentSlot === 'A' || tournamentSlot === 'B' ? tournamentSlot : undefined,
                } : undefined,
                activeLineup.slice(0, lineupSize),
                {
                    gameFormat,
                    softCapMinutes: softCapMinutes ? Number(softCapMinutes) : undefined,
                    hardCapMinutes: hardCapMinutes ? Number(hardCapMinutes) : undefined,
                    timeoutDurationSec: timeoutDurationSec ? Number(timeoutDurationSec) : 70,
                },
                {
                    recordingMode: observerModeSetup ? 'observer' : 'team',
                    opponentRosterSnapshot: observerModeSetup ? buildRosterSnapshot(resolvedOpponentTeam?.players) : undefined,
                }
            );

            if (resolvedScheduledGameId) {
                await TeamService.removeScheduledGame(ourTeam.id, resolvedScheduledGameId, currentUser.uid);
            }

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to start game.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleStartGame = async () => {
        if (!ourTeam) return;
        const currentUser = auth.currentUser;
        if (!currentUser) {
            Alert.alert("Error", "You must be logged in to start a game.");
            return;
        }

        const isDemoUni =
            !isDualObserverPortal &&
            demoPackProfile.pack &&
            typeof teamId === 'string' &&
            teamId === demoPackProfile.coachId;

        if (isDemoUni) {
            const key = `realultimate.demoRecorderStartTips.v1.${currentUser.uid}`;
            const seen = await AsyncStorage.getItem(key);
            if (!seen) {
                setShowDemoRecorderStartModal(true);
                return;
            }
        }

        await executeStartGame();
    };

    const continueDemoRecorderAfterTips = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        await AsyncStorage.setItem(`realultimate.demoRecorderStartTips.v1.${currentUser.uid}`, '1');
        setShowDemoRecorderStartModal(false);
        await executeStartGame();
    };

    const dismissDemoRecorderTips = () => {
        setShowDemoRecorderStartModal(false);
    };

    const resetDemoRecorderTips = async () => {
        if (!currentUserId) return;
        await AsyncStorage.removeItem(`realultimate.demoRecorderStartTips.v1.${currentUserId}`);
        Alert.alert('Recording tips', 'Tips will show again the next time you tap Commence Match.');
    };

    const confirmEndGame = () => {
        const isGameFinished = gameState.score1 >= gameState.gameTarget || gameState.score2 >= gameState.gameTarget;

        if (!isGameFinished) {
            setEndGameConfirmCopy({
                title: 'End Match Early?',
                message: 'Neither team has reached the target score. Are you sure you want to finalize this match?',
            });
        } else {
            setEndGameConfirmCopy({
                title: 'End Match',
                message: 'Finalize and view match report?',
            });
        }

        setShowEndGameConfirm(true);
    };

    const proceedWithEndGame = () => {
        setShowEndGameConfirm(false);

        if (gameState.sotgEnabled) {
            setShowSotgModal(true);
            return;
        }

        endGame(gameState.gameId).then(() =>
            router.replace({ pathname: '/game/history/[gameId]', params: { gameId: gameState.gameId, newGame: 'true' } })
        );
    };

    const submitSotgAndEnd = async () => {
        setIsLoading(true);
        await endGame(gameState.gameId, sotgForm);
        setShowSotgModal(false);
        router.replace({ pathname: '/game/history/[gameId]', params: { gameId: gameState.gameId, newGame: 'true' } });
    };

    const handleHandoff = async () => {
        if (handoffPinInput === gameState.recorderPin) {
            await handOffRecording(currentUserId || '');
            setShowHandoffModal(false);
            setHandoffPinInput('');
            Alert.alert("Success", "You are now the active recorder!");
        } else {
            Alert.alert("Invalid PIN", "The PIN you entered does not match.");
        }
    };

    const createDelegateSession = async (scope: ObserverRecordingScope) => {
        if (!ourTeam || !currentUserId) {
            Alert.alert('Team required', 'Only a team coach/manager can delegate recording.');
            return;
        }
        try {
            setIsCreatingDelegateSession(true);
            setDelegateScope(scope);
            const session = await ObserverSessionService.createSession(gameState, ourTeam, currentUserId, scope);
            setDelegatePin(session.pin);
        } catch (error: any) {
            Alert.alert('Could not delegate', error?.message || 'Try again once the game is active.');
        } finally {
            setIsCreatingDelegateSession(false);
        }
    };

    const handleOverrideRecording = async () => {
        if (!currentUserId) return;
        try {
            await overrideRecordingControl(currentUserId);
            Alert.alert('Recording control restored', 'Observer write access was revoked for this game.');
        } catch {
            Alert.alert('Could not override', 'Check your connection and try again.');
        }
    };

    const handleSaveInGameStream = async () => {
        if (!gameState.isGameActive) return;
        try {
            setIsSavingLiveStream(true);
            await updateStreamUrl(inGameStreamUrl);
            Alert.alert('Saved', inGameStreamUrl.trim() ? 'Livestream link updated.' : 'Livestream link removed.');
        } catch {
            Alert.alert('Error', 'Could not update livestream link.');
        } finally {
            setIsSavingLiveStream(false);
        }
    };

    const dualBannerTeam1Name = dualTeam1?.name || 'Team';
    const dualBannerTeam2Name = dualTeam2?.name || gameState.team2Name || 'Team';

    if (isDualObserverPortal) {
        if (!resolvedDualGameId) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 }}>
                        Missing game identifier. Start again from Teams → Neutral scorer.
                    </Text>
                </View>
            );
        }
        if (!gameState.gameId) {
            return (
                <View style={styles.centerContainer}>
                    <Text style={{ color: colors.text }}>Loading recorder…</Text>
                </View>
            );
        }
    } else if (!ourTeam) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ color: colors.text }}>Loading...</Text>
            </View>
        );
    }

    const isGameOver = gameState.score1 >= gameState.gameTarget || gameState.score2 >= gameState.gameTarget;
    const isLocked = isGameOver || gameState.isHalftime || isCoachViewLockedByObserver;
    const hasCurrentActor = !!(gameState.advancedTracking && offensivePerspective
        ? (discHolderId || selectedOurPlayerId)
        : (selectedOurPlayerId || discHolderId));
    const hasOpponentActor = !isObserverModeActive || !!selectedOpponentPlayerId;
    const canLogOurDefense = !!selectedOurPlayerId;
    const actionLockedByPendingPass = !!pendingPassTargetId;
    const preGameIntel = !gameState.isGameActive && ourTeam ? buildLineAssistIntel(ourTeam, prepGames, lineupSize) : null;
    const isDemoUniversityRecorder =
        !isDualObserverPortal &&
        demoPackProfile.pack &&
        typeof teamId === 'string' &&
        teamId === demoPackProfile.coachId;
    const elapsedGameSec = gameState.gameStartTimestamp ? Math.max(0, Math.floor((clockNow - gameState.gameStartTimestamp) / 1000)) : 0;
    const timeoutRemainingSec = gameState.activeTimeoutStartedAt
        ? Math.max(0, (gameState.timeoutDurationSec || 70) - Math.floor((clockNow - gameState.activeTimeoutStartedAt) / 1000))
        : 0;
    const capStatus = gameState.hardCapMinutes && elapsedGameSec >= gameState.hardCapMinutes * 60
        ? 'Hard cap reached'
        : gameState.softCapMinutes && elapsedGameSec >= gameState.softCapMinutes * 60
            ? 'Soft cap active'
            : `${gameState.gameFormat || '7v7'} match clock`;

    const team1Possesses = isDualObserverPortal
        ? gameState.possession === gameState.team1Id
        : gameState.possession === ourTeam?.id;
    const discOwnerName = (() => {
        const n1 = isDualObserverPortal ? dualBannerTeam1Name : (ourTeam?.name || 'Us');
        const n2 = isDualObserverPortal ? dualBannerTeam2Name : (opponentTeam?.name || gameState.team2Name || opponentName || 'Them');
        return (team1Possesses ? n1 : n2).trim() || 'Team';
    })();
    const timeoutCfgSec = Math.max(1, gameState.timeoutDurationSec || 70);
    const HEADER_CLOCK_SCROLL_Y = 160;
    const discBorderColor = isDualObserverPortal
        ? team1Possesses
            ? colors.primary
            : colors.textSecondary
        : team1Possesses
          ? colors.primary
          : colors.error;
    const discBgColor = isDualObserverPortal
        ? team1Possesses
            ? colors.primaryLight
            : colors.surfaceSecondary
        : team1Possesses
          ? colors.primaryLight
          : colors.errorBg;
    const discIconColor = discBorderColor;

    return (
        <SceneShell>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    {gameState.isGameActive && showHeaderClock ? (
                        <>
                            <Text style={styles.headerStickyClock}>{formatClock(elapsedGameSec)}</Text>
                            <Text style={styles.headerStickyClockMeta} numberOfLines={1}>
                                {capStatus}
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.topAppBarTitle} numberOfLines={1}>
                            {gameState.isGameActive
                                ? (isDualObserverPortal
                                    ? `${dualBannerTeam1Name} vs ${dualBannerTeam2Name}`
                                    : `vs ${opponentTeam ? opponentTeam.name : (gameState.team2Name || opponentName || 'Opponent')}`)
                                : (isDualObserverPortal ? 'Neutral recorder' : 'Game Setup')}
                        </Text>
                    )}
                </View>
                {gameState.isGameActive ? (
                    <TouchableOpacity style={styles.handoffBtn} onPress={() => setShowDelegateModal(true)}>
                        <Ionicons name="radio-outline" size={20} color={colors.primary} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            {/* Multi-Recorder Warning Banner */}
            {showMultiRecorderWarning && (
                <View style={styles.warningBanner}>
                    <Ionicons name="warning" size={20} color="#92400E" />
                    <Text style={styles.warningText}>
                        {isCoachViewLockedByObserver ? 'Observer is currently recording. Your screen is view-only until you override.' : 'Another person is actively recording this game. Avoid duplicating events.'}
                    </Text>
                    {isCoachViewLockedByObserver && ourTeam && currentUserId && (
                        <TouchableOpacity style={styles.overrideControlBtn} onPress={handleOverrideRecording} activeOpacity={0.85}>
                            <Text style={styles.overrideControlText}>Override</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}

            {!showHalftimeTimer && (halftimeTimerState.isRunning || halftimeTimerState.isEnded) && (
                <TouchableOpacity
                    style={[styles.minimizedHalftimeTimer, halftimeTimerState.isEnded && { borderColor: colors.live }]}
                    onPress={() => setShowHalftimeTimer(true)}
                    activeOpacity={0.82}
                >
                    <Ionicons
                        name={halftimeTimerState.isEnded ? 'notifications' : 'hourglass-outline'}
                        size={16}
                        color={halftimeTimerState.isEnded ? colors.live : colors.primary}
                    />
                    <View style={{ marginLeft: 8 }}>
                        <Text style={styles.minimizedHalftimeLabel}>{halftimeTimerState.isEnded ? 'HALFTIME OVER' : 'HALFTIME'}</Text>
                        <Text style={[styles.minimizedHalftimeTime, halftimeTimerState.isEnded && { color: colors.live }]}>
                            {halftimeTimerState.display}
                        </Text>
                    </View>
                </TouchableOpacity>
            )}

            <ScrollView
                style={styles.mainContent}
                contentContainerStyle={{ paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(e) => {
                    if (!gameState.isGameActive) return;
                    const y = e.nativeEvent.contentOffset.y;
                    setShowHeaderClock(y > HEADER_CLOCK_SCROLL_Y);
                }}
            >
                
                {!gameState.isGameActive ? (
                    <View style={styles.setupCard}>
                        <View style={styles.setupHeaderBox}>
                            <Ionicons name="cog" size={28} color={colors.primary} />
                            <Text style={styles.setupTitle}>Match Setup</Text>
                        </View>

                        {!!resolvedScheduledGameId && (
                            <View style={styles.scheduledPrefillBanner}>
                                <Ionicons name="calendar" size={18} color={colors.primary} />
                                <Text style={styles.scheduledPrefillText}>Starting from scheduled game details.</Text>
                            </View>
                        )}

                        {isDemoUniversityRecorder && (
                            <View style={styles.demoRecorderBanner}>
                                <Ionicons name="school-outline" size={18} color={colors.primary} />
                                <Text style={styles.demoRecorderBannerText}>
                                    Demo: you are recording for your sample coached team ({ourTeam?.name || 'University of Iowa'}). Opponent defaults to{' '}
                                    <Text style={{ fontWeight: '800' }}>Iowa State</Text> — the team you follow in this showcase — so the flow matches a real
                                    matchup. Change opponent anytime below.
                                </Text>
                            </View>
                        )}

                        {isDemoUniversityRecorder && (
                            <View style={styles.demoGuideCard}>
                                <TouchableOpacity
                                    style={styles.demoGuideHeader}
                                    onPress={() => setDemoSetupGuideExpanded((v) => !v)}
                                    activeOpacity={0.75}
                                >
                                    <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                                    <Text style={styles.demoGuideTitle}>What these setup options mean</Text>
                                    <Ionicons
                                        name={demoSetupGuideExpanded ? 'chevron-up' : 'chevron-down'}
                                        size={18}
                                        color={colors.textSecondary}
                                        style={{ marginLeft: 'auto' }}
                                    />
                                </TouchableOpacity>
                                {demoSetupGuideExpanded && (
                                    <View style={styles.demoGuideBody}>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Opponent search / code / guest name</Text> — Link a registered team for full
                                            rosters and history, or type a guest name for a quick scrimmage.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Location & stream</Text> — Optional context on the game record and for fans.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Game limit (13/15)</Text> — Target score to win the game.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Starting pull (US / THEM)</Text> — Who receives the disc first (pull goes to the
                                            other side).
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Format & timers</Text> — Roster size (7v7 vs 5v5), soft/hard cap minutes, and
                                            how long each timeout lasts.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Starting lineup</Text> — Who is on for point 1; you can change between points.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Line recommendation assistant</Text> — Suggestions from your recent tracked
                                            games (not required to start).
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Advanced tracking</Text> — Passes, possession time, and richer stats for your
                                            team.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Observer mode</Text> — One device tracks both teams; needs a registered
                                            opponent.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Field map</Text> — Tap-field positions on throws and key events.
                                        </Text>
                                        <Text style={styles.demoGuideBullet}>
                                            • <Text style={styles.demoGuideEm}>Spirit score</Text> — WFDF-style ratings after the game when you finish.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <Text style={styles.inputLabel}>SEARCH REGISTERED OPPONENT</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Search team list"
                            placeholderTextColor={colors.textSecondary}
                            value={opponentSearch}
                            onChangeText={(value) => {
                                setOpponentSearch(value);
                                if (!value.trim()) {
                                    setSelectedOpponentTeamId(null);
                                }
                            }}
                        />

                        {selectedOpponentTeam && (
                            <View style={styles.selectedOpponentChip}>
                                <Text style={styles.selectedOpponentText}>{selectedOpponentTeam.name}</Text>
                                <TouchableOpacity onPress={() => setSelectedOpponentTeamId(null)}>
                                    <Ionicons name="close-circle" size={18} color={colors.primary} />
                                </TouchableOpacity>
                            </View>
                        )}

                        {!selectedOpponentTeam && filteredOpponentTeams.map((team) => (
                            <TouchableOpacity
                                key={team.id}
                                style={styles.opponentResultRow}
                                activeOpacity={0.75}
                                onPress={() => {
                                    setSelectedOpponentTeamId(team.id);
                                    setOpponentName(team.name);
                                    setOpponentAccessCode('');
                                    setOpponentSearch(team.name);
                                }}
                            >
                                <Text style={styles.opponentResultText}>{team.name}</Text>
                                <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        ))}

                        {!selectedOpponentTeam && hasOpponentSearchQuery && filteredOpponentTeams.length === 0 && (
                            <View style={styles.opponentEmptyRow}>
                                <Text style={styles.opponentEmptyText}>No teams matched this search yet.</Text>
                            </View>
                        )}

                        <Text style={styles.dividerText}>or use code / manual name</Text>
                        <Text style={styles.inputLabel}>OPPONENT ACCESS CODE</Text>
                        <TextInput
                            style={[styles.input, { textTransform: 'uppercase', textAlign: 'center', letterSpacing: 4, fontSize: 20 }]}
                            placeholder="XXXXXX"
                            placeholderTextColor={colors.textSecondary}
                            maxLength={6}
                            value={opponentAccessCode}
                            onChangeText={(value) => {
                                setOpponentAccessCode(value);
                                if (value.trim()) {
                                    setSelectedOpponentTeamId(null);
                                }
                            }}
                            autoCapitalize="characters"
                        />
                        <Text style={styles.inputLabel}>GUEST TEAM NAME</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Rival University"
                            placeholderTextColor={colors.textSecondary}
                            value={opponentName}
                            onChangeText={(value) => {
                                setOpponentName(value);
                                if (!selectedOpponentTeam || value !== selectedOpponentTeam.name) {
                                    setSelectedOpponentTeamId(null);
                                }
                            }}
                        />

                        <Text style={styles.inputLabel}>GAME LOCATION (OPTIONAL)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Main Turf Field"
                            placeholderTextColor={colors.textSecondary}
                            value={gameLocationSetup}
                            onChangeText={setGameLocationSetup}
                        />
                        <View style={styles.setupDivider} />
                        
                        <Text style={styles.inputLabel}>LIVESTREAM URL (OPTIONAL)</Text>
                        <TextInput style={styles.input} placeholder="e.g. YouTube or Twitch Link" placeholderTextColor={colors.textSecondary} value={streamUrlSetup} onChangeText={setStreamUrlSetup} autoCapitalize="none" keyboardType="url" />
                        <View style={styles.setupDivider} />
                        
                        <View style={styles.settingsRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.inputLabel}>GAME LIMIT</Text>
                                <View style={styles.toggleGroup}>
                                    <TouchableOpacity style={[styles.toggleBtn, gameTarget === 13 && styles.toggleBtnActive]} onPress={() => setGameTarget(13)} activeOpacity={0.8}><Text style={[styles.toggleBtnText, gameTarget === 13 && styles.toggleBtnTextActive]}>13</Text></TouchableOpacity>
                                    <TouchableOpacity style={[styles.toggleBtn, gameTarget === 15 && styles.toggleBtnActive]} onPress={() => setGameTarget(15)} activeOpacity={0.8}><Text style={[styles.toggleBtnText, gameTarget === 15 && styles.toggleBtnTextActive]}>15</Text></TouchableOpacity>
                                </View>
                            </View>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={styles.inputLabel}>STARTING PULL</Text>
                                <View style={styles.toggleGroup}>
                                    <TouchableOpacity style={[styles.toggleBtn, firstPossession === 'US' && styles.toggleBtnActive]} onPress={() => setFirstPossession('US')} activeOpacity={0.8}><Text style={[styles.toggleBtnText, firstPossession === 'US' && styles.toggleBtnTextActive]}>US</Text></TouchableOpacity>
                                    <TouchableOpacity style={[styles.toggleBtn, firstPossession === 'THEM' && styles.toggleBtnActive]} onPress={() => setFirstPossession('THEM')} activeOpacity={0.8}><Text style={[styles.toggleBtnText, firstPossession === 'THEM' && styles.toggleBtnTextActive]}>THEM</Text></TouchableOpacity>
                                </View>
                            </View>
                        </View>

                        <View style={styles.setupDivider} />

                        <Text style={styles.inputLabel}>FORMAT & TIMERS</Text>
                        <View style={[styles.toggleGroup, { marginBottom: 12 }]}>
                            {(['7v7', '5v5', 'custom'] as const).map((format) => (
                                <TouchableOpacity key={format} style={[styles.toggleBtn, gameFormat === format && styles.toggleBtnActive]} onPress={() => setGameFormat(format)} activeOpacity={0.8}>
                                    <Text style={[styles.toggleBtnText, gameFormat === format && styles.toggleBtnTextActive]}>{format.toUpperCase()}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.timerSetupGrid}>
                            <View style={styles.timerSetupField}>
                                <Text style={styles.timerSetupLabel}>Soft cap</Text>
                                <TextInput style={styles.timerSetupInput} value={softCapMinutes} onChangeText={setSoftCapMinutes} keyboardType="numeric" placeholder="75" placeholderTextColor={colors.textSecondary} />
                            </View>
                            <View style={styles.timerSetupField}>
                                <Text style={styles.timerSetupLabel}>Hard cap</Text>
                                <TextInput style={styles.timerSetupInput} value={hardCapMinutes} onChangeText={setHardCapMinutes} keyboardType="numeric" placeholder="90" placeholderTextColor={colors.textSecondary} />
                            </View>
                            <View style={styles.timerSetupField}>
                                <Text style={styles.timerSetupLabel}>Timeout (sec)</Text>
                                <TextInput style={styles.timerSetupInput} value={timeoutDurationSec} onChangeText={setTimeoutDurationSec} keyboardType="numeric" placeholder="70" placeholderTextColor={colors.textSecondary} />
                            </View>
                        </View>
                        <Text style={[styles.dividerText, { textAlign: 'left', marginTop: 6, marginBottom: 0 }]}>
                            In-game timeout length:{' '}
                            <Text style={{ fontWeight: '800', color: colors.text }}>
                                {formatClock(Math.max(1, parseInt(timeoutDurationSec, 10) || 70))}
                            </Text>
                            {' '}(default 70 = 1:10). Edit seconds above.
                        </Text>

                        <View style={styles.setupDivider} />

                        <View style={styles.linePresetCard}>
                            <View style={styles.linePresetHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.inputLabel, { marginBottom: 2 }]}>STARTING LINEUP</Text>
                                    <Text style={[styles.dividerText, { textAlign: 'left', marginTop: 0 }]}>
                                        {rosterPlayers.length <= lineupSize
                                            ? `With ${lineupSize} or fewer players, everyone can stay flex and you can adjust on the field.`
                                            : `Load O-line or D-line tags, then tap players below to choose your ${lineupSize}.`}
                                    </Text>
                                </View>
                                <Text style={styles.linePresetCount}>{activeLineup.length}/{lineupSize}</Text>
                            </View>
                            {rosterPlayers.length > lineupSize && (
                                <View style={styles.linePresetActions}>
                                    <TouchableOpacity style={styles.linePresetBtn} onPress={() => loadTaggedLineup('O')} activeOpacity={0.8}>
                                        <Ionicons name="arrow-up-circle-outline" size={15} color={colors.primary} />
                                        <Text style={styles.linePresetText}>Load O-Line</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.linePresetBtn} onPress={() => loadTaggedLineup('D')} activeOpacity={0.8}>
                                        <Ionicons name="shield-checkmark-outline" size={15} color={colors.error} />
                                        <Text style={styles.linePresetText}>Load D-Line</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={styles.linePresetPlayers}>
                                {rosterPlayers
                                    .filter((player) => activeLineup.includes(player.id))
                                    .slice(0, lineupSize)
                                    .map((player) => (
                                        <TouchableOpacity key={`setup-line-${player.id}`} style={styles.linePresetPlayerPill} onPress={() => toggleActiveSub(player.id)} activeOpacity={0.8}>
                                            <Text style={styles.linePresetPlayerText}>{player.name.split(' ')[0]}</Text>
                                        </TouchableOpacity>
                                    ))}
                            </View>
                            <View style={styles.setupLineupPicker}>
                                {rosterPlayers.map((player) => {
                                    const isInLine = activeLineup.includes(player.id);
                                    return (
                                        <TouchableOpacity
                                            key={`setup-pick-${player.id}`}
                                            style={[
                                                styles.setupLineupChip,
                                                isInLine && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                                            ]}
                                            onPress={() => toggleActiveSub(player.id)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={[styles.setupLineupChipText, isInLine && { color: colors.primary }]}>
                                                {isInLine ? 'ON ' : '+ '}{player.name.split(' ')[0]}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        <View style={styles.setupDivider} />

                        <View style={styles.coachIntelCard}>
                            <View style={styles.coachIntelHeader}>
                                <Ionicons name="sparkles" size={18} color={colors.primary} />
                                <Text style={styles.coachIntelTitle}>Line Recommendation Assistant</Text>
                                <TouchableOpacity onPress={() => setShowLineIntelHelp(true)} activeOpacity={0.7} style={{ marginRight: 6 }}>
                                    <Ionicons name="help-circle-outline" size={16} color={colors.textSecondary} />
                                </TouchableOpacity>
                                <Text style={styles.coachIntelConfidence}>
                                    {isPrepIntelLoading ? '...' : `${preGameIntel?.confidence ?? 20}%`}
                                </Text>
                            </View>

                            {isPrepIntelLoading ? (
                                <Text style={styles.coachIntelSubtext}>Building pre-game intelligence from recent matches...</Text>
                            ) : preGameIntel ? (
                                <>
                                    <Text style={styles.coachIntelSubtext}>Suggested O-line: {preGameIntel.offense.join(', ') || 'Not enough data yet'}</Text>
                                    <Text style={styles.coachIntelSubtext}>Suggested D-line: {preGameIntel.defense.join(', ') || 'Not enough data yet'}</Text>
                                    {preGameIntel.corePair && (
                                        <Text style={styles.coachIntelSubtext}>Core connection: {preGameIntel.corePair}</Text>
                                    )}
                                    {preGameIntel.riskPair && (
                                        <Text style={[styles.coachIntelSubtext, { color: colors.error }]}>Risk connection to monitor: {preGameIntel.riskPair}</Text>
                                    )}
                                    {preGameIntel.notes.map((note, idx) => (
                                        <Text key={`${note}-${idx}`} style={styles.coachIntelBullet}>• {note}</Text>
                                    ))}
                                </>
                            ) : (
                                <Text style={styles.coachIntelSubtext}>Play a few tracked games to unlock lineup recommendations.</Text>
                            )}
                        </View>

                        {/* Feature Toggles */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <View style={{flex: 1, paddingRight: 16}}>
                                <Text style={[styles.inputLabel, {marginBottom: 2}]}>ADVANCED TRACKING</Text>
                                <Text style={[styles.dividerText, {textAlign: 'left', marginTop: 0}]}>Track passes, time-of-possession, and automatic assists.</Text>
                            </View>
                            <Switch value={advancedTrackingSetup} onValueChange={setAdvancedTrackingSetup} trackColor={{ false: colors.border, true: colors.primary }} />
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <View style={{flex: 1, paddingRight: 16}}>
                                <Text style={[styles.inputLabel, {marginBottom: 2}]}>OBSERVER MODE</Text>
                                <Text style={[styles.dividerText, {textAlign: 'left', marginTop: 0}]}>Record both teams players from one device. Requires a registered opponent.</Text>
                            </View>
                            <Switch value={observerModeSetup} onValueChange={setObserverModeSetup} trackColor={{ false: colors.border, true: colors.warning }} />
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <View style={{flex: 1, paddingRight: 16}}>
                                <Text style={[styles.inputLabel, {marginBottom: 2}]}>FIELD MAP (PREMIUM)</Text>
                                <Text style={[styles.dividerText, {textAlign: 'left', marginTop: 0}]}>Record play positions on a visual field. Best for bench trackers.</Text>
                            </View>
                            <Switch value={fieldMapSetup} onValueChange={setFieldMapSetup} trackColor={{ false: colors.border, true: '#7E22CE' }} />
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <View style={{flex: 1, paddingRight: 16}}>
                                <Text style={[styles.inputLabel, {marginBottom: 2}]}>SPIRIT SCORE (0-4 WFDF)</Text>
                                <Text style={[styles.dividerText, {textAlign: 'left', marginTop: 0}]}>Evaluate opponent spirit at match conclusion.</Text>
                            </View>
                            <Switch value={sotgEnabledSetup} onValueChange={setSotgEnabledSetup} trackColor={{ false: colors.border, true: colors.success }} />
                        </View>

                        {isDemoUniversityRecorder && (
                            <TouchableOpacity onPress={resetDemoRecorderTips} activeOpacity={0.7} style={{ marginBottom: 12, alignSelf: 'center' }}>
                                <Text style={{ ...getTypography(colors).bodySmall, color: colors.primary, fontWeight: '700' }}>
                                    Show recording tips again next time
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.startMatchBtn} onPress={handleStartGame} disabled={isLoading} activeOpacity={0.8}><Text style={styles.startMatchBtnText}>{isLoading ? 'Starting...' : 'Commence Match'}</Text></TouchableOpacity>
                    </View>
                ) : (
                    <View style={{ flex: 1 }}>
                        <View style={styles.scoreboard}>
                            <View
                                style={[
                                    styles.scoreBox,
                                    team1Possesses
                                        ? (isDualObserverPortal ? styles.scoreBoxPossessionNeutral : styles.scoreBoxPossessionOur)
                                        : styles.scoreBoxPossessionDim,
                                ]}
                            >
                                <Text style={styles.scoreLabel}>{(isDualObserverPortal ? dualBannerTeam1Name : (ourTeam?.name || 'US')).toUpperCase()}</Text>
                                <View style={styles.scoreNumberContainer}>
                                    {goalSide === 'US' && (
                                        <Animated.View style={[styles.fireworks, { opacity: goalAnim, transform: [{ scale: goalAnim }] }]}>
                                            <Ionicons name="sparkles" size={100} color={colors.success} />
                                        </Animated.View>
                                    )}
                                    <Text style={styles.scoreNumber}>{gameState.score1}</Text>
                                </View>
                            </View>

                            <View style={styles.scoreboardDiscColumn}>
                                <View
                                    style={[
                                        styles.discPill,
                                        {
                                            borderColor: discBorderColor,
                                            backgroundColor: discBgColor,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="radio-button-on"
                                        size={22}
                                        color={discIconColor}
                                    />
                                </View>
                                <Text style={styles.discPillCaption} numberOfLines={4}>
                                    {discOwnerName}
                                    {'\n'}Disc
                                </Text>
                            </View>

                            <View
                                style={[
                                    styles.scoreBox,
                                    !team1Possesses
                                        ? (isDualObserverPortal ? styles.scoreBoxPossessionNeutral : styles.scoreBoxPossessionOpp)
                                        : styles.scoreBoxPossessionDim,
                                ]}
                            >
                                <Text style={styles.scoreLabel}>{(isDualObserverPortal ? dualBannerTeam2Name : (opponentTeam?.name || gameState.team2Name || opponentName || 'OPPONENT')).toUpperCase()}</Text>
                                <View style={styles.scoreNumberContainer}>
                                    {goalSide === 'THEM' && (
                                        <Animated.View style={[styles.fireworks, { opacity: goalAnim, transform: [{ scale: goalAnim }] }]}>
                                            <Ionicons name="sparkles" size={100} color={colors.error} />
                                        </Animated.View>
                                    )}
                                    <Text style={styles.scoreNumber}>{gameState.score2}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.clockCard}>
                            <View style={styles.clockFace}>
                                <Text style={styles.clockTime}>{formatClock(elapsedGameSec)}</Text>
                                <Text style={styles.clockLabel}>{capStatus}</Text>
                            </View>
                            <View style={styles.clockMeta}>
                                <Text style={styles.clockMetaText}>Soft {gameState.softCapMinutes || '--'}m</Text>
                                <Text style={styles.clockMetaText}>Hard {gameState.hardCapMinutes || '--'}m</Text>
                                <Text style={[styles.clockMetaText, gameState.activeTimeoutStartedAt ? { color: colors.warning } : null]}>
                                    {gameState.activeTimeoutStartedAt ? `Timeout ${formatClock(timeoutRemainingSec)}` : `Timeout len ${formatClock(timeoutCfgSec)}`}
                                </Text>
                            </View>
                        </View>

                        {!!gameState.gameLocation && (
                            <View style={styles.locationPill}>
                                <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
                                <Text style={styles.locationPillText}>{gameState.gameLocation}</Text>
                            </View>
                        )}

                        {/* ACTIVE LINEUP GRID */}
                        <View style={styles.lineupSection}>
                            {(isDualObserverPortal || isObserverModeActive) && (
                                <View style={styles.observerToggle}>
                                    <TouchableOpacity
                                        style={[styles.observerToggleBtn, observerRosterView === 'ours' && styles.observerToggleBtnActive]}
                                        onPress={() => setObserverRosterView('ours')}
                                    >
                                        <Text style={[styles.observerToggleText, observerRosterView === 'ours' && styles.observerToggleTextActive]}>
                                            {isDualObserverPortal ? dualBannerTeam1Name : (ourTeam?.name || 'Us')}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.observerToggleBtn, observerRosterView === 'opponent' && styles.observerToggleBtnActive]}
                                        onPress={() => setObserverRosterView('opponent')}
                                    >
                                        <Text style={[styles.observerToggleText, observerRosterView === 'opponent' && styles.observerToggleTextActive]}>
                                            {isDualObserverPortal ? dualBannerTeam2Name : (opponentTeam?.name || gameState.team2Name || 'Opponent')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <View style={styles.activeLineHeader}>
                                <Text style={styles.sectionTitle}>
                                    {observerRosterView === 'opponent' && (isObserverModeActive || isDualObserverPortal)
                                        ? 'OPPONENT ROSTER'
                                        : `ACTIVE LINEUP (${activeLineup.length}/${lineupSize})`}
                                </Text>
                                <Text style={styles.activeLineBadge}>
                                    {observerRosterView === 'opponent' && (isObserverModeActive || isDualObserverPortal) ? 'Observer' : `P${gameState.currentPointNumber || 1} • ${activeLineType}-LINE`}
                                </Text>
                            </View>

                            {observerRosterView === 'opponent' && (isObserverModeActive || isDualObserverPortal) ? (
                                <>
                                    <View style={styles.playerGrid}>
                                        {opponentRosterPlayers.slice(0, 14).map((player) => {
                                            const isSelected = selectedPlayer === player.id;
                                            return (
                                                <TouchableOpacity
                                                    key={`observer-${player.id}`}
                                                    style={[
                                                        styles.playerButton,
                                                        styles.observerPlayerButton,
                                                        isSelected && styles.playerButtonSelected,
                                                    ]}
                                                    onPress={() => setSelectedPlayer(player.id)}
                                                    activeOpacity={0.5}
                                                >
                                                    <Text style={[
                                                        styles.playerButtonText,
                                                        isSelected && styles.playerButtonTextSelected,
                                                    ]} numberOfLines={1}>
                                                        {player.name.split(' ')[0]}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </>
                            ) : (
                                <>
                                    {rosterPlayers.length > lineupSize && (
                                        <View style={styles.linePresetActions}>
                                            <TouchableOpacity style={styles.linePresetBtn} onPress={() => loadTaggedLineup('O')} activeOpacity={0.8}>
                                                <Text style={styles.linePresetText}>O Preset</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.linePresetBtn} onPress={() => loadTaggedLineup('D')} activeOpacity={0.8}>
                                                <Text style={styles.linePresetText}>D Preset</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.linePresetBtn} onPress={() => setShowLineupEditor((prev) => !prev)} activeOpacity={0.8}>
                                                <Text style={styles.linePresetText}>{showLineupEditor ? 'Hide Edit' : 'Edit Line'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {showLineupEditor && rosterPlayers.length > lineupSize ? (
                                        <Text style={styles.lineupEditHint}>
                                            Long-press an active player to bench them, or tap someone on the bench to bring them on.
                                        </Text>
                                    ) : null}
                                    <View style={styles.lineupStatusRow}>
                                        {gameState.advancedTracking && offensivePerspective && !isLocked ? (
                                            !discHolderId ? (
                                                <Text numberOfLines={1} style={[styles.sectionSubtitle, { color: colors.primary, fontWeight: '700' }]}>● Select the player who picked up the disc.</Text>
                                            ) : (
                                                <Text
                                                    numberOfLines={1}
                                                    style={[styles.sectionSubtitle, { color: pendingPassTargetId && gameState.fieldMapEnabled ? colors.warning : colors.success, fontWeight: '700' }]}
                                                >
                                                    ● Tracking Time. Select their target to log a Pass{pendingPassTargetId && gameState.fieldMapEnabled ? ` • Target selected: tap ${(rosterPlayers.find((p) => p.id === pendingPassTargetId)?.name || '').split(' ')[0] || 'receiver'} on map.` : '.'}
                                                </Text>
                                            )
                                        ) : (
                                            <Text numberOfLines={1} style={styles.sectionSubtitle}>Tap to select player. Long press to substitute.</Text>
                                        )}
                                    </View>

                                    <View style={styles.playerGrid}>
                                        {rosterPlayers.filter((p) => activeLineup.includes(p.id)).slice(0, lineupSize).map((p) => {
                                                const isSelected = selectedPlayer === p.id;
                                                return (
                                                    <TouchableOpacity
                                                        key={p.id}
                                                    style={[
                                                        styles.playerButton,
                                                        isSelected && styles.playerButtonSelected,
                                                        (gameState.advancedTracking && offensivePerspective && isSelected) && styles.playerButtonHoldingDisc
                                                        ]}
                                                        onPress={() => handlePlayerPress(p.id)}
                                                        onLongPress={() => toggleActiveSub(p.id)}
                                                        activeOpacity={0.5}
                                                    >
                                                        {gameState.advancedTracking && offensivePerspective && isSelected && (
                                                            <Ionicons name="radio-button-on" size={12} color={colors.primary} style={{position: 'absolute', top: 4, right: 6}} />
                                                        )}
                                                        <Text style={[
                                                            styles.playerButtonText,
                                                            isSelected && styles.playerButtonTextSelected,
                                                        ]} numberOfLines={1}>
                                                            {p.name.split(' ')[0]}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        {activeLineup.length < lineupSize && (
                                            <View style={[styles.playerButton, styles.playerButtonEmpty]}>
                                                <Text style={styles.playerButtonEmptyText}>Slot Open</Text>
                                            </View>
                                        )}
                                    </View>

                                    {(showLineupEditor || activeLineup.length < lineupSize) && (
                                        <>
                                            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>BENCH</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subGrid} contentContainerStyle={{ paddingBottom: 5, paddingRight: 20 }}>
                                                {rosterPlayers
                                                    .filter((p) => !activeLineup.includes(p.id))
                                                    .map((p) => (
                                                        <TouchableOpacity
                                                            key={`sub-${p.id}`}
                                                            style={styles.subButton}
                                                            onPress={() => toggleActiveSub(p.id)}
                                                            activeOpacity={0.6}
                                                        >
                                                            <Text style={styles.subButtonText}>+ {p.name.split(' ')[0]}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                            </ScrollView>
                                        </>
                                    )}
                                </>
                            )}
                        </View>

                        {/* INLINE FIELD MAP (if enabled) */}
                        {gameState.fieldMapEnabled && (() => {
                            // Field-flip storage contract:
                            //   `gameState.fieldDisplayFlipped` is display-only.
                            //   Storage stays canonical ("team1 attacks toward y=100"),
                            //   so history/replay can render every event without a per-event flag.
                            //   The recorder applies a 180° rotate on tap-in (display -> canonical)
                            //   and tap-out (canonical -> display, for `coord` on the map).
                            const flipped = !!gameState.fieldDisplayFlipped;
                            const toCanonical = (c: FieldCoordinate) => flipped ? flipFieldCoord(c) : c;
                            const toDisplay = (c: FieldCoordinate | null) => (c && flipped ? flipFieldCoord(c) : c);
                            const leftEndzoneName = isDualObserverPortal ? dualBannerTeam2Name : (opponentTeam?.name || gameState.team2Name || opponentName || 'Opponent');
                            const rightEndzoneName = isDualObserverPortal ? dualBannerTeam1Name : (ourTeam?.name || 'Us');
                            const handleSwapEnds = async () => {
                                const next = !flipped;
                                if (gameState.gameId) {
                                    try { await GameService.setFieldDisplayFlipped(gameState.gameId, next); } catch { /* ignore */ }
                                }
                            };
                            return (
                                <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 6 }}>
                                        <Text style={{ ...getTypography(colors).caption, color: colors.textSecondary, fontSize: 10, fontWeight: '600' }}>
                                            {flipped ? 'Flipped' : 'Default'}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={handleSwapEnds}
                                            activeOpacity={0.75}
                                            accessibilityRole="button"
                                            accessibilityLabel="Swap field ends"
                                            style={{
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                paddingHorizontal: 6,
                                                paddingVertical: 4,
                                                borderRadius: Layout.radiusSm,
                                                borderWidth: 1,
                                                borderColor: colors.primary,
                                                backgroundColor: colors.primaryLight,
                                            }}
                                        >
                                            <Ionicons name="swap-horizontal" size={12} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <FieldMap
                                        coord={toDisplay(pendingFieldCoord)}
                                        onLocationSelect={(rawCoord) => {
                                            if (rawCoord.x < 0 || rawCoord.y < 0) {
                                                setPendingFieldCoord(null);
                                                return;
                                            }
                                            const canonical = toCanonical(rawCoord);
                                            if (pendingPassTargetId && gameState.advancedTracking && offensivePerspective) {
                                                completeTrackedPass(pendingPassTargetId, normalizeCoord(canonical));
                                            } else {
                                                const normalized = normalizeCoord(canonical);
                                                setPendingFieldCoord(canonical);

                                                if (gameState.advancedTracking && offensivePerspective) {
                                                    const activeHolderId = discHolderId || selectedPlayer;
                                                    if (activeHolderId) {
                                                        rememberPlayerCoord(activeHolderId, normalized);
                                                    }
                                                }
                                            }
                                        }}
                                        colors={colors}
                                        ourTeamName={flipped ? leftEndzoneName : rightEndzoneName}
                                        oppTeamName={flipped ? rightEndzoneName : leftEndzoneName}
                                    />
                                </View>
                            );
                        })()}

                        {/* ACTIONS */}
                        <View style={styles.actionPanel}>
                            <Text style={styles.sectionTitle}>TACTICAL ACTIONS</Text>
                            {isLocked ? (
                                <View style={styles.lockedContainer}>
                                    <Ionicons name="lock-closed" size={24} color={colors.textSecondary} />
                                    <Text style={styles.lockedText}>
                                        {isGameOver ? `Game Over. Target score reached.` : 'Halftime System Paused'}
                                    </Text>
                                </View>
                            ) : (
                                offensivePerspective ? (
                                    <View style={styles.actionBoard}>
                                        <View style={styles.actionBoardRow}>
                                            <TactileButton title="Goal" icon="aperture" color={colors.primary} disabled={!hasCurrentActor || actionLockedByPendingPass} onPress={() => {
                                                // If we are in dual observer mode looking at the opponent, a "Goal" logged by them is actually an "Opponent Score" relative to the game canonical storage
                                                const resolvedType = (isDualObserverPortal && observerRosterView === 'opponent') ? 'Opponent Score' : 'G';
                                                handleAction(resolvedType);
                                            }} />
                                            <TactileButton title="Throwaway" icon="close-circle" color={colors.error} disabled={!hasCurrentActor || actionLockedByPendingPass} onPress={() => handleAction('T')} />
                                        </View>
                                        <View style={styles.actionBoardRow}>
                                            <TactileButton title="Drop" icon="arrow-down-circle" color={colors.warning} disabled={!hasCurrentActor || actionLockedByPendingPass} onPress={() => handleAction('Drop')} />
                                            <TactileButton title="Opp. Callahan" icon="flash" color="#b45309" disabled={!hasCurrentActor || actionLockedByPendingPass} onPress={() => handleAction('Callahan_THEM')} />
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.actionBoard}>
                                        {observerRosterView === 'opponent' && (isObserverModeActive || isDualObserverPortal) ? (
                                            <View style={styles.actionBoardRow}>
                                                <TactileButton title="Opp. Turnover" icon="sync" color={colors.success} disabled={!hasOpponentActor} onPress={() => handleAction('Opponent Turnover')} />
                                                <TactileButton title="Opp. Score" icon="flag" color={colors.error} disabled={!hasOpponentActor} onPress={() => handleAction('Opponent Score')} />
                                            </View>
                                        ) : (
                                            <>
                                                <View style={styles.actionBoardRow}>
                                                    <TactileButton title="D-Block" icon="hand-left" color={colors.primary} disabled={!canLogOurDefense || actionLockedByPendingPass} onPress={() => handleAction('D')} />
                                                    <TactileButton title="Opp. Turnover" icon="sync" color={colors.success} onPress={() => handleAction('Opponent Turnover')} />
                                                </View>
                                                <View style={styles.actionBoardRow}>
                                                    <TactileButton title="Opp. Score" icon="flag" color={colors.error} onPress={() => handleAction('Opponent Score')} />
                                                    <TactileButton title="US Callahan!" icon="flash" color={colors.success} disabled={!canLogOurDefense || actionLockedByPendingPass} onPress={() => handleAction('Callahan_US')} />
                                                </View>
                                            </>
                                        )}
                                    </View>
                                )
                            )}
                            
                            <View style={[styles.controlRow, styles.primaryControlRow]}>
                                {!isGameOver && (
                                    !gameState.isHalftime ? (
                                        <TouchableOpacity style={styles.controlBtn} onPress={() => setShowHalftimeTimer(true)} activeOpacity={0.6}>
                                            <Text style={styles.controlBtnText}>HALFTIME</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.primary }]} onPress={() => recordEvent('End Halftime')} activeOpacity={0.6}>
                                            <Text style={[styles.controlBtnText, { color: colors.onPrimary }]}>RESUME</Text>
                                        </TouchableOpacity>
                                    )
                                )}
                                <TouchableOpacity style={[styles.controlBtn, { opacity: canUndo ? 1 : 0.5 }]} onPress={undo} disabled={!canUndo} activeOpacity={0.6}>
                                    <Text style={[styles.controlBtnText, { color: colors.error }]}>UNDO</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.controlBtn} onPress={() => recordEvent('Timeout', { timeoutDurationSec: gameState.timeoutDurationSec || 70 })} activeOpacity={0.6}>
                                    <Text style={[styles.controlBtnText, { color: gameState.activeTimeoutStartedAt ? colors.warning : colors.textSecondary }]}>
                                        {gameState.activeTimeoutStartedAt ? 'END TIMEOUT' : 'TIMEOUT'}
                                    </Text>
                                    <Text style={[styles.controlBtnTimer, { color: gameState.activeTimeoutStartedAt ? colors.warning : colors.textSecondary }]}>
                                        {gameState.activeTimeoutStartedAt ? formatClock(timeoutRemainingSec) : formatClock(timeoutCfgSec)}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={[styles.controlRow, styles.cardControlRow]}>
                                <TouchableOpacity
                                    style={styles.controlBtn}
                                    onPress={() => {
                                        if (!selectedPlayer) {
                                            Alert.alert('Select Player', 'Select the player receiving the technical card first.');
                                            return;
                                        }
                                        recordEvent('Blue Card', { playerId: selectedPlayer, cardColor: 'blue', infractionReason: 'Technical infraction' });
                                    }}
                                    activeOpacity={0.6}
                                >
                                    <Text style={[styles.controlBtnText, { color: colors.primary }]}>BLUE CARD</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.controlBtn}
                                    onPress={() => {
                                        if (!selectedPlayer) {
                                            Alert.alert('Select Player', 'Select the player receiving the misconduct warning first.');
                                            return;
                                        }
                                        recordEvent('Yellow Card', { playerId: selectedPlayer, cardColor: 'yellow', infractionReason: 'Misconduct warning' });
                                    }}
                                    activeOpacity={0.6}
                                >
                                    <Text style={[styles.controlBtnText, { color: colors.warning }]}>YELLOW</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.controlBtn}
                                    onPress={() => {
                                        if (!selectedPlayer) {
                                            Alert.alert('Select Player', 'Select the player receiving the ejection first.');
                                            return;
                                        }
                                        recordEvent('Red Card', { playerId: selectedPlayer, cardColor: 'red', infractionReason: 'Ejection' });
                                    }}
                                    activeOpacity={0.6}
                                >
                                    <Text style={[styles.controlBtnText, { color: colors.error }]}>RED</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* EVENT LOG */}
                        <View style={styles.logCard}>
                            <Text style={styles.sectionTitle}>EVENT LOG</Text>
                            {(gameState.history || []).slice(-4).reverse().map((e, index) => (
                                <View key={index} style={styles.logRow}>
                                    <Text style={styles.logText}>
                                        {e.type.includes('Halftime') ? (
                                            <Text style={{ fontWeight: '600', color: colors.text }}>{e.type.toUpperCase()}</Text>
                                        ) : e.type === 'Pass' ? (
                                            <Text>
                                                <Text style={{ fontWeight: '600', color: colors.text }}>PASS </Text>
                                                {ourTeam?.players?.[e.fromPlayerId || e.assistPlayerId || '']?.name?.split(' ')?.[0] || 'Unknown'} to {ourTeam?.players?.[e.toPlayerId || e.playerId || '']?.name?.split(' ')?.[0] || 'Unknown'}
                                            </Text>
                                        ) : (
                                            <Text>
                                                <Text style={{ fontWeight: '600', color: colors.text }}>{e.type.replace('_', ' ').toUpperCase()}</Text>
                                                {e.playerId ? ` by ${ourTeam?.players?.[e.playerId]?.name?.split(' ')?.[0] || 'System'}` : ''}
                                            </Text>
                                        )}
                                    </Text>
                                    <Text style={styles.logTime}>{new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                                </View>
                            ))}
                        </View>

                        <View style={styles.streamEditorCard}>
                            <TouchableOpacity
                                style={styles.streamEditorHeader}
                                onPress={() => setShowStreamEditor((prev) => !prev)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.streamEditorTitleRow}>
                                    <Ionicons name="logo-youtube" size={18} color={colors.error} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sectionTitle, { marginBottom: 1 }]}>LIVESTREAM LINK</Text>
                                        <Text numberOfLines={1} style={styles.streamEditorSummary}>
                                            {gameState.streamUrl ? gameState.streamUrl : 'Tap to add a YouTube or Twitch URL'}
                                        </Text>
                                    </View>
                                </View>
                                <Ionicons name={showStreamEditor ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                            {showStreamEditor && (
                                <View style={styles.streamEditorBody}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Paste YouTube livestream URL"
                                        placeholderTextColor={colors.textSecondary}
                                        value={inGameStreamUrl}
                                        onChangeText={setInGameStreamUrl}
                                        autoCapitalize="none"
                                        keyboardType="url"
                                    />
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.controlBtn, { flex: 1, backgroundColor: colors.primary, borderColor: colors.primary }]}
                                            onPress={handleSaveInGameStream}
                                            disabled={isSavingLiveStream}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={[styles.controlBtnText, { color: colors.onPrimary }]}>
                                                {isSavingLiveStream ? 'Saving...' : 'Save Link'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.controlBtn, { flex: 1 }]}
                                            onPress={() => setInGameStreamUrl('')}
                                            activeOpacity={0.75}
                                        >
                                            <Text style={styles.controlBtnText}>Clear</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>

                        <TouchableOpacity style={styles.endMatchBtn} onPress={confirmEndGame} activeOpacity={0.6}>
                            <Text style={styles.endMatchBtnText}>End Game & View Match Report</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            <Modal visible={showMapGuideModal} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={[styles.sotgCard, { maxWidth: 460 }]}> 
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                            <Ionicons name="map-outline" size={24} color={colors.primary} />
                            <Text style={[styles.sotgTitle, { marginBottom: 0, marginLeft: 10, textAlign: 'left', flex: 1 }]}>Field Map Quick Guide</Text>
                        </View>
                        <Text style={styles.coachIntelSubtext}>1. Tap a player who has the disc.</Text>
                        <Text style={styles.coachIntelSubtext}>2. Tap that player location on the field map.</Text>
                        <Text style={styles.coachIntelSubtext}>3. For passes: tap receiver, then tap receiver location on the map.</Text>
                        <Text style={styles.coachIntelSubtext}>4. Tap event buttons like Goal, Throwaway, Drop, or D-Block.</Text>
                        <Text style={[styles.coachIntelSubtext, { marginBottom: 18 }]}>Tip: The yellow marker shows the next event location that will be logged.</Text>

                        <TouchableOpacity
                            style={[styles.startMatchBtn, { marginTop: 6 }]}
                            onPress={() => setShowMapGuideModal(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.startMatchBtnText}>Got It</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* SOTG MODAL */}
            <Modal visible={showSotgModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.sotgCard}>
                        <Text style={styles.sotgTitle}>SPIRIT OF THE GAME</Text>
                        <Text style={styles.sotgSubtitle}>WFDF Official 0-4 Rubric</Text>
                        
                        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                            {[
                                { k: 'rules', l: 'Rules Knowledge' },
                                { k: 'fouls', l: 'Fouls & Body Contact' },
                                { k: 'fairness', l: 'Fair-Mindedness' },
                                { k: 'attitude', l: 'Positive Attitude' },
                                { k: 'communication', l: 'Communication' }
                            ].map(cat => (
                                <View key={cat.k} style={styles.sotgRow}>
                                    <Text style={styles.sotgLabel}>{cat.l}</Text>
                                    <View style={styles.sotgControl}>
                                        {[0,1,2,3,4].map(num => (
                                            <TouchableOpacity 
                                                key={num} 
                                                style={[styles.sotgBtn, sotgForm[cat.k as keyof typeof sotgForm] === num && styles.sotgBtnActive]} 
                                                onPress={() => setSotgForm(prev => ({...prev, [cat.k]: num}))}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[styles.sotgBtnText, sotgForm[cat.k as keyof typeof sotgForm] === num && styles.sotgBtnTextActive]}>{num}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                        
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                            <TouchableOpacity style={[styles.controlBtn, { flex: 1 }]} onPress={() => setShowSotgModal(false)}>
                                <Text style={styles.controlBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.controlBtn, { flex: 2, backgroundColor: colors.success, borderColor: colors.success }]} onPress={submitSotgAndEnd} disabled={isLoading}>
                                <Text style={[styles.controlBtnText, { color: '#fff' }]}>{isLoading ? 'Saving...' : 'Submit & End'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* OBSERVER DELEGATION MODAL */}
            <Modal visible={showDelegateModal} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.sotgCard, { alignItems: 'center' }]}>
                        <Ionicons name="radio-outline" size={44} color={colors.primary} style={{ marginBottom: 14 }} />
                        <Text style={[styles.sotgTitle, { marginBottom: 4 }]}>Delegate Recording</Text>
                        <Text style={[styles.sotgSubtitle, { marginBottom: 18, textAlign: 'center' }]}>
                            Create a 4-hour observer session. The observer joins from the home screen with the PIN and can record without coach access.
                        </Text>

                        {!delegatePin ? (
                            <View style={{ width: '100%', gap: 10 }}>
                                <TouchableOpacity
                                    style={[styles.delegateChoiceBtn, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                                    onPress={() => createDelegateSession('team')}
                                    disabled={isCreatingDelegateSession}
                                    activeOpacity={0.86}
                                >
                                    <Ionicons name="people-outline" size={18} color={colors.primary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.delegateChoiceTitle, { color: colors.primary }]}>Record for My Team</Text>
                                        <Text style={styles.delegateChoiceSub}>Simple sideline handoff for your roster only.</Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.delegateChoiceBtn, { borderColor: colors.primary, backgroundColor: colors.surfaceSecondary }]}
                                    onPress={() => createDelegateSession('both')}
                                    disabled={isCreatingDelegateSession}
                                    activeOpacity={0.86}
                                >
                                    <Ionicons name="git-compare-outline" size={18} color={colors.primary} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.delegateChoiceTitle, { color: colors.primary }]}>Record for Both Teams</Text>
                                        <Text style={styles.delegateChoiceSub}>Observer mode for both rosters when available.</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={{ alignItems: 'center', width: '100%' }}>
                                <Text style={{ ...getTypography(colors).label, marginBottom: 8 }}>OBSERVER PIN</Text>
                                <Text style={{ ...getTypography(colors).title, fontSize: 42, letterSpacing: 10, color: colors.primary }}>{delegatePin}</Text>
                                <Text style={[styles.sotgSubtitle, { textAlign: 'center', marginTop: 8 }]}>
                                    Scope: {delegateScope === 'both' ? 'Both teams' : 'My team'} · expires in 4 hours.
                                </Text>
                                {gameState.recorderPin && (
                                    <View style={styles.legacyHandoffBox}>
                                        <Text style={styles.legacyHandoffLabel}>Legacy handoff PIN</Text>
                                        <Text style={styles.legacyHandoffCode}>{gameState.recorderPin}</Text>
                                        <Text style={styles.delegateChoiceSub}>Use observer PIN for new handoffs. This older 4-digit PIN is kept for existing flows.</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <TouchableOpacity
                            style={styles.delegateCloseBtn}
                            onPress={() => {
                                setShowDelegateModal(false);
                                if (!delegatePin) setDelegateScope('team');
                            }}
                        >
                            <Text style={styles.delegateCloseText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* BENCH HAND-OFF MODAL */}
            <Modal visible={showHandoffModal} animationType="fade" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={[styles.sotgCard, { alignItems: 'center' }]}>
                        <Ionicons name="swap-horizontal-outline" size={48} color={colors.primary} style={{ marginBottom: 16 }} />
                        <Text style={[styles.sotgTitle, { marginBottom: 4 }]}>Bench Hand-off</Text>
                        <Text style={[styles.sotgSubtitle, { marginBottom: 24 }]}>
                            {isActiveRecorder 
                                ? `Share the PIN below with a bench player to hand off recording duties.`
                                : `Enter the PIN shown on the current recorder's screen to take over.`
                            }
                        </Text>

                        {isActiveRecorder && gameState.recorderPin ? (
                            <View style={{ alignItems: 'center', marginBottom: 24 }}>
                                <Text style={{ ...getTypography(colors).label, marginBottom: 8 }}>YOUR HANDOFF PIN</Text>
                                <Text style={{ ...getTypography(colors).title, fontSize: 40, letterSpacing: 12, color: colors.primary }}>{gameState.recorderPin}</Text>
                            </View>
                        ) : (
                            <View style={{ width: '100%', marginBottom: 24 }}>
                                <Text style={[styles.inputLabel, { textAlign: 'center' }]}>ENTER HANDOFF PIN</Text>
                                <TextInput 
                                    style={[styles.input, { textAlign: 'center', letterSpacing: 12, fontSize: 28, fontWeight: '700' }]} 
                                    placeholder="0000" 
                                    placeholderTextColor={colors.textSecondary} 
                                    maxLength={4} 
                                    keyboardType="number-pad" 
                                    value={handoffPinInput} 
                                    onChangeText={setHandoffPinInput} 
                                />
                                <TouchableOpacity 
                                    style={[styles.startMatchBtn, { marginTop: 8 }]} 
                                    onPress={handleHandoff}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.startMatchBtnText}>Take Over Recording</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        
                        <TouchableOpacity style={styles.controlBtn} onPress={() => { setShowHandoffModal(false); setHandoffPinInput(''); }}>
                            <Text style={styles.controlBtnText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <BrandedDialog
                visible={showLineIntelHelp}
                title="Line Recommendation Assistant"
                message="Suggestions are built from recent tracked games using scoring impact, defensive plays, passing reliability, and repeat player-pair chemistry. Confidence increases with more tracked events."
                colors={colors}
                icon="sparkles-outline"
                onPrimary={() => setShowLineIntelHelp(false)}
            />

            <BrandedDialog
                visible={showEndGameConfirm}
                title={endGameConfirmCopy.title}
                message={endGameConfirmCopy.message}
                colors={colors}
                icon="flag-outline"
                accentColor={colors.error}
                primaryLabel="End Match"
                secondaryLabel="Cancel"
                dismissOnBackdrop={false}
                onPrimary={proceedWithEndGame}
                onSecondary={() => setShowEndGameConfirm(false)}
            />

            <DemoRecorderStartModal
                visible={showDemoRecorderStartModal}
                ourTeamName={ourTeam?.name || 'Your team'}
                opponentName={selectedOpponentTeam?.name || opponentName.trim() || 'Opponent'}
                onDismiss={dismissDemoRecorderTips}
                onContinue={continueDemoRecorderAfterTips}
            />

            <HalftimeTimerModal
                visible={showHalftimeTimer}
                gameId={gameState.gameId || gameSubscriptionKey || 'pending'}
                defaultMinutes={10}
                onClose={() => setShowHalftimeTimer(false)}
                onStartHalftime={() => {
                    if (!gameState.isHalftime) recordEvent('Halftime');
                }}
                onTimerStateChange={setHalftimeTimerState}
            />

        </KeyboardAvoidingView>
        </SceneShell>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    
    topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    topAppBarTitle: { ...getTypography(colors).title, fontSize: 16, color: colors.text, textAlign: 'center', fontWeight: '700' },
    headerStickyClock: { ...Typography.title, fontSize: 22, color: colors.text, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
    headerStickyClockMeta: { ...Typography.caption, color: colors.textSecondary, marginTop: 0, textAlign: 'center', maxWidth: 220 },
    handoffBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    delegateChoiceBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Layout.radiusMd, padding: 14 },
    delegateChoiceTitle: { ...getTypography(colors).body, fontWeight: '900' },
    delegateChoiceSub: { ...getTypography(colors).bodySmall, color: colors.textSecondary, marginTop: 2 },
    delegateCloseBtn: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 18, borderRadius: Layout.radiusMd, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignSelf: 'stretch', alignItems: 'center' },
    delegateCloseText: { ...getTypography(colors).button, color: colors.textSecondary },
    legacyHandoffBox: { width: '100%', marginTop: 18, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, padding: 12, alignItems: 'center' },
    legacyHandoffLabel: { ...getTypography(colors).label, marginBottom: 4 },
    legacyHandoffCode: { ...getTypography(colors).title, fontSize: 24, color: colors.primary, letterSpacing: 6 },

    // Warning banner
    warningBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: Layout.padding, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
    warningText: { ...getTypography(colors).bodySmall, color: '#92400E', flex: 1, fontWeight: '500' },
    overrideControlBtn: { backgroundColor: '#92400E', borderRadius: Layout.radiusSm, paddingHorizontal: 10, paddingVertical: 7 },
    overrideControlText: { ...getTypography(colors).label, color: '#fff', fontSize: 10 },
    minimizedHalftimeTimer: {
        position: 'absolute',
        top: 70,
        right: 14,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: Layout.radiusMd,
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...Layout.shadow,
    },
    minimizedHalftimeLabel: { ...getTypography(colors).label, fontSize: 9, marginBottom: 1 },
    minimizedHalftimeTime: { ...getTypography(colors).body, color: colors.primary, fontWeight: '900', fontVariant: ['tabular-nums'] },

    mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 24 },
    
    sectionTitle: { ...getTypography(colors).label, marginBottom: 8 },
    sectionSubtitle: { ...getTypography(colors).bodySmall, marginBottom: 16, marginTop: -4 },
    lineupStatusRow: { minHeight: 24, justifyContent: 'center' },
    
    // Setup View
    setupCard: { backgroundColor: colors.surface, padding: 24, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    setupHeaderBox: { alignItems: 'center', marginBottom: 24 },
    setupTitle: { ...getTypography(colors).title, fontSize: 20, marginTop: 8 },
    scheduledPrefillBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight,
        marginBottom: 12,
    },
    scheduledPrefillText: { ...getTypography(colors).bodySmall, color: colors.primary, fontWeight: '600' },
    demoRecorderBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        marginBottom: 14,
    },
    demoRecorderBannerText: { ...getTypography(colors).bodySmall, color: colors.text, flex: 1, lineHeight: 20 },
    demoGuideCard: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Layout.radiusMd,
        backgroundColor: colors.surfaceSecondary,
        marginBottom: 18,
        overflow: 'hidden',
    },
    demoGuideHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    demoGuideTitle: { ...getTypography(colors).body, fontWeight: '800', color: colors.text, flex: 1 },
    demoGuideBody: { paddingHorizontal: 12, paddingBottom: 12 },
    demoGuideBullet: { ...getTypography(colors).bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: 8 },
    demoGuideEm: { color: colors.text, fontWeight: '800' },
    coachIntelCard: {
        backgroundColor: colors.surfaceSecondary,
        padding: 14,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 22,
    },
    coachIntelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
    coachIntelTitle: { ...getTypography(colors).body, fontWeight: '700', flex: 1 },
    coachIntelConfidence: {
        ...getTypography(colors).label,
        color: colors.primary,
        backgroundColor: colors.primaryLight,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    coachIntelSubtext: { ...getTypography(colors).bodySmall, marginBottom: 6 },
    coachIntelBullet: { ...getTypography(colors).bodySmall, color: colors.text, marginBottom: 4 },
    linePresetCard: {
        backgroundColor: colors.surfaceSecondary,
        padding: 14,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.border,
    },
    linePresetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 },
    linePresetCount: { ...Typography.label, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    linePresetActions: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    linePresetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: Layout.radiusSm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    linePresetText: { ...Typography.bodySmall, fontWeight: '700', color: colors.text },
    linePresetPlayers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    linePresetPlayerPill: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    linePresetPlayerText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
    setupLineupPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    setupLineupChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, borderRadius: Layout.radiusSm },
    setupLineupChipText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    inputLabel: { ...getTypography(colors).label, marginBottom: 8 },
    input: { ...getTypography(colors).body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: Layout.radiusMd, color: colors.text, marginBottom: 16 },
    selectedOpponentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.primaryLight,
        borderWidth: 1,
        borderColor: colors.primary,
        borderRadius: Layout.radiusMd,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 10,
    },
    selectedOpponentText: { ...Typography.body, color: colors.primary, fontWeight: '600' },
    opponentResultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Layout.radiusSm,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
    },
    opponentResultText: { ...Typography.body, color: colors.text, fontSize: 14 },
    opponentEmptyRow: {
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Layout.radiusSm,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
    },
    opponentEmptyText: { ...Typography.bodySmall, color: colors.textSecondary },
    dividerText: { ...getTypography(colors).bodySmall, textAlign: 'center', marginVertical: 8 },
    setupDivider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
    settingsRow: { flexDirection: 'row', marginBottom: 24 },
    timerSetupGrid: { flexDirection: 'row', gap: 10 },
    timerSetupField: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, padding: 10 },
    timerSetupLabel: { ...Typography.label, color: colors.textSecondary, marginBottom: 6 },
    timerSetupInput: { ...Typography.title, fontSize: 18, color: colors.text, padding: 0 },
    toggleGroup: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, padding: 4, borderWidth: 1, borderColor: colors.border },
    toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Layout.radiusSm },
    toggleBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    toggleBtnText: { ...getTypography(colors).body, fontWeight: '600', color: colors.textSecondary },
    toggleBtnTextActive: { color: colors.text },
    startMatchBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: Layout.radiusMd, alignItems: 'center' },
    startMatchBtnText: { ...getTypography(colors).button, color: colors.onPrimary },

    // Scoreboard
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
    scoreBoxPossessionNeutral: {
        backgroundColor: colors.primaryLight,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    scoreBoxPossessionDim: { opacity: 0.7 },
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
        ...Typography.caption,
        color: colors.text,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 15,
        fontSize: 11,
        maxWidth: 118,
    },
    scoreLabel: { ...getTypography(colors).label, marginBottom: 4 },
    scoreNumberContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    scoreNumber: { ...getTypography(colors).title, fontSize: 56, lineHeight: 60 },
    fireworks: { position: 'absolute', zIndex: 10 },
    scoreDivider: { width: 1, height: 50, backgroundColor: colors.border, marginHorizontal: 16 },
    
    possessionIndicator: { paddingVertical: 12, borderRadius: Layout.radiusMd, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    possessionIndicatorText: { ...getTypography(colors).body, fontWeight: '700' },
    clockCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusLg, padding: 14, marginTop: 0, marginBottom: 16, ...Layout.shadow },
    clockFace: { alignItems: 'flex-start' },
    clockTime: { ...Typography.title, fontSize: 34, letterSpacing: -1 },
    clockLabel: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: -2 },
    clockMeta: { alignItems: 'flex-end', gap: 4 },
    clockMetaText: { ...Typography.label, color: colors.textSecondary },
    locationPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginTop: 0,
        marginBottom: 14,
        gap: 6,
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: Layout.radiusLg,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    locationPillText: { ...Typography.bodySmall, color: colors.textSecondary },
    streamEditorCard: {
        backgroundColor: colors.surface,
        padding: 14,
        borderRadius: Layout.radiusMd,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: colors.border,
        ...Layout.shadow,
    },
    streamEditorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    streamEditorTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
    streamEditorSummary: { ...Typography.bodySmall, color: colors.textSecondary, flexShrink: 1 },
    streamEditorBody: { marginTop: 12 },

    // Field Map Button
    fieldMapBtn: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'center', 
        backgroundColor: colors.surface, 
        paddingVertical: 14, 
        borderRadius: Layout.radiusMd, 
        marginBottom: 16, 
        borderWidth: 2, 
        borderColor: '#7E22CE', 
        borderStyle: 'dashed',
        gap: 8,
    },
    fieldMapBtnText: { ...getTypography(colors).body, fontWeight: '600', color: '#7E22CE', fontSize: 14 },

    // Lineup Grid
    lineupSection: { marginBottom: 10 },
    activeLineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 },
    activeLineBadge: { ...Typography.label, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    playerButton: { position: 'relative', backgroundColor: colors.surface, paddingVertical: 15, paddingHorizontal: 12, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, minWidth: '30%', flex: 1, alignItems: 'center', ...Layout.shadow },
    playerButtonSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary, borderWidth: 2 },
    playerButtonHoldingDisc: { shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: {width: 0, height: 0}, elevation: 8 },
    playerButtonEmpty: { backgroundColor: colors.surfaceSecondary, borderStyle: 'dashed' },
    playerButtonText: { ...getTypography(colors).body, fontWeight: '600', color: colors.text },
    playerButtonTextSelected: { color: colors.primary },
    playerButtonEmptyText: { ...getTypography(colors).bodySmall, textAlign: 'center' },
    observerRosterCard: { marginTop: 14, padding: 14, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.surfaceSecondary },
    observerPlayerButton: { borderColor: colors.warning },
    observerToggle: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, padding: 2, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    observerToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: Layout.radiusSm },
    observerToggleBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
    observerToggleText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    observerToggleTextActive: { color: colors.primary },
    lineupEditHint: {
        ...Typography.caption,
        color: colors.textSecondary,
        marginTop: 6,
        marginBottom: 4,
        paddingHorizontal: 4,
        lineHeight: 17,
        fontStyle: 'italic',
    },
    
    subGrid: { flexGrow: 0 },
    subButton: { backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Layout.radiusLg, marginRight: 8, borderWidth: 1, borderColor: colors.border },
    subButtonText: { ...getTypography(colors).body, fontSize: 14, fontWeight: '600', color: colors.textSecondary },

    // Action Board
    actionPanel: { backgroundColor: colors.surface, padding: 10, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, marginBottom: 10, ...Layout.shadow },
    actionBoard: { marginBottom: 4 },
    actionBoardRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    tacticalBtn: { minHeight: 94, paddingVertical: 16, paddingHorizontal: 8, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.24, shadowRadius: 5, elevation: 5 },
    tacticalBtnDisabled: { opacity: 0.4 },
    tacticalBtnText: { ...getTypography(colors).button, color: colors.onPrimary, fontSize: 16, letterSpacing: 0.35, textAlign: 'center' },
    
    controlRow: { flexDirection: 'row', gap: 6 },
    primaryControlRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 0 },
    cardControlRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 8 },
    controlBtn: {
        flex: 1,
        minHeight: 58,
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: Layout.radiusMd,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: colors.border,
    },
    controlBtnText: { ...getTypography(colors).button, color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
    controlBtnTimer: { ...Typography.mono, fontSize: 16, marginTop: 2, fontWeight: '800', fontVariant: ['tabular-nums'] },

    lockedContainer: { alignItems: 'center', padding: 24, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, marginBottom: 20 },
    lockedText: { ...getTypography(colors).bodySmall, marginTop: 12 },

    // Recorder PIN Card
    recorderPinCard: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        backgroundColor: colors.surface, 
        padding: 16, 
        borderRadius: Layout.radiusMd, 
        marginBottom: 16, 
        borderWidth: 1, 
        borderColor: colors.primary,
        borderStyle: 'dashed',
        ...Layout.shadow 
    },

    // Log
    logCard: { marginBottom: 16, backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    logRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    logText: { ...getTypography(colors).body, fontSize: 14, flex: 1 },
    logTime: { ...getTypography(colors).bodySmall, fontSize: 12 },

    endMatchBtn: { flexDirection: 'row', backgroundColor: colors.errorBg, borderWidth: 1, borderColor: colors.error, paddingVertical: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
    endMatchBtnText: { ...getTypography(colors).button, color: colors.error },

    // SOTG Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    sotgCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 24, width: '100%', maxWidth: 450, ...Layout.shadow },
    sotgTitle: { ...getTypography(colors).title, fontSize: 20, textAlign: 'center', color: colors.primary, marginBottom: 4 },
    sotgSubtitle: { ...getTypography(colors).bodySmall, textAlign: 'center', marginBottom: 24 },
    sotgRow: { marginBottom: 20 },
    sotgLabel: { ...getTypography(colors).body, fontWeight: '600', marginBottom: 8 },
    sotgControl: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, padding: 4 },
    sotgBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Layout.radiusSm },
    sotgBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    sotgBtnText: { ...getTypography(colors).body, fontWeight: '600', color: colors.textSecondary },
    sotgBtnTextActive: { color: colors.text }
});
}
