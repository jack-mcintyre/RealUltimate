import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal, Linking, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { GameService } from '../../services/GameService';
import { TeamService } from '../../services/TeamService';
import { GameState, Team, PlayerStats, PredictionSnapshot } from '../../services/types';
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
const FieldMapVisualizer = ({ events, activeEventId, colors, ourTeamName, oppTeamName }: { events: any[]; activeEventId: string | null; colors: any; ourTeamName: string; oppTeamName: string }) => {
    const [dim, setDim] = useState({ w: 0, h: 0 });

    if (!events || events.length === 0) return null;
    
    const activeEventIdx = activeEventId ? events.findIndex((e: any) => e.id === activeEventId) : -1;
    let activeEvent = null;
    let prevEvent = null;
    
    if (activeEventIdx !== -1) {
        activeEvent = events[activeEventIdx];
        for (let i = activeEventIdx - 1; i >= 0; i--) {
            if (events[i].fieldPosition && events[i].fieldPosition.x >= 0) {
                prevEvent = events[i];
                break;
            }
        }
    } else {
         for (let i = events.length - 1; i >= 0; i--) {
             if (events[i].fieldPosition && events[i].fieldPosition.x >= 0) {
                 activeEvent = events[i];
                 break;
             }
         }
    }

    if (!activeEvent || !activeEvent.fieldPosition || activeEvent.fieldPosition.x < 0) {
        if (!activeEventId) return null;
        return (
            <View style={{ width: '100%', height: 120, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <Ionicons name="location-outline" size={24} color={colors.textSecondary} style={{ marginBottom: 4 }} />
                <Text style={{ color: colors.textSecondary }}>No field position data for this event.</Text>
            </View>
        );
    }

    const { x, y } = activeEvent.fieldPosition;
    
    const isGoal = activeEvent.type === 'G' || activeEvent.type === 'Goal' || activeEvent.type === 'Callahan_US' || activeEvent.type === 'Opponent Score';
    const isTurn = activeEvent.type === 'Drop' || activeEvent.type === 'T' || activeEvent.type === 'Throwaway' || activeEvent.type.includes('Turnover') || activeEvent.type.includes('Callahan');
    
    let markerColor = '#fff';
    if (isGoal) markerColor = '#FACC15'; 
    else if (isTurn) markerColor = '#ef4444';

    let lineStyle: any = null;
    if (dim.w > 0 && prevEvent?.fieldPosition && prevEvent.fieldPosition.x >= 0) {
        const x1 = (prevEvent.fieldPosition.x / 100) * dim.w;
        const y1 = (prevEvent.fieldPosition.y / 100) * dim.h;
        const x2 = (activeEvent.fieldPosition.x / 100) * dim.w;
        const y2 = (activeEvent.fieldPosition.y / 100) * dim.h;

        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const cX = (x1 + x2) / 2;
        const cY = (y1 + y2) / 2;

        lineStyle = {
            position: 'absolute',
            left: cX - length / 2,
            top: cY - 1,
            width: length,
            height: 2,
            backgroundColor: 'rgba(255,255,255,0.8)',
            transform: [{ rotate: `${angle}deg` }],
        };
    }

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
                    <View style={{ width: 190, transform: [{ rotate: '-90deg' }] }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 'bold', letterSpacing: 2, textAlign: 'center' }} numberOfLines={1}>{oppTeamName.toUpperCase()}</Text>
                    </View>
                </View>
                <View style={{ position: 'absolute', right: 0, width: '18%', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                     <View style={{ width: 190, transform: [{ rotate: '90deg' }] }}>
                        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: 'bold', letterSpacing: 2, textAlign: 'center' }} numberOfLines={1}>{ourTeamName.toUpperCase()}</Text>
                    </View>
                </View>

                {/* Trajectory vector */}
                {lineStyle && <View style={lineStyle} />}

                {/* Active Marker */}
                <View style={{
                    position: 'absolute', left: `${x}%`, top: `${y}%`,
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: markerColor, borderWidth: 2, borderColor: '#000',
                    marginLeft: -10, marginTop: -10,
                    shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 4, elevation: 4,
                }} />
            </View>
        </View>
    );
};

// --- Pass Pairings Analyzer ---
const getPassPairings = (history: any[], players: any) => {
    if (!history || !players) return [];
    const pairings: Record<string, { thrower: string, receiver: string, completions: number, turns: number }> = {};
    
    history.forEach(event => {
        if (!event.assistPlayerId) return;
        let receiverId = event.playerId;
        if (!receiverId) return;
        
        const key = `${event.assistPlayerId}|${receiverId}`;
        if (!pairings[key]) {
            pairings[key] = { 
                thrower: players[event.assistPlayerId]?.name.split(' ')[0] || 'Unknown', 
                receiver: players[receiverId]?.name.split(' ')[0] || 'Unknown', 
                completions: 0, 
                turns: 0 
            };
        }
        
        if (event.type === 'Pass' || event.type === 'G' || event.type === 'Goal') {
             pairings[key].completions++;
        } else if (event.type === 'Drop' || event.type === 'T' || event.type === 'Throwaway') {
             pairings[key].turns++;
        }
    });

    return Object.values(pairings)
        .filter(p => p.completions > 0 || p.turns > 0)
        .sort((a, b) => (b.completions + b.turns) - (a.completions + a.turns))
        .slice(0, 8); // Top 8 
};

export default function GameHistoryScreen() {
    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);
    const { gameId, newGame } = useLocalSearchParams<{ gameId: string, newGame?: string }>();
    const [game, setGame] = useState<GameState | null>(null);
    const [team, setTeam] = useState<Team | null>(null);
    const [activeMapEventId, setActiveMapEventId] = useState<string | null>(null);
    const [streamEmbedKey, setStreamEmbedKey] = useState<number>(0);
    const [activeStreamUrl, setActiveStreamUrl] = useState<string | null>(null);
    const [showWelcomeModal, setShowWelcomeModal] = useState(newGame === 'true');
    const boxScoreRef = useRef<View>(null);
    const [isSharing, setIsSharing] = useState(false);

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
            case 'G': return { icon: 'disc', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time, isGoal: true };
            case 'Goal': return { icon: 'disc', color: colors.success, title: 'Goal', desc: `${playerName} scored${assistName ? ` (Assist: ${assistName})` : ''}.`, time, isGoal: true };
            case 'D': return { icon: 'hand-left', color: colors.primary, title: 'Defense', desc: `Block by ${playerName}.`, time };
            case 'T': return { icon: 'close-circle', color: colors.error, title: 'Throwaway', desc: assistName ? `Turnover by ${assistName} intended for ${playerName}.` : `Turnover by ${playerName}.`, time };
            case 'Drop': return { icon: 'arrow-down-circle', color: colors.warning, title: 'Drop', desc: assistName ? `Drop by ${playerName} off pass from ${assistName}.` : `Turnover by ${playerName}.`, time };
            case 'Pass': return { icon: 'swap-horizontal', color: colors.textSecondary, title: 'Pass', desc: assistName ? `Pass from ${assistName} to ${playerName}.` : `${playerName} completed pass.`, time };
            case 'Callahan_US': return { icon: 'flash', color: colors.success, title: `${team?.name} Callahan`, desc: `${playerName} intercepted for a goal!`, time, isGoal: true };
            case 'Callahan_THEM': return { icon: 'flash', color: '#b45309', title: 'Opp. Callahan', desc: `Opponent intercepted ${playerName} for a goal!`, time };
            case 'Opponent Score': return { icon: 'flag', color: colors.error, title: 'Opponent Goal', desc: `Opponent scored.`, time, isGoal: true };
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
                    Alert.alert('Copied!', 'Score copied to clipboard.');
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
    const mvpStatsStr = mvp ? `${mvp.goals}G ${mvp.assists}A ${mvp.blocks}D${mvp.callahans > 0 ? ` ${mvp.callahans}C` : ''}` : '';

    const navToPlayer = (playerId: string) => {
        router.push(`/team/${team.id}/player/${playerId}`);
    };

    const streamConfig = getStreamConfig(game.streamUrl);
    const matchDate = game.history && game.history.length > 0 ? new Date(game.history[0].timestamp).toLocaleDateString() : 'Unknown Date';

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
                                <TouchableOpacity onPress={() => Linking.openURL(streamConfig.originalUrl)} style={styles.externalLinkBtn}>
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
                    {team.players && game.history && getPassPairings(game.history, team.players).length > 0 && (
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>TOP PASS PAIRINGS</Text>
                            <View style={styles.tableHeader}>
                                <Text style={[styles.tableCol, { flex: 2, textAlign: 'left' }]}>Pairing</Text>
                                <Text style={styles.tableCol}>CMP</Text>
                                <Text style={styles.tableCol}>TRN</Text>
                                <Text style={styles.tableCol}>%</Text>
                            </View>
                            {getPassPairings(game.history, team.players).map((p, idx) => {
                                const total = p.completions + p.turns;
                                const pct = Math.round((p.completions / total) * 100);
                                return (
                                    <View key={idx} style={styles.tableRow}>
                                        <Text style={[styles.tableCellName, { flex: 2 }]} numberOfLines={1}>
                                            <Text style={{fontWeight: 'bold'}}>{p.thrower}</Text> ➡️ {p.receiver}
                                        </Text>
                                        <Text style={[styles.tableCell, { color: colors.success }]}>{p.completions}</Text>
                                        <Text style={[styles.tableCell, { color: p.turns > 0 ? colors.error : colors.text }]}>{p.turns}</Text>
                                        <Text style={styles.tableCell}>{pct}%</Text>
                                    </View>
                                )
                            })}
                        </View>
                    )}

                    {/* TIMELINE with Timestamp Bookmarks & Map */}
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>EVENT TIMELINE ({game.history?.length || 0})</Text>
                        
                        {(game.advancedTracking || game.fieldMapEnabled) && (
                             <FieldMapVisualizer 
                                 events={game.history || []} 
                                 activeEventId={activeMapEventId} 
                                 colors={colors} 
                                 ourTeamName={team.name} 
                                 oppTeamName={opponentName} 
                             />
                        )}

                        {streamConfig && streamConfig.videoId && (
                            <Text style={[styles.sectionSubtitle, { color: colors.primary }]}>
                                🎥 Tap "Watch" to skip the video to the match event.
                            </Text>
                        )}
                        {(!game.history || game.history.length === 0) ? (
                            <Text style={styles.emptyText}>No events recorded.</Text>
                        ) : (
                            [...game.history].map((event, index) => {
                                 const formatted = formatEventMessage(event);
                                 const canWatch = streamConfig?.videoId && event.gameElapsedSec && event.gameElapsedSec > 0;
                                 const canMap = typeof event.fieldPosition?.x === 'number' && event.fieldPosition.x >= 0;
                                 
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
