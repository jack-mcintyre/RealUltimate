import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, TouchableWithoutFeedback, Switch, Modal } from 'react-native';
import { useGame } from '../../hooks/useGame';
import { TeamService } from '../../services/TeamService';
import { Team, EventType } from '../../services/types';
import { auth } from '../../../firebaseConfig';
import { getTypography, Layout } from '../../theme/DesignSystem';
import { useTheme, ThemeColors } from '../../theme/ThemeContext';

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
        if (!disabled) Animated.spring(scaleAnim, { toValue: 0.92, useNativeDriver: true }).start();
    };

    const handlePressOut = () => {
        if (!disabled) Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
    };

    return (
        <TouchableWithoutFeedback 
            onPress={disabled ? undefined : onPress} 
            onPressIn={disabled ? undefined : handlePressIn} 
            onPressOut={disabled ? undefined : handlePressOut}
        >
            <Animated.View style={[
                styles.tacticalBtn, 
                { backgroundColor: color, flex, transform: [{ scale: scaleAnim }] },
                disabled && styles.tacticalBtnDisabled
            ]}>
                <Ionicons name={icon} size={24} color={colors.onPrimary} style={{ marginBottom: 4 }} />
                <Text style={styles.tacticalBtnText}>{title}</Text>
            </Animated.View>
        </TouchableWithoutFeedback>
    );
};

export default function RecorderScreen() {
    const { teamId } = useLocalSearchParams<{ teamId: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [ourTeam, setOurTeam] = useState<Team | null>(null);
    const [opponentAccessCode, setOpponentAccessCode] = useState('');
    const [opponentName, setOpponentName] = useState('');
    const [opponentTeam, setOpponentTeam] = useState<Team | null>(null);

    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const { gameState, recordEvent, undo, canUndo, startGame, endGame } = useGame(ourTeam?.activeGameId || undefined);

    const [activeLineup, setActiveLineup] = useState<string[]>([]);

    // --- Advanced Tracking State ---
    const [advancedTrackingSetup, setAdvancedTrackingSetup] = useState(false);
    const [sotgEnabledSetup, setSotgEnabledSetup] = useState(false);
    const [showSotgModal, setShowSotgModal] = useState(false);
    const [sotgForm, setSotgForm] = useState({ rules: 2, fouls: 2, fairness: 2, attitude: 2, communication: 2 });
    
    // In-Game Advanced Tracking
    const [discHolderId, setDiscHolderId] = useState<string | null>(null);
    const [prevHolderId, setPrevHolderId] = useState<string | null>(null);
    const [possessionStartTime, setPossessionStartTime] = useState<number | 0>(0);

    // Sync selected player visually with disc holder if tracking is on
    useEffect(() => {
        if (gameState.isGameActive && gameState.advancedTracking && gameState.possession === ourTeam?.id) {
            setSelectedPlayer(discHolderId);
        }
    }, [discHolderId, gameState.possession, gameState.advancedTracking, gameState.isGameActive]);

    const handlePlayerPress = (playerId: string) => {
        // Basic Mode or Not Active
        if (!gameState.isGameActive || !gameState.advancedTracking || gameState.possession !== ourTeam?.id) {
            setSelectedPlayer(playerId);
            return;
        }
        
        // Advanced Tracking Logic (Our Possession)
        if (!discHolderId) {
            setDiscHolderId(playerId);
            setPossessionStartTime(Date.now());
        } else if (discHolderId !== playerId) {
            // PASS! (From discHolder to playerId)
            const timeElapsedMs = possessionStartTime ? Date.now() - possessionStartTime : 0;
            recordEvent('Pass', { playerId: discHolderId, timeElapsedMs });
            
            setPrevHolderId(discHolderId);
            setDiscHolderId(playerId);
            setPossessionStartTime(Date.now());
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

    // Unified Action Handler for Tactile Board
    const handleAction = (type: EventType) => {
        const timeElapsedMs = possessionStartTime ? Date.now() - possessionStartTime : 0;

        if (type === 'G') {
            handleGoal('G', { 
                playerId: selectedPlayer, 
                assistPlayerId: gameState.advancedTracking ? prevHolderId : undefined,
                timeElapsedMs 
            });
        } else if (type === 'Callahan_US' || type === 'Callahan_THEM' || type === 'Opponent Score') {
            handleGoal(type, { playerId: selectedPlayer });
        } else {
            recordEvent(type, { playerId: selectedPlayer, timeElapsedMs });
        }

        // Reset advanced tracking
        if (gameState.advancedTracking) {
             setDiscHolderId(null);
             setPrevHolderId(null);
             setPossessionStartTime(0);
        } else {
            // Unconditionally deselect player in basic mode after any action to prevent ghost attribution on next point
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
            if (prev.length < 7) return [...prev, playerId];
            return prev;
        });
    };

    const [gameTarget, setGameTarget] = useState<number>(15);
    const [firstPossession, setFirstPossession] = useState<'US' | 'THEM'>('US');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!teamId) return;
        const unsubscribe = TeamService.subscribeToTeam(teamId, (t) => {
            setOurTeam(t);
            if (t?.players) {
                setActiveLineup(prev => {
                    if (prev.length > 0) return prev;
                    return Object.keys(t.players!).slice(0, 7);
                });
            }
        });
        return unsubscribe;
    }, [teamId]); 

    const handleStartGame = async () => {
        if (!ourTeam) return;
        const currentUser = auth.currentUser;
        if (!currentUser) {
            Alert.alert("Error", "You must be logged in to start a game.");
            return;
        }

        setIsLoading(true);
        try {
            let oppTeamId = '';
            
            if (opponentName.trim()) {
                oppTeamId = '';
            } else if (opponentAccessCode.trim()) {
                const result = await TeamService.joinTeamByCode(opponentAccessCode.trim().toUpperCase(), currentUser.uid, currentUser.email || 'Unknown');
                if (!result) {
                    Alert.alert("Error", "Invalid Opponent Access Code.");
                    setIsLoading(false);
                    return;
                }
                oppTeamId = result.teamId;
            } else {
                Alert.alert("Error", "Please enter either an Access Code or a Guest Team Name.");
                setIsLoading(false);
                return;
            }

            if (oppTeamId) {
                TeamService.subscribeToTeam(oppTeamId, (t) => setOpponentTeam(t));
            } else {
                setOpponentTeam(null);
            }

            const initialPossessionId = firstPossession === 'US' ? ourTeam.id : oppTeamId;
            const oppNameForGuest = opponentName.trim() ? opponentName.trim() : '';

            await startGame(ourTeam.id, oppTeamId, oppNameForGuest, gameTarget, initialPossessionId, advancedTrackingSetup, sotgEnabledSetup);

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to start game.");
        } finally {
            setIsLoading(false);
        }
    };

    const confirmEndGame = () => {
        const isGameFinished = gameState.score1 >= gameState.gameTarget || gameState.score2 >= gameState.gameTarget;

        if (!isGameFinished) {
            if (Platform.OS === 'web') {
                const confirmed = window.confirm("End Match Early? Neither team has reached the target score. Are you sure you want to finalize this match?");
                if (confirmed) proceedWithEndGame();
            } else {
                Alert.alert(
                    "End Match Early?",
                    "Neither team has reached the target score. Are you sure you want to finalize this match?",
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "End Match", style: "destructive", onPress: proceedWithEndGame }
                    ]
                );
            }
        } else {
            proceedWithEndGame();
        }
    };

    const proceedWithEndGame = () => {
        if (gameState.sotgEnabled) {
            setShowSotgModal(true);
            return;
        }

        if (Platform.OS === 'web') {
            const confirmed = window.confirm("Finalize and view match report?");
            if (confirmed) {
                endGame(gameState.gameId).then(() => router.replace({ pathname: '/game/history/[gameId]', params: { gameId: gameState.gameId, newGame: 'true' } }));
            }
        } else {
            Alert.alert(
                "End Game",
                "Finalize and view match report?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "End Game", style: "destructive", onPress: async () => {
                        await endGame(gameState.gameId);
                        router.replace({ pathname: '/game/history/[gameId]', params: { gameId: gameState.gameId, newGame: 'true' } });
                    }}
                ]
            );
        }
    };

    const submitSotgAndEnd = async () => {
        setIsLoading(true);
        await endGame(gameState.gameId, sotgForm);
        setShowSotgModal(false);
        router.replace({ pathname: '/game/history/[gameId]', params: { gameId: gameState.gameId, newGame: 'true' } });
    };

    if (!ourTeam) return <View style={styles.centerContainer}><Text style={{color: colors.text}}>Loading...</Text></View>;

    const isGameOver = gameState.score1 >= gameState.gameTarget || gameState.score2 >= gameState.gameTarget;
    const isLocked = isGameOver || gameState.isHalftime;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle} numberOfLines={1}>
                    {gameState.isGameActive ? `vs ${opponentTeam ? opponentTeam.name : (gameState.team2Name || opponentName || 'Opponent')}` : 'Game Setup'}
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.mainContent} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
                
                {!gameState.isGameActive ? (
                    <View style={styles.setupCard}>
                        <View style={styles.setupHeaderBox}>
                            <Ionicons name="cog" size={28} color={colors.primary} />
                            <Text style={styles.setupTitle}>Match Setup</Text>
                        </View>
                        <Text style={styles.inputLabel}>OPPONENT ACCESS CODE</Text>
                        <TextInput style={[styles.input, { textTransform: 'uppercase', textAlign: 'center', letterSpacing: 4, fontSize: 20 }]} placeholder="XXXXXX" placeholderTextColor={colors.textSecondary} maxLength={6} value={opponentAccessCode} onChangeText={setOpponentAccessCode} autoCapitalize="characters" />
                        <Text style={styles.dividerText}>or unregistered guest</Text>
                        <Text style={styles.inputLabel}>GUEST TEAM NAME</Text>
                        <TextInput style={styles.input} placeholder="e.g. Rival University" placeholderTextColor={colors.textSecondary} value={opponentName} onChangeText={setOpponentName} />
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <View style={{flex: 1, paddingRight: 16}}>
                                <Text style={[styles.inputLabel, {marginBottom: 2}]}>ADVANCED TRACKING</Text>
                                <Text style={[styles.dividerText, {textAlign: 'left', marginTop: 0}]}>Track passes, time-of-possession, and automatic assists by selecting disc holders.</Text>
                            </View>
                            <Switch value={advancedTrackingSetup} onValueChange={setAdvancedTrackingSetup} trackColor={{ false: colors.border, true: colors.primary }} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <View style={{flex: 1, paddingRight: 16}}>
                                <Text style={[styles.inputLabel, {marginBottom: 2}]}>SPIRIT SCORE (0-4 WFDF)</Text>
                                <Text style={[styles.dividerText, {textAlign: 'left', marginTop: 0}]}>Evaluate opponent spirit at match conclusion.</Text>
                            </View>
                            <Switch value={sotgEnabledSetup} onValueChange={setSotgEnabledSetup} trackColor={{ false: colors.border, true: colors.success }} />
                        </View>

                        <TouchableOpacity style={styles.startMatchBtn} onPress={handleStartGame} disabled={isLoading} activeOpacity={0.8}><Text style={styles.startMatchBtnText}>{isLoading ? 'Starting...' : 'Commence Match'}</Text></TouchableOpacity>
                    </View>
                ) : (
                    <View style={{ flex: 1 }}>
                        <View style={styles.scoreboard}>
                            <View style={styles.scoreBox}>
                                <Text style={styles.scoreLabel}>US</Text>
                                <View style={styles.scoreNumberContainer}>
                                    {goalSide === 'US' && (
                                        <Animated.View style={[styles.fireworks, { opacity: goalAnim, transform: [{ scale: goalAnim }] }]}>
                                            <Ionicons name="sparkles" size={100} color={colors.success} />
                                        </Animated.View>
                                    )}
                                    <Text style={styles.scoreNumber}>{gameState.score1}</Text>
                                </View>
                            </View>
                            <View style={styles.scoreDivider} />
                            <View style={styles.scoreBox}>
                                <Text style={styles.scoreLabel}>THEM</Text>
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

                        <View style={[styles.possessionIndicator, { backgroundColor: gameState.possession === ourTeam?.id ? colors.primaryLight : colors.errorBg }]}>
                            <Text style={[styles.possessionIndicatorText, { color: gameState.possession === ourTeam?.id ? colors.primary : colors.error }]}>
                                {gameState.possession === ourTeam?.id ? '▶ OUR POSSESSION' : '◀ OPPONENT POSSESSION'}
                            </Text>
                        </View>

                        {/* ACTIVE LINEUP GRID */}
                        <View style={styles.lineupSection}>
                            <Text style={styles.sectionTitle}>ACTIVE LINEUP (7)</Text>
                            
                            {gameState.advancedTracking && gameState.possession === ourTeam?.id && !discHolderId && !isLocked && (
                                <Text style={[styles.sectionSubtitle, { color: colors.primary, fontWeight: '700' }]}>● Select the player who picked up the disc.</Text>
                            )}
                            {gameState.advancedTracking && gameState.possession === ourTeam?.id && discHolderId && !isLocked && (
                                <Text style={[styles.sectionSubtitle, { color: colors.success, fontWeight: '700' }]}>● Tracking Time. Select their target to log a Pass.</Text>
                            )}
                            {(!gameState.advancedTracking || gameState.possession !== ourTeam?.id || isLocked) && (
                                <Text style={styles.sectionSubtitle}>Tap to select operator. Long press to substitute.</Text>
                            )}
                            
                            <View style={styles.playerGrid}>
                                {ourTeam?.players && Object.values(ourTeam.players)
                                    .filter(p => activeLineup.includes(p.id))
                                    .map(p => {
                                        const isSelected = selectedPlayer === p.id;
                                        return (
                                            <TouchableOpacity
                                                key={p.id}
                                                style={[
                                                    styles.playerButton, 
                                                    isSelected && styles.playerButtonSelected,
                                                    (gameState.advancedTracking && gameState.possession === ourTeam?.id && isSelected) && styles.playerButtonHoldingDisc
                                                ]}
                                                onPress={() => handlePlayerPress(p.id)}
                                                onLongPress={() => toggleActiveSub(p.id)}
                                                activeOpacity={0.5}
                                            >
                                                {gameState.advancedTracking && gameState.possession === ourTeam?.id && isSelected && (
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
                                {activeLineup.length < 7 && (
                                    <View style={[styles.playerButton, styles.playerButtonEmpty]}>
                                        <Text style={styles.playerButtonEmptyText}>Slot Open</Text>
                                    </View>
                                )}
                            </View>

                            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>BENCH</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subGrid} contentContainerStyle={{ paddingBottom: 5, paddingRight: 20 }}>
                                {ourTeam?.players && Object.values(ourTeam.players)
                                    .filter(p => !activeLineup.includes(p.id))
                                    .map(p => (
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
                        </View>

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
                                gameState.possession === ourTeam?.id ? (
                                    <View style={styles.actionBoard}>
                                        {/* OUR POSSESSION ACTION BOARD */}
                                        <View style={styles.actionBoardRow}>
                                            <TactileButton title="Goal" icon="aperture" color={colors.primary} disabled={!selectedPlayer} onPress={() => handleAction('G')} />
                                            <TactileButton title="Throwaway" icon="close-circle" color={colors.error} disabled={!selectedPlayer} onPress={() => handleAction('T')} />
                                        </View>
                                        <View style={styles.actionBoardRow}>
                                            <TactileButton title="Drop" icon="arrow-down-circle" color={colors.warning} disabled={!selectedPlayer} onPress={() => handleAction('Drop')} />
                                            <TactileButton title="Opp. Callahan" icon="flash" color="#b45309" disabled={!selectedPlayer} onPress={() => handleAction('Callahan_THEM')} />
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.actionBoard}>
                                        {/* OPPONENT POSSESSION ACTION BOARD */}
                                        <View style={styles.actionBoardRow}>
                                            <TactileButton title="D-Block" icon="hand-left" color={colors.primary} disabled={!selectedPlayer} onPress={() => handleAction('D')} />
                                            <TactileButton title="Opp. Turnover" icon="sync" color={colors.success} onPress={() => handleAction('Opponent Turnover')} />
                                        </View>
                                        <View style={styles.actionBoardRow}>
                                            <TactileButton title="Opp. Score" icon="flag" color={colors.error} onPress={() => handleAction('Opponent Score')} />
                                            <TactileButton title="US Callahan!" icon="flash" color={colors.success} disabled={!selectedPlayer} onPress={() => handleAction('Callahan_US')} />
                                        </View>
                                    </View>
                                )
                            )}
                            
                            <View style={styles.controlRow}>
                                {!isGameOver && (
                                    !gameState.isHalftime ? (
                                        <TouchableOpacity style={styles.controlBtn} onPress={() => recordEvent('Halftime')} activeOpacity={0.6}>
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

                        <TouchableOpacity style={styles.endMatchBtn} onPress={confirmEndGame} activeOpacity={0.6}>
                            <Text style={styles.endMatchBtnText}>End Game & View Match Report</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

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
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
    
    topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
    topAppBarTitle: { ...getTypography(colors).title, fontSize: 18, color: colors.text, flex: 1, textAlign: 'center' },

    mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 24 },
    
    sectionTitle: { ...getTypography(colors).label, marginBottom: 8 },
    sectionSubtitle: { ...getTypography(colors).bodySmall, marginBottom: 16, marginTop: -4 },
    
    // Setup View
    setupCard: { backgroundColor: colors.surface, padding: 24, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    setupHeaderBox: { alignItems: 'center', marginBottom: 24 },
    setupTitle: { ...getTypography(colors).title, fontSize: 20, marginTop: 8 },
    inputLabel: { ...getTypography(colors).label, marginBottom: 8 },
    input: { ...getTypography(colors).body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: Layout.radiusMd, color: colors.text, marginBottom: 16 },
    dividerText: { ...getTypography(colors).bodySmall, textAlign: 'center', marginVertical: 8 },
    setupDivider: { height: 1, backgroundColor: colors.border, marginVertical: 20 },
    settingsRow: { flexDirection: 'row', marginBottom: 24 },
    toggleGroup: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, padding: 4, borderWidth: 1, borderColor: colors.border },
    toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: Layout.radiusSm },
    toggleBtnActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
    toggleBtnText: { ...getTypography(colors).body, fontWeight: '600', color: colors.textSecondary },
    toggleBtnTextActive: { color: colors.text },
    startMatchBtn: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: Layout.radiusMd, alignItems: 'center' },
    startMatchBtnText: { ...getTypography(colors).button, color: colors.onPrimary },

    // Scoreboard
    scoreboard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, paddingVertical: 24, paddingHorizontal: 20, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    scoreBox: { flex: 1, alignItems: 'center' },
    scoreLabel: { ...getTypography(colors).label, marginBottom: 4 },
    scoreNumberContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
    scoreNumber: { ...getTypography(colors).title, fontSize: 56, lineHeight: 60 },
    fireworks: { position: 'absolute', zIndex: 10 },
    scoreDivider: { width: 1, height: 50, backgroundColor: colors.border, marginHorizontal: 16 },
    
    possessionIndicator: { paddingVertical: 12, borderRadius: Layout.radiusMd, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    possessionIndicatorText: { ...getTypography(colors).body, fontWeight: '700' },

    // Lineup Grid
    lineupSection: { marginBottom: 24 },
    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    playerButton: { position: 'relative', backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 16, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, minWidth: '30%', flex: 1, alignItems: 'center', ...Layout.shadow },
    playerButtonSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary, borderWidth: 2 },
    playerButtonHoldingDisc: { shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: {width: 0, height: 0}, elevation: 8 },
    playerButtonEmpty: { backgroundColor: colors.surfaceSecondary, borderStyle: 'dashed' },
    playerButtonText: { ...getTypography(colors).body, fontWeight: '600', color: colors.text },
    playerButtonTextSelected: { color: colors.primary },
    playerButtonEmptyText: { ...getTypography(colors).bodySmall, textAlign: 'center' },
    
    subGrid: { flexGrow: 0 },
    subButton: { backgroundColor: colors.surface, paddingVertical: 8, paddingHorizontal: 16, borderRadius: Layout.radiusLg, marginRight: 8, borderWidth: 1, borderColor: colors.border },
    subButtonText: { ...getTypography(colors).body, fontSize: 14, fontWeight: '600', color: colors.textSecondary },

    // Action Board
    actionPanel: { backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, marginBottom: 24, ...Layout.shadow },
    actionBoard: { marginBottom: 20 },
    actionBoardRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    tacticalBtn: { paddingVertical: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
    tacticalBtnDisabled: { opacity: 0.4 },
    tacticalBtnText: { ...getTypography(colors).button, color: colors.onPrimary, fontSize: 14 },
    
    controlRow: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16 },
    controlBtn: { flex: 1, paddingVertical: 12, borderRadius: Layout.radiusMd, alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    controlBtnText: { ...getTypography(colors).button, color: colors.textSecondary },

    lockedContainer: { alignItems: 'center', padding: 24, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, marginBottom: 20 },
    lockedText: { ...getTypography(colors).bodySmall, marginTop: 12 },

    // Log
    logCard: { marginBottom: 32, backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
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
