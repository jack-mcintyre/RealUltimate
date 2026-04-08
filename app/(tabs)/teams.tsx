import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { GameService } from '../services/GameService';
import { TeamService } from '../services/TeamService';
import { GameState, Team } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

export default function TeamsHubScreen() {
    const [coachedTeams, setCoachedTeams] = useState<Team[]>([]);
    const [spectatedTeams, setSpectatedTeams] = useState<Team[]>([]);

    const [liveGameDetails, setLiveGameDetails] = useState<Record<string, GameState>>({});
    const [globalPastGames, setGlobalPastGames] = useState<GameState[]>([]);

    const [teamMode, setTeamMode] = useState<'none' | 'create' | 'join'>('none');
    const [teamNameInput, setTeamNameInput] = useState('');
    const [accessCodeInput, setAccessCodeInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);

    const user = auth.currentUser;

    useEffect(() => {
        if (!user) return;
        const unsubscribe = TeamService.getTeamsForUser(user.uid, (coached, spectated) => {
            setCoachedTeams(coached);
            setSpectatedTeams(spectated);
        });
        return () => unsubscribe();
    }, [user]);

    // Fetch Live Games Details to get Opponent Names
    useEffect(() => {
        const fetchLiveGames = async () => {
            const allTeams = [...coachedTeams, ...spectatedTeams];
            const liveTeams = allTeams.filter(t => t.activeGameId);
            const newDetails: Record<string, GameState> = {};

            const idsToFetch = Array.from(new Set(
                liveTeams
                    .map((team) => team.activeGameId)
                    .filter((id): id is string => !!id && !liveGameDetails[id])
            ));

            const fetchedGames = await Promise.all(
                idsToFetch.map(async (id) => ({ id, game: await GameService.getGameById(id) }))
            );

            fetchedGames.forEach(({ id, game }) => {
                if (game) newDetails[id] = game;
            });

            if (Object.keys(newDetails).length > 0) {
                setLiveGameDetails(prev => ({ ...prev, ...newDetails }));
            }
        };

        if (coachedTeams.length > 0 || spectatedTeams.length > 0) {
            fetchLiveGames();
        }
    }, [coachedTeams, spectatedTeams]); // only triggers when rosters update

    // Fetch Global Past Games
    useEffect(() => {
        const fetchAllPastGames = async () => {
            const allTeams = [...coachedTeams, ...spectatedTeams];
            if (allTeams.length === 0) return;
            
            const uniqueTeamIds = Array.from(new Set(allTeams.map(t => t.id)));
            const gamesPromises = uniqueTeamIds.map(id => GameService.getPastGamesForTeam(id));
            const results = await Promise.all(gamesPromises);
            
            const allGames = results.flat();
            const uniqueGames = Array.from(new Map(allGames.map(g => [g.gameId, g])).values());
            
            uniqueGames.sort((a, b) => {
                const timeA = a.history && a.history.length > 0 ? a.history[a.history.length - 1].timestamp : 0;
                const timeB = b.history && b.history.length > 0 ? b.history[b.history.length - 1].timestamp : 0;
                return timeB - timeA;
            });
            
            setGlobalPastGames(uniqueGames.slice(0, 3));
        };
        fetchAllPastGames();
    }, [coachedTeams, spectatedTeams]);

    const handleCreateTeam = async () => {
        if (!teamNameInput.trim() || !user) return;
        setIsLoading(true);
        try {
            await TeamService.createTeam(teamNameInput, user.uid, user.email || 'Unknown');
            setTeamNameInput('');
            setTeamMode('none');
        } catch (e) {
            alert("Failed to create team.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoinTeam = async () => {
        if (!accessCodeInput.trim() || !user) return;
        setIsLoading(true);
        try {
            const result = await TeamService.joinTeamByCode(accessCodeInput.toUpperCase(), user.uid, user.email || 'Unknown');
            if (result) {
                setAccessCodeInput('');
                setTeamMode('none');
            } else {
                alert("Invalid Access Code");
            }
        } catch (e) {
            alert("Failed to join team.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            {/* COMPONENT HEADER */}
            <View style={styles.topAppBar}>
                <View style={styles.logoRow}>
                    <Image source={require('../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
                    <Text style={styles.logoText}>RealUltimate</Text>
                </View>
                <TouchableOpacity style={styles.profileAvatar} onPress={() => router.push('/(tabs)/profile')}>
                    <Ionicons name="person" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.mainContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.pageHeader}>
                    <Text style={styles.pageTitle}>Teams</Text>
                    <Text style={styles.pageSubtitle}>Manage your teams and live games</Text>
                </View>

                {/* CREATE / JOIN FORMS */}
                {teamMode === 'create' && (
                    <View style={styles.formContainer}>
                        <Text style={styles.formLabel}>New Team Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. The Night Owls"
                            placeholderTextColor={colors.textSecondary}
                            value={teamNameInput}
                            onChangeText={setTeamNameInput}
                        />
                        <TouchableOpacity style={styles.primaryButton} onPress={handleCreateTeam} disabled={isLoading} activeOpacity={0.8}>
                            <Ionicons name="shield-checkmark" size={20} color={colors.onPrimary} style={{ marginRight: 8 }} />
                            <Text style={styles.primaryButtonText}>{isLoading ? 'Creating...' : 'Initialize Team'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.textButton} onPress={() => setTeamMode('none')}>
                            <Text style={styles.textButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {teamMode === 'join' && (
                    <View style={styles.formContainer}>
                        <Text style={styles.formLabel}>Access Code</Text>
                        <TextInput
                            style={[styles.input, { textTransform: 'uppercase', textAlign: 'center', letterSpacing: 8, fontSize: 24 }]}
                            placeholder="XXXXXX"
                            placeholderTextColor={colors.textSecondary}
                            maxLength={6}
                            value={accessCodeInput}
                            onChangeText={setAccessCodeInput}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity style={styles.primaryButton} onPress={handleJoinTeam} disabled={isLoading} activeOpacity={0.8}>
                            <Ionicons name="enter" size={20} color={colors.onPrimary} style={{ marginRight: 8 }} />
                            <Text style={styles.primaryButtonText}>{isLoading ? 'Joining...' : 'Link to Team'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.textButton} onPress={() => setTeamMode('none')}>
                            <Text style={styles.textButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* LISTINGS & ACTION GRID */}
                {teamMode === 'none' && (
                    <View>
                        {/* Live Games Section */}
                        {(() => {
                            const allTeams = [...coachedTeams, ...spectatedTeams];
                            const uniqueTeams = Array.from(new Map(allTeams.map(t => [t.id, t])).values());
                            const liveTeams = uniqueTeams.filter(t => t.activeGameId);

                            if (liveTeams.length > 0) {
                                return (
                                    <View style={styles.sectionContainer}>
                                        <View style={styles.sectionHeader}>
                                            <Ionicons name="radio" size={18} color={colors.error} style={{ marginRight: 8 }} />
                                            <Text style={styles.sectionTitle}>ACTIVE MATCHES</Text>
                                        </View>

                                        {liveTeams.map(t => {
                                            const isCoach = coachedTeams.some(ct => ct.id === t.id);
                                            const game = liveGameDetails[t.activeGameId!];
                                            
                                            // Format "MyTeam vs Opponent"
                                            const matchLabel = (() => {
                                                if (!game) return `${t.name} (Live)`;
                                                const isTeam1 = game.team1Id === t.id;
                                                const oppName = isTeam1 ? (game.team2Name || "Opponent") : (game.team1Id ? "Opponent" : t.name);
                                                return `${t.name} vs ${oppName}`;
                                            })();

                                            return (
                                                <TouchableOpacity 
                                                    key={`live-${t.id}`} 
                                                    style={styles.liveMatchCard}
                                                    activeOpacity={0.8}
                                                    onPress={() => {
                                                        if (isCoach) router.push(`/game/record/${t.id}` as any);
                                                        else router.push(`/game/watch/${t.id}` as any);
                                                    }}
                                                >
                                                    <View style={styles.liveMatchContent}>
                                                        <View style={{ flex: 1, paddingRight: 10 }}>
                                                            <View style={styles.liveStatusBadge}>
                                                                <View style={styles.liveDot} />
                                                                <Text style={styles.liveStatusText}>{isCoach ? 'BROADCASTING' : 'LIVE FEED'}</Text>
                                                            </View>
                                                            <Text style={styles.cardTitle} numberOfLines={1}>{matchLabel}</Text>
                                                        </View>
                                                        <View style={styles.playIconContainer}>
                                                            <Ionicons name="play" size={20} color={colors.onPrimary} />
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                );
                            }
                            return null;
                        })()}

                        {/* Coached Teams Section */}
                        <View style={styles.sectionContainer}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>COACHING</Text>
                            </View>

                            {coachedTeams.length === 0 ? (
                                <View style={styles.emptyStateCard}>
                                    <Ionicons name="shield-outline" size={40} color={colors.border} />
                                    <Text style={styles.emptyStateText}>You are not managing any teams.</Text>
                                </View>
                            ) : (
                                coachedTeams.map(t => (
                                    <TouchableOpacity 
                                        key={t.id} 
                                        style={styles.standardCard}
                                        activeOpacity={0.8}
                                        onPress={() => router.push(`/team/${t.id}` as any)}
                                    >
                                        <View style={styles.cardHeader}>
                                            <View style={styles.teamBadgeCoach}>
                                                <Text style={styles.teamBadgeTextCoach}>{t.name.substring(0, 2).toUpperCase()}</Text>
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 16 }}>
                                                <Text style={styles.cardTitle}>{t.name}</Text>
                                                <Text style={styles.cardSubtitle}>Manager / Coach</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={20} color={colors.border} />
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>

                        {/* Spectated Teams Section */}
                        <View style={styles.sectionContainer}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>SPECTATING</Text>
                            </View>

                            {spectatedTeams.length === 0 ? (
                                <View style={styles.emptyStateCard}>
                                    <Ionicons name="eye-outline" size={40} color={colors.border} />
                                    <Text style={styles.emptyStateText}>You are not following any teams.</Text>
                                </View>
                            ) : (
                                spectatedTeams.map(t => (
                                    <TouchableOpacity 
                                        key={t.id} 
                                        style={styles.standardCard}
                                        activeOpacity={0.8}
                                        onPress={() => router.push(`/team/${t.id}` as any)}
                                    >
                                        <View style={styles.cardHeader}>
                                            <View style={styles.teamBadgeFan}>
                                                <Text style={styles.teamBadgeTextFan}>{t.name.substring(0, 2).toUpperCase()}</Text>
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 16 }}>
                                                <Text style={styles.cardTitle}>{t.name}</Text>
                                                <Text style={styles.cardSubtitle}>Fan Access</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={20} color={colors.border} />
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </View>

                        {/* Global Past Games Section */}
                        {globalPastGames.length > 0 && (
                            <View style={styles.sectionContainer}>
                                <View style={styles.sectionHeader}>
                                    <Ionicons name="time" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                                    <Text style={styles.sectionTitle}>RECENT MATCHES</Text>
                                </View>
                                {globalPastGames.map((game) => {
                                    const allTeams = [...coachedTeams, ...spectatedTeams];
                                    const ourTeam = allTeams.find(t => t.id === game.team1Id || t.id === game.team2Id);
                                    if (!ourTeam) return null;
                                    
                                    const isTeam1 = game.team1Id === ourTeam.id;
                                    const opponentName = isTeam1 ? game.team2Name || "Opponent" : "Opponent";
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
                                            key={`global-${game.gameId}`} 
                                            style={[styles.standardCard, { backgroundColor: bgColor, flexDirection: 'row', alignItems: 'center' }]}
                                            onPress={() => router.push(`/game/history/${game.gameId}` as any)}
                                            activeOpacity={0.8}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.cardTitle, { color: textColor }]}>{ourTeam.name} vs {opponentName}</Text>
                                                <Text style={[styles.cardSubtitle, { color: subTextColor }]}>{dateText}</Text>
                                            </View>
                                            <View style={{ backgroundColor: scoreBoxBg, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Layout.radiusSm }}>
                                                <Text style={{ ...getTypography(colors).title, fontSize: 18, color: textColor }}>
                                                    {ourScore} - {theirScore}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {/* Action Grid (Moved Down) */}
                        <View style={styles.actionGrid}>
                            <TouchableOpacity style={styles.actionGridItem} onPress={() => setTeamMode('create')} activeOpacity={0.8}>
                                <View style={styles.actionGridIconBox}>
                                    <Ionicons name="add" size={24} color={colors.primary} />
                                </View>
                                <Text style={styles.actionGridText}>Create Team</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionGridItem} onPress={() => setTeamMode('join')} activeOpacity={0.8}>
                                <View style={[styles.actionGridIconBox, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="scan" size={24} color={colors.text} />
                                </View>
                                <Text style={styles.actionGridText}>Join Team</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background, paddingBottom: 60 },
        
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        logoImage: { width: 32, height: 32 },
        logoText: { ...Typography.title, fontSize: 20, color: colors.text },
        profileAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
        
        mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 24 },
        pageHeader: { marginBottom: 24 },
        pageTitle: { ...Typography.title, fontSize: 28 },
        pageSubtitle: { ...Typography.subtitle, marginTop: 4 },

        sectionContainer: { marginBottom: 32 },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
        sectionTitle: { ...Typography.label },

        // Live Cards
        liveMatchCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 16, borderWidth: 1, borderColor: colors.error, marginBottom: 12, ...Layout.shadow },
        liveMatchContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        liveStatusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.errorBg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Layout.radiusSm, marginBottom: 8 },
        liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.error, marginRight: 6 },
        liveStatusText: { ...Typography.label, color: colors.error, fontSize: 10 },
        playIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingLeft: 4 },

        // Action Grid
        actionGrid: { flexDirection: 'row', gap: 16, marginBottom: 32 },
        actionGridItem: { flex: 1, backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        actionGridIconBox: { width: 48, height: 48, borderRadius: Layout.radiusSm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
        actionGridText: { ...Typography.body, fontWeight: '600' },

        // Standard Cards
        standardCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        cardHeader: { flexDirection: 'row', alignItems: 'center' },
        teamBadgeCoach: { width: 48, height: 48, borderRadius: Layout.radiusMd, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
        teamBadgeTextCoach: { ...Typography.body, fontWeight: '700', color: colors.primary },
        teamBadgeFan: { width: 48, height: 48, borderRadius: Layout.radiusMd, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
        teamBadgeTextFan: { ...Typography.body, fontWeight: '700', color: colors.textSecondary },
        cardTitle: { ...Typography.body, fontWeight: '600', marginBottom: 2 },
        cardSubtitle: { ...Typography.bodySmall },

        // Empty States
        emptyStateCard: { padding: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
        emptyStateText: { ...Typography.bodySmall, textAlign: 'center', marginTop: 12 },

        // Forms
        formContainer: { backgroundColor: colors.surface, padding: 24, marginVertical: 16, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        formLabel: { ...Typography.label, marginBottom: 8 },
        input: { ...Typography.body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: Layout.radiusMd, color: colors.text, marginBottom: 20 },
        
        primaryButton: { flexDirection: 'row', backgroundColor: colors.primary, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 12 },
        primaryButtonText: { ...Typography.button, color: colors.onPrimary },
        textButton: { padding: 16, alignItems: 'center' },
        textButtonText: { ...Typography.button, color: colors.textSecondary },
    });
}
