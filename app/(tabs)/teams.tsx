import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { GameService } from '../services/GameService';
import { sanitizeAvailability, validateScheduledGameDraft } from '../services/scheduleValidation';
import { TeamService } from '../services/TeamService';
import { GameState, ScheduledAvailabilityStatus, ScheduledGame, Team } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

const dedupeTeams = (teams: Team[]): Team[] => {
    const map = new Map<string, Team>();
    teams.forEach((team) => {
        if (!team?.id) return;
        map.set(team.id, team);
    });
    return Array.from(map.values());
};

export default function TeamsHubScreen() {
    const [coachedTeams, setCoachedTeams] = useState<Team[]>([]);
    const [spectatedTeams, setSpectatedTeams] = useState<Team[]>([]);

    const [liveGameDetails, setLiveGameDetails] = useState<Record<string, GameState>>({});
    const [globalPastGames, setGlobalPastGames] = useState<GameState[]>([]);
    const [scheduledGamesByTeam, setScheduledGamesByTeam] = useState<Record<string, ScheduledGame[]>>({});
    const [teamDirectory, setTeamDirectory] = useState<Team[]>([]);

    const [teamMode, setTeamMode] = useState<'none' | 'create' | 'join'>('none');
    const [teamNameInput, setTeamNameInput] = useState('');
    const [accessCodeInput, setAccessCodeInput] = useState('');
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleTeamId, setScheduleTeamId] = useState('');
    const [scheduleOpponentName, setScheduleOpponentName] = useState('');
    const [scheduleOpponentSearch, setScheduleOpponentSearch] = useState('');
    const [scheduleOpponentTeamId, setScheduleOpponentTeamId] = useState('');
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
    const [scheduleTime, setScheduleTime] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [scheduleLocationInput, setScheduleLocationInput] = useState('');
    const [scheduleAvailability, setScheduleAvailability] = useState<Record<string, ScheduledAvailabilityStatus>>({});
    const [scheduleFormError, setScheduleFormError] = useState('');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);

    const user = auth.currentUser;
    const scheduledGames = useMemo(
        () => Object.values(scheduledGamesByTeam).flat().sort((a, b) => {
            const aTime = typeof a.scheduledAt === 'number' ? a.scheduledAt : Number.MAX_SAFE_INTEGER;
            const bTime = typeof b.scheduledAt === 'number' ? b.scheduledAt : Number.MAX_SAFE_INTEGER;
            if (aTime !== bTime) return aTime - bTime;
            return (a.createdAt || 0) - (b.createdAt || 0);
        }),
        [scheduledGamesByTeam]
    );
    const selectedScheduleOpponent = scheduleOpponentTeamId
        ? teamDirectory.find((team) => team.id === scheduleOpponentTeamId) || null
        : null;
    const selectedScheduleTeam = coachedTeams.find((team) => team.id === scheduleTeamId) || null;
    const selectedSchedulePlayers = selectedScheduleTeam?.players ? Object.values(selectedScheduleTeam.players) : [];
    const scheduleOpponentResults = useMemo(
        () => teamDirectory
            .filter((team) => team.id !== scheduleTeamId)
            .filter((team) => {
                const q = scheduleOpponentSearch.trim().toLowerCase();
                if (!q) return false;
                return team.name.toLowerCase().includes(q);
            })
            .slice(0, 6),
        [teamDirectory, scheduleTeamId, scheduleOpponentSearch]
    );

    useEffect(() => {
        if (!user) return;
        const unsubscribe = TeamService.getTeamsForUser(user.uid, (coached, spectated) => {
            setCoachedTeams(coached);
            setSpectatedTeams(spectated);
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user?.uid) return;
        let disposed = false;

        TeamService.getAllTeams()
            .then((teams) => {
                if (disposed) return;
                if (teams.length > 0) {
                    setTeamDirectory(teams);
                    return;
                }

                setTeamDirectory(dedupeTeams([...coachedTeams, ...spectatedTeams]));
            })
            .catch(() => {
                if (disposed) return;
                setTeamDirectory(dedupeTeams([...coachedTeams, ...spectatedTeams]));
            });

        return () => {
            disposed = true;
        };
    }, [user?.uid, coachedTeams, spectatedTeams]);

    useEffect(() => {
        if (coachedTeams.length === 0) {
            setScheduledGamesByTeam({});
            return;
        }

        const unsubscribers = coachedTeams.map((team) =>
            TeamService.subscribeToScheduledGames(team.id, (games) => {
                setScheduledGamesByTeam((prev) => ({ ...prev, [team.id]: games }));
            })
        );

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [coachedTeams]);

    useEffect(() => {
        if (coachedTeams.length === 0) {
            setScheduleTeamId('');
            return;
        }

        if (!scheduleTeamId || !coachedTeams.some((team) => team.id === scheduleTeamId)) {
            setScheduleTeamId(coachedTeams[0].id);
        }
    }, [coachedTeams, scheduleTeamId]);

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
        } catch {
            Alert.alert('Error', 'Failed to create team.');
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
                Alert.alert('Invalid Access Code', 'Please check the code and try again.');
            }
        } catch {
            Alert.alert('Error', 'Failed to join team.');
        } finally {
            setIsLoading(false);
        }
    };

    const openScheduleModal = () => {
        if (coachedTeams.length === 0) {
            Alert.alert('No coached teams', 'Create or join a team as coach before scheduling games.');
            return;
        }

        setScheduleTeamId((prev) => prev || coachedTeams[0].id);
        setScheduleOpponentName('');
        setScheduleOpponentSearch('');
        setScheduleOpponentTeamId('');
        setScheduleDate(null);
        setScheduleTime(null);
        setScheduleLocationInput('');
        setScheduleAvailability({});
        setScheduleFormError('');
        setShowDatePicker(false);
        setShowTimePicker(false);
        setShowScheduleModal(true);
    };

    const handleScheduleDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (!selected) return;
        setScheduleDate(selected);
    };

    const handleScheduleTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') setShowTimePicker(false);
        if (!selected) return;
        setScheduleTime(selected);
    };

    const handleCreateScheduledGame = async () => {
        if (!user) return;
        setScheduleFormError('');

        const selectedTeam = coachedTeams.find((team) => team.id === scheduleTeamId);
        if (!selectedTeam) {
            setScheduleFormError('Choose which coached team this game is for.');
            return;
        }

        const validation = validateScheduledGameDraft({
            opponentName: selectedScheduleOpponent?.name || scheduleOpponentName,
            location: scheduleLocationInput,
            scheduleDate,
            scheduleTime,
        });
        if (!validation.ok) {
            setScheduleFormError(validation.error);
            return;
        }

        const validPlayerIds = selectedSchedulePlayers.map((player) => player.id).filter(Boolean);
        const normalizedAvailability = sanitizeAvailability(scheduleAvailability, validPlayerIds);

        try {
            setIsSavingSchedule(true);
            await TeamService.createScheduledGame(selectedTeam.id, {
                teamName: selectedTeam.name,
                opponentName: validation.opponentName,
                opponentTeamId: selectedScheduleOpponent?.id || '',
                location: validation.location,
                scheduledAt: validation.scheduledAt,
                availability: normalizedAvailability,
                createdBy: user.uid,
            });

            setShowScheduleModal(false);
            setScheduleOpponentName('');
            setScheduleOpponentSearch('');
            setScheduleOpponentTeamId('');
            setScheduleDate(null);
            setScheduleTime(null);
            setScheduleLocationInput('');
            setScheduleAvailability({});
            setShowDatePicker(false);
            setShowTimePicker(false);
        } catch {
            setScheduleFormError('Could not save scheduled game. Please try again.');
        } finally {
            setIsSavingSchedule(false);
        }
    };

    const toGoogleCalendarDate = (timestamp: number) => {
        return new Date(timestamp).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const handleOpenCalendar = async (game: ScheduledGame) => {
        if (typeof game.scheduledAt !== 'number') {
            Alert.alert('Date/Time Needed', 'Set date and time first before exporting to calendar.');
            return;
        }

        const start = game.scheduledAt;
        const end = start + (2 * 60 * 60 * 1000);
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: `${game.teamName} vs ${game.opponentName}`,
            dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
            details: `Scheduled via RealUltimate${game.location ? `\nLocation: ${game.location}` : ''}`,
            location: game.location || '',
        });

        await Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
    };

    const handleScheduleAvailability = (playerId: string, status: ScheduledAvailabilityStatus) => {
        setScheduleAvailability((prev) => ({ ...prev, [playerId]: status }));
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

                        {/* Scheduled Games Section */}
                        {coachedTeams.length > 0 && (
                            <View style={styles.sectionContainer}>
                                <View style={styles.sectionHeader}>
                                    <Ionicons name="calendar-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                                    <Text style={styles.sectionTitle}>SCHEDULED GAMES</Text>
                                </View>

                                {scheduledGames.length === 0 ? (
                                    <View style={styles.emptyStateCard}>
                                        <Ionicons name="calendar-clear-outline" size={38} color={colors.border} />
                                        <Text style={styles.emptyStateText}>No scheduled games yet.</Text>
                                        <TouchableOpacity style={[styles.primaryButton, { marginTop: 14, marginBottom: 0 }]} onPress={openScheduleModal} activeOpacity={0.85}>
                                            <Ionicons name="add-circle-outline" size={18} color={colors.onPrimary} style={{ marginRight: 8 }} />
                                            <Text style={styles.primaryButtonText}>Schedule Future Game</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : scheduledGames.map((game) => {
                                    const hasDateTime = typeof game.scheduledAt === 'number';
                                    const gameDate = hasDateTime ? new Date(game.scheduledAt as number) : null;
                                    const selectedTeamForCard = coachedTeams.find((team) => team.id === game.teamId);
                                    const yesNames = Object.entries(game.availability || {})
                                        .filter(([, status]) => status === 'yes')
                                        .map(([playerId]) => selectedTeamForCard?.players?.[playerId]?.name || 'Unknown');
                                    const noNames = Object.entries(game.availability || {})
                                        .filter(([, status]) => status === 'no')
                                        .map(([playerId]) => selectedTeamForCard?.players?.[playerId]?.name || 'Unknown');

                                    return (
                                        <TouchableOpacity
                                            key={`scheduled-${game.id}`}
                                            style={styles.scheduledCard}
                                            activeOpacity={0.88}
                                            onPress={() => router.push({
                                                pathname: '/game/scheduled/[teamId]/[gameId]',
                                                params: {
                                                    teamId: game.teamId,
                                                    gameId: game.id,
                                                },
                                            } as any)}
                                        >
                                            <Text style={styles.cardTitle}>{game.teamName} vs {game.opponentName}</Text>

                                            <Text style={styles.cardSubtitle}>
                                                {gameDate
                                                    ? `${gameDate.toLocaleDateString()} • ${gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                                    : 'Date/Time TBD'}
                                            </Text>
                                            <Text style={styles.cardSubtitle} numberOfLines={2}>In: {yesNames.length ? yesNames.join(', ') : 'TBD'}</Text>
                                            <Text style={styles.cardSubtitle} numberOfLines={2}>Out: {noNames.length ? noNames.join(', ') : 'None listed'}</Text>

                                            <View style={styles.scheduledActionRow}>
                                                <TouchableOpacity
                                                    style={styles.scheduledActionBtn}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        router.push({
                                                            pathname: '/game/record/[teamId]',
                                                            params: {
                                                                teamId: game.teamId,
                                                                scheduledGameId: game.id,
                                                                prefOpponentName: game.opponentName,
                                                                prefOpponentTeamId: game.opponentTeamId || '',
                                                                prefLocation: game.location || '',
                                                            }
                                                        } as any);
                                                    }}
                                                    activeOpacity={0.8}
                                                >
                                                    <Ionicons name="play" size={14} color={colors.primary} />
                                                    <Text style={styles.scheduledActionText}>Start</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={[styles.scheduledActionBtn, !hasDateTime && styles.scheduledActionBtnDisabled]}
                                                    onPress={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenCalendar(game);
                                                    }}
                                                    disabled={!hasDateTime}
                                                    activeOpacity={0.8}
                                                >
                                                    <Ionicons name="calendar-outline" size={14} color={hasDateTime ? colors.primary : colors.textSecondary} />
                                                    <Text style={[styles.scheduledActionText, !hasDateTime && styles.scheduledActionTextDisabled]}>Calendar</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

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
                            <TouchableOpacity style={styles.actionGridItem} onPress={openScheduleModal} activeOpacity={0.8}>
                                <View style={[styles.actionGridIconBox, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="calendar" size={24} color={colors.primary} />
                                </View>
                                <Text style={styles.actionGridText}>Schedule Game</Text>
                            </TouchableOpacity>
                        </View>

                    </View>
                )}
            </ScrollView>

            <Modal visible={showScheduleModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.scheduleModalCard}>
                        <Text style={styles.scheduleModalTitle}>Schedule Future Game</Text>

                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>

                        <Text style={styles.formLabel}>Coach Team</Text>
                        <View style={styles.teamChipsRow}>
                            {coachedTeams.map((team) => (
                                <TouchableOpacity
                                    key={`schedule-team-${team.id}`}
                                    style={[styles.teamChip, scheduleTeamId === team.id && styles.teamChipActive]}
                                    onPress={() => {
                                        setScheduleTeamId(team.id);
                                        setScheduleAvailability({});
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.teamChipText, scheduleTeamId === team.id && styles.teamChipTextActive]}>{team.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.formLabel}>Opponent Team Search</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Search team list"
                            placeholderTextColor={colors.textSecondary}
                            value={scheduleOpponentSearch}
                            onChangeText={(value) => {
                                setScheduleOpponentSearch(value);
                                if (!value.trim()) {
                                    setScheduleOpponentTeamId('');
                                    return;
                                }

                                if (selectedScheduleOpponent && value.trim().toLowerCase() !== selectedScheduleOpponent.name.trim().toLowerCase()) {
                                    setScheduleOpponentTeamId('');
                                }
                            }}
                        />

                        {!!selectedScheduleOpponent && (
                            <View style={styles.selectedScheduleOpponentRow}>
                                <Text style={styles.cardSubtitle}>{selectedScheduleOpponent.name}</Text>
                                <TouchableOpacity onPress={() => setScheduleOpponentTeamId('')}>
                                    <Ionicons name="close-circle" size={18} color={colors.primary} />
                                </TouchableOpacity>
                            </View>
                        )}

                        {!selectedScheduleOpponent && scheduleOpponentResults.map((team) => (
                            <TouchableOpacity
                                key={`schedule-opp-${team.id}`}
                                style={styles.scheduleOpponentRow}
                                onPress={() => {
                                    setScheduleOpponentTeamId(team.id);
                                    setScheduleOpponentName(team.name);
                                    setScheduleOpponentSearch(team.name);
                                }}
                                activeOpacity={0.75}
                            >
                                <Text style={styles.cardSubtitle}>{team.name}</Text>
                                <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        ))}

                        {!selectedScheduleOpponent && scheduleOpponentSearch.trim().length > 0 && scheduleOpponentResults.length === 0 && (
                            <View style={styles.opponentEmptyHintRow}>
                                <Text style={styles.cardSubtitle}>No teams matched that search. You can still enter a guest opponent name below.</Text>
                            </View>
                        )}

                        <Text style={styles.formLabel}>Opponent Name (Guest Optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Rival University"
                            placeholderTextColor={colors.textSecondary}
                            value={scheduleOpponentName}
                            onChangeText={(value) => {
                                setScheduleOpponentName(value);
                                if (!selectedScheduleOpponent || value !== selectedScheduleOpponent.name) {
                                    setScheduleOpponentTeamId('');
                                }
                            }}
                        />

                        <View style={styles.rowInputs}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.formLabel}>Date</Text>
                                <TouchableOpacity
                                    style={styles.dateTimePickerBtn}
                                    onPress={() => setShowDatePicker(true)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                                    <Text style={styles.dateTimePickerText}>
                                        {scheduleDate ? scheduleDate.toLocaleDateString() : 'Select Date'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ width: 12 }} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.formLabel}>Time</Text>
                                <TouchableOpacity
                                    style={styles.dateTimePickerBtn}
                                    onPress={() => setShowTimePicker(true)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="time-outline" size={18} color={colors.primary} />
                                    <Text style={styles.dateTimePickerText}>
                                        {scheduleTime
                                            ? scheduleTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                            : 'Select Time'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {showDatePicker && (
                            <DateTimePicker
                                value={scheduleDate || new Date(Date.now() + 60 * 60 * 1000)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                minimumDate={new Date()}
                                onChange={handleScheduleDateChange}
                            />
                        )}

                        {showTimePicker && (
                            <DateTimePicker
                                value={scheduleTime || new Date()}
                                mode="time"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                onChange={handleScheduleTimeChange}
                            />
                        )}

                        <Text style={styles.formLabel}>Location (Optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Main Turf"
                            placeholderTextColor={colors.textSecondary}
                            value={scheduleLocationInput}
                            onChangeText={setScheduleLocationInput}
                        />

                        <Text style={styles.formLabel}>Player Availability</Text>
                        {selectedSchedulePlayers.length > 0 ? (
                            selectedSchedulePlayers.map((player) => {
                                const status = scheduleAvailability[player.id];
                                return (
                                    <View key={`availability-${player.id}`} style={styles.availabilityRow}>
                                        <Text style={styles.availabilityName}>{player.name}</Text>
                                        <View style={styles.availabilityControls}>
                                            <TouchableOpacity
                                                style={[styles.availabilityBtn, status === 'yes' && styles.availabilityBtnYesActive]}
                                                onPress={() => handleScheduleAvailability(player.id, 'yes')}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="checkmark" size={14} color={status === 'yes' ? '#fff' : colors.success} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.availabilityBtn, status === 'no' && styles.availabilityBtnNoActive]}
                                                onPress={() => handleScheduleAvailability(player.id, 'no')}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="close" size={14} color={status === 'no' ? '#fff' : colors.error} />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })
                        ) : (
                            <Text style={styles.cardSubtitle}>Add players to this team to set availability.</Text>
                        )}

                        {!!scheduleFormError && (
                            <View style={styles.formErrorBox}>
                                <Ionicons name="warning-outline" size={16} color={colors.error} />
                                <Text style={styles.formErrorText}>{scheduleFormError}</Text>
                            </View>
                        )}

                        <Text style={styles.scheduleHintText}>Date and time are optional. Leave both blank for Date/Time TBD.</Text>

                        </ScrollView>

                        <View style={styles.modalButtonRow}>
                            <TouchableOpacity style={styles.modalGhostBtn} onPress={() => setShowScheduleModal(false)} activeOpacity={0.8}>
                                <Text style={styles.textButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.primaryButton, { flex: 1, marginBottom: 0, opacity: isSavingSchedule ? 0.8 : 1 }]}
                                onPress={handleCreateScheduledGame}
                                activeOpacity={0.8}
                                disabled={isSavingSchedule}
                            >
                                <Ionicons name="calendar" size={18} color={colors.onPrimary} style={{ marginRight: 8 }} />
                                <Text style={styles.primaryButtonText}>{isSavingSchedule ? 'Saving...' : 'Save Scheduled Game'}</Text>
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
        actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 32 },
        actionGridItem: { width: '30%', minWidth: 120, backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        actionGridIconBox: { width: 48, height: 48, borderRadius: Layout.radiusSm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
        actionGridText: { ...Typography.body, fontWeight: '600' },

        // Scheduled cards
        scheduledCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 16,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.primary,
            ...Layout.shadow,
        },
        scheduledActionRow: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
        scheduledActionBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusSm,
            paddingVertical: 8,
        },
        scheduledActionBtnDisabled: {
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
        },
        scheduledActionText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        scheduledActionTextDisabled: { color: colors.textSecondary },

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

        // Scheduling modal
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
        },
        scheduleModalCard: {
            width: '100%',
            maxWidth: 520,
            maxHeight: '90%',
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
        },
        scheduleModalTitle: { ...Typography.title, fontSize: 20, marginBottom: 14 },
        teamChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
        teamChip: {
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
        },
        teamChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
        teamChipText: { ...Typography.bodySmall, color: colors.textSecondary },
        teamChipTextActive: { color: colors.primary, fontWeight: '700' },
        scheduleOpponentRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 8,
        },
        selectedScheduleOpponentRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 12,
        },
        opponentEmptyHintRow: {
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 10,
            marginBottom: 10,
        },
        dateTimePickerBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingHorizontal: 12,
            paddingVertical: 14,
            marginBottom: 14,
        },
        dateTimePickerText: { ...Typography.body, color: colors.text },
        rowInputs: { flexDirection: 'row', alignItems: 'flex-start' },
        modalButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        modalGhostBtn: {
            flex: 1,
            paddingVertical: 14,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceSecondary,
        },
        availabilityRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
            marginBottom: 8,
        },
        availabilityName: { ...Typography.bodySmall, color: colors.text, fontWeight: '600', flex: 1, paddingRight: 8 },
        availabilityControls: { flexDirection: 'row', gap: 8 },
        availabilityBtn: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        availabilityBtnYesActive: { backgroundColor: colors.success, borderColor: colors.success },
        availabilityBtnNoActive: { backgroundColor: colors.error, borderColor: colors.error },
        formErrorBox: {
            marginTop: 8,
            marginBottom: 6,
            borderWidth: 1,
            borderColor: colors.error,
            backgroundColor: colors.errorBg,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        formErrorText: { ...Typography.bodySmall, color: colors.error, flex: 1 },
        scheduleHintText: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
    });
}
