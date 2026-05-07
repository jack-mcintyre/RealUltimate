import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { onValue, ref } from 'firebase/database';
import { auth, db } from '../../firebaseConfig';
import DemoPresentationMenuModal from '../components/DemoPresentationMenuModal';
import DemoWalkthroughModal from '../components/DemoWalkthroughModal';
import TabSceneShell from '../components/TabSceneShell';
import TactilePressable from '../components/TactilePressable';
import { DemoModeService } from '../services/DemoModeService';
import { alertUser, formatErrorMessage } from '../utils/userFeedback';
import { resolveDemoTourTeamIds } from '../services/demoTourTeamIds';
import { GameService } from '../services/GameService';
import { sanitizeAvailability, validateScheduledGameDraft } from '../services/scheduleValidation';
import { TeamService } from '../services/TeamService';
import { GameEvent, GameState, ScheduledAvailabilityStatus, ScheduledGame, Team } from '../services/types';
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

/** Which side scored — do not infer Opponent Score from `event.teamId` alone (often logs as our possession snapshot). */
const getScoringTeamIdForCue = (game: GameState, event: GameEvent): string | null => {
    if (!game.team1Id) return null;
    switch (event.type) {
        case 'Callahan_US':
            return game.team1Id;
        case 'Callahan_THEM':
            return game.team2Id ?? null;
        case 'Goal':
        case 'G':
            return event.teamId || null;
        case 'Opponent Score':
            return game.team2Id ?? null;
        default:
            return null;
    }
};

const scoringEventTypes: GameEvent['type'][] = ['Goal', 'G', 'Opponent Score', 'Callahan_US', 'Callahan_THEM'];

const getLiveStreakCue = (game?: GameState) => {
    if (!game?.history?.length) return null;
    const sorted = [...game.history].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const ids = sorted
        .filter((e) => scoringEventTypes.includes(e.type))
        .map((e) => getScoringTeamIdForCue(game, e))
        .filter(Boolean) as string[];
    if (ids.length < 3) return null;
    const lastTeam = ids[ids.length - 1];
    let streak = 1;
    for (let i = ids.length - 2; i >= 0 && ids[i] === lastTeam; i--) {
        streak += 1;
    }
    return streak >= 3 ? { teamId: lastTeam, streak } : null;
};

const getLastScoringLabel = (game: GameState | undefined, team1Name: string, team2Name: string) => {
    if (!game?.history?.length) return null;
    const sorted = [...game.history].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    for (let i = sorted.length - 1; i >= 0; i--) {
        const e = sorted[i];
        if (!scoringEventTypes.includes(e.type)) continue;
        const sid = getScoringTeamIdForCue(game, e);
        if (!sid) continue;
        const label = sid === game.team1Id ? team1Name : team2Name;
        return `Last goal · ${label}`;
    }
    return null;
};

const resolveTeamAvatarUrl = (teamId: string | undefined, coached: Team[], spectated: Team[], directory: Team[]) => {
    if (!teamId) return undefined;
    const merged = dedupeTeams([...coached, ...spectated, ...directory]);
    return merged.find((x) => x.id === teamId)?.pageConfig?.branding?.avatarUrl;
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
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Team[]>([]);
    const [isSearching, setIsSearching] = useState(false);
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
    const [showLaunchGuide, setShowLaunchGuide] = useState(false);
    const [demoWalkthroughVisible, setDemoWalkthroughVisible] = useState(false);
    const [demoMenuVisible, setDemoMenuVisible] = useState(false);
    const [demoPackInstalled, setDemoPackInstalled] = useState(false);
    const [demoTourTeams, setDemoTourTeams] = useState<{ u: string; follow: string } | null>(null);
    const [demoSeeding, setDemoSeeding] = useState(false);

    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);

    const user = auth.currentUser;

    const teamsForDemoResolve = useMemo(
        () => [...coachedTeams, ...spectatedTeams],
        [coachedTeams, spectatedTeams]
    );
    const resolvedTourIds = useMemo(
        () => resolveDemoTourTeamIds(demoTourTeams, teamsForDemoResolve),
        [demoTourTeams, teamsForDemoResolve]
    );

    const hasLiveDemoContent = useMemo(
        () =>
            demoPackInstalled ||
            demoTourTeams !== null ||
            teamsForDemoResolve.some((t) => t.name === 'University of Iowa' || t.name === 'Iowa State'),
        [demoPackInstalled, demoTourTeams, teamsForDemoResolve]
    );

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
        AsyncStorage.getItem('realultimate.launchGuideSeen.v1')
            .then((value) => {
                if (value !== 'true') setShowLaunchGuide(true);
            })
            .catch(() => setShowLaunchGuide(true));

        const unsubscribe = TeamService.getTeamsForUser(user.uid, (coached, spectated) => {
            setCoachedTeams(coached);
            setSpectatedTeams(spectated);
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (!user?.uid) {
            setDemoPackInstalled(false);
            setDemoTourTeams(null);
            return;
        }
        const profileRef = ref(db, `users/${user.uid}/profile`);
        const unsub = onValue(profileRef, (snap) => {
            const data = snap.val();
            if (!data) {
                setDemoPackInstalled(false);
                setDemoTourTeams(null);
                return;
            }
            setDemoPackInstalled(!!data.demoSamplePackV1);
            if (data.demoUniversityIowaTeamId && data.demoIowaStateTeamId) {
                setDemoTourTeams({ u: data.demoUniversityIowaTeamId, follow: data.demoIowaStateTeamId });
            } else {
                setDemoTourTeams(null);
            }
        });
        return () => unsub();
    }, [user?.uid]);

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

    // Subscribe to active games so hub cards update as soon as the recorder writes.
    useEffect(() => {
        const allTeams = [...coachedTeams, ...spectatedTeams];
        const activeGameIds = Array.from(new Set(
            allTeams
                .map((team) => team.activeGameId)
                .filter((id): id is string => !!id)
        ));

        if (activeGameIds.length === 0) {
            setLiveGameDetails({});
            return;
        }

        setLiveGameDetails((prev) => Object.fromEntries(
            Object.entries(prev).filter(([gameId]) => activeGameIds.includes(gameId))
        ));

        const unsubscribers = activeGameIds.map((gameId) =>
            GameService.subscribeToGame(gameId, (game) => {
                setLiveGameDetails((prev) => {
                    if (!game || game.isGameActive === false) {
                        const next = { ...prev };
                        delete next[gameId];
                        return next;
                    }
                    return { ...prev, [gameId]: game };
                });
            })
        );

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [coachedTeams, spectatedTeams]);

    const hydrateLiveGames = useCallback(() => {
        const allTeams = [...coachedTeams, ...spectatedTeams];
        const ids = Array.from(
            new Set(allTeams.map((team) => team.activeGameId).filter((gid): gid is string => !!gid)),
        );
        if (ids.length === 0) return;
        void Promise.all(ids.map((gameId) => GameService.getGameById(gameId))).then((games) => {
            setLiveGameDetails((prev) => {
                const next = { ...prev };
                ids.forEach((gameId, idx) => {
                    const g = games[idx];
                    if (g && g.isGameActive !== false) next[gameId] = { ...g, gameId };
                    else delete next[gameId];
                });
                return next;
            });
        });
    }, [coachedTeams, spectatedTeams]);

    useFocusEffect(
        useCallback(() => {
            hydrateLiveGames();
        }, [hydrateLiveGames]),
    );

    // Fetch Global Past Games
    useEffect(() => {
        const fetchAllPastGames = async () => {
            const allTeams = [...coachedTeams, ...spectatedTeams];
            if (allTeams.length === 0) return;
            
            const uniqueTeamIds = Array.from(new Set(allTeams.map(t => t.id)));
            const gamesPromises = uniqueTeamIds.map(id => GameService.getPastGamesForTeam(id));
            const results = await Promise.all(gamesPromises);
            
            const allGames = results.flat();
            const uniqueGames = Array.from(new Map(allGames.map(g => [g.gameId, g])).values())
                .filter((game) => game.isGameActive === false);
            
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
            const displayName = (user.displayName || user.email?.split('@')[0] || '').trim();
            await TeamService.createTeam(teamNameInput, user.uid, user.email || 'Unknown', displayName);
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
            const displayName = (user.displayName || user.email?.split('@')[0] || '').trim();
            const result = await TeamService.joinTeamByCode(accessCodeInput.toUpperCase(), user.uid, user.email || 'Unknown', displayName);
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

    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await TeamService.searchPublicTeams(searchQuery);
                setSearchResults(results);
            } catch (e) {
                console.error("Search failed", e);
            } finally {
                setIsSearching(false);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

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

    const dismissLaunchGuide = async () => {
        setShowLaunchGuide(false);
        await AsyncStorage.setItem('realultimate.launchGuideSeen.v1', 'true').catch(() => {});
    };

    const runDemoSeed = async (): Promise<boolean> => {
        if (!user) return false;
        setDemoSeeding(true);
        try {
            const name = (user.displayName || user.email?.split('@')[0] || 'Coach').trim();
            const result = await DemoModeService.seedDemoWorld(user.uid, user.email || '', name);
            setDemoTourTeams({ u: result.universityIowaTeamId, follow: result.iowaStateTeamId });
            setDemoPackInstalled(true);
            setDemoWalkthroughVisible(true);
            return true;
        } catch (e: unknown) {
            alertUser('Demo unavailable', formatErrorMessage(e) || 'Please try again.');
            return false;
        } finally {
            setDemoSeeding(false);
        }
    };

    return (
        <TabSceneShell>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
            <Modal visible={showLaunchGuide} animationType="fade" transparent onRequestClose={dismissLaunchGuide}>
                <View style={styles.modalOverlay}>
                    <View style={styles.launchGuideCard}>
                        <Text style={styles.launchGuideKicker}>START HERE</Text>
                        <Text style={styles.launchGuideTitle}>Build your sideline in three moves.</Text>
                        <Text style={styles.launchGuideStep}>1. Create a team or join with a coach code.</Text>
                        <Text style={styles.launchGuideStep}>2. Paste your roster, then tag O-line/D-line and positions.</Text>
                        <Text style={styles.launchGuideStep}>3. Start a game, load a line preset, and share the match card after the final point.</Text>
                        <TouchableOpacity style={styles.launchGuideBtn} onPress={dismissLaunchGuide} activeOpacity={0.85}>
                            <Text style={styles.launchGuideBtnText}>Got it</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

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

                {user && (
                    <TouchableOpacity
                        style={[styles.demoTeamsBanner, demoSeeding && { opacity: 0.75 }]}
                        onPress={() => setDemoMenuVisible(true)}
                        activeOpacity={0.88}
                        disabled={demoSeeding}
                    >
                        <Ionicons name="school-outline" size={22} color={colors.primary} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.demoTeamsBannerTitle}>Demo Presentation - Modern Marvels</Text>
                            <Text style={styles.demoTeamsBannerSub}>Tap for tour and sample data options</Text>
                        </View>
                        {demoSeeding ? (
                            <ActivityIndicator color={colors.primary} />
                        ) : (
                            <Ionicons name="chevron-forward" size={20} color={colors.border} />
                        )}
                    </TouchableOpacity>
                )}

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
                        <Text style={styles.formLabel}>Find a Team</Text>
                        
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, paddingHorizontal: 12, marginBottom: 16 }}>
                            <Ionicons name="search" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.input, { flex: 1, backgroundColor: 'transparent', borderWidth: 0, marginBottom: 0 }]}
                                placeholder="Search public teams..."
                                placeholderTextColor={colors.textSecondary}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {isSearching && <Text style={{ color: colors.textSecondary, fontSize: 12 }}>...</Text>}
                        </View>

                        {searchResults.length > 0 && (
                            <View style={{ marginBottom: 16 }}>
                                {searchResults.map((t) => (
                                    <TouchableOpacity 
                                        key={t.id} 
                                        style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusSm, marginBottom: 8 }}
                                        onPress={() => router.push(`/team/${t.id}` as any)}
                                    >
                                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t.name.substring(0,2).toUpperCase()}</Text>
                                        </View>
                                        <Text style={{ color: colors.text, fontWeight: '600' }}>{t.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        <Text style={[styles.formLabel, { marginTop: 8 }]}>Have an Access Code?</Text>
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
                        <TouchableOpacity style={styles.textButton} onPress={() => { setTeamMode('none'); setSearchQuery(''); setSearchResults([]); }}>
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
                                            <Ionicons name="radio" size={18} color={colors.live} style={{ marginRight: 8 }} />
                                            <Text style={[styles.sectionTitle, { color: colors.live }]}>LIVE ON YOUR TEAMS</Text>
                                        </View>

                                        <ScrollView
                                            horizontal
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.liveCardsRail}
                                        >
                                            {liveTeams.map(t => {
                                                const isCoach = coachedTeams.some(ct => ct.id === t.id);
                                                const game = liveGameDetails[t.activeGameId!];
                                                const isTeam1 = game?.team1Id === t.id;
                                                const team1Name = isTeam1 ? t.name : (game?.team1Id ? 'Opponent' : t.name);
                                                const team2Name = isTeam1 ? (game?.team2Name || 'Opponent') : t.name;
                                                const scoreDisplay = game ? { s1: game.score1 ?? 0, s2: game.score2 ?? 0 } : null;
                                                const streakCue = getLiveStreakCue(game);
                                                const streakTeamName = streakCue?.teamId === game?.team1Id ? team1Name : team2Name;
                                                const lastGoalLine = getLastScoringLabel(game, team1Name, team2Name);
                                                const avatarUrl1 = resolveTeamAvatarUrl(game?.team1Id, coachedTeams, spectatedTeams, teamDirectory);
                                                const avatarUrl2 = resolveTeamAvatarUrl(game?.team2Id, coachedTeams, spectatedTeams, teamDirectory);
                                                const streakLabel = streakCue
                                                    ? streakCue.streak >= 5
                                                        ? `${streakTeamName} — ${streakCue.streak} straight! Unstoppable.`
                                                        : `${streakTeamName} is on fire — ${streakCue.streak} goals in a row!`
                                                    : null;

                                                return (
                                                    <TactilePressable
                                                        key={`live-${t.id}`}
                                                        style={styles.liveMatchCard}
                                                        haptic="medium"
                                                        onPress={() => {
                                                            if (isCoach) router.push(`/game/record/${t.id}` as any);
                                                            else router.push(`/game/watch/${t.id}` as any);
                                                        }}
                                                    >
                                                        <View style={styles.liveMatchTopRow}>
                                                            <View style={styles.liveStatusBadge}>
                                                                <View style={styles.liveDot} />
                                                                <Text style={styles.liveStatusText}>LIVE</Text>
                                                            </View>
                                                            <View style={styles.playIconContainer}>
                                                                <Ionicons name="play" size={17} color={colors.onLive} />
                                                            </View>
                                                        </View>

                                                        <View style={styles.liveTeamsBlock}>
                                                            <View style={styles.liveTeamScoreRow}>
                                                                <View style={styles.liveTeamNameWithAvatar}>
                                                                    {avatarUrl1 ? (
                                                                        <Image source={{ uri: avatarUrl1 }} style={styles.liveTeamAvatar} />
                                                                    ) : null}
                                                                    <Text
                                                                        style={[styles.liveTeamName, scoreDisplay && scoreDisplay.s1 >= scoreDisplay.s2 && styles.liveTeamNameLeading]}
                                                                        numberOfLines={1}
                                                                    >
                                                                        {team1Name}
                                                                    </Text>
                                                                </View>
                                                                <Text style={[styles.liveScoreNumber, scoreDisplay && scoreDisplay.s1 >= scoreDisplay.s2 && styles.liveScoreNumberLeading]}>{scoreDisplay?.s1 ?? '-'}</Text>
                                                            </View>
                                                            <View style={styles.liveTeamScoreRow}>
                                                                <View style={styles.liveTeamNameWithAvatar}>
                                                                    {avatarUrl2 ? (
                                                                        <Image source={{ uri: avatarUrl2 }} style={styles.liveTeamAvatar} />
                                                                    ) : null}
                                                                    <Text
                                                                        style={[styles.liveTeamName, scoreDisplay && scoreDisplay.s2 >= scoreDisplay.s1 && styles.liveTeamNameLeading]}
                                                                        numberOfLines={1}
                                                                    >
                                                                        {team2Name}
                                                                    </Text>
                                                                </View>
                                                                <Text style={[styles.liveScoreNumber, scoreDisplay && scoreDisplay.s2 >= scoreDisplay.s1 && styles.liveScoreNumberLeading]}>{scoreDisplay?.s2 ?? '-'}</Text>
                                                            </View>
                                                        </View>

                                                        {streakLabel ? (
                                                            <View style={styles.liveStreakBadge}>
                                                                <Ionicons name="flame" size={14} color={colors.onLive} />
                                                                <Text style={styles.liveStreakText} numberOfLines={2}>
                                                                    {streakLabel}
                                                                </Text>
                                                            </View>
                                                        ) : null}

                                                        {lastGoalLine ? (
                                                            <Text style={styles.liveLastGoalText} numberOfLines={1}>{lastGoalLine}</Text>
                                                        ) : null}
                                                    </TactilePressable>
                                                );
                                            })}
                                        </ScrollView>
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
                                    const isTie = ourScore === theirScore;
                                    const bgColor = isWin
                                        ? colors.success
                                        : isLoss
                                          ? colors.error
                                          : isTie
                                            ? isDark
                                              ? 'rgba(245, 158, 11, 0.22)'
                                              : '#FEF3C7'
                                            : colors.surfaceSecondary;
                                    const textColor = (isWin || isLoss)
                                        ? colors.onPrimary
                                        : isTie
                                          ? isDark
                                            ? '#FDE68A'
                                            : '#78350F'
                                          : colors.text;
                                    const subTextColor = (isWin || isLoss)
                                        ? 'rgba(255,255,255,0.8)'
                                        : isTie
                                          ? isDark
                                            ? 'rgba(253, 230, 138, 0.85)'
                                            : '#92400E'
                                          : colors.textSecondary;
                                    const scoreBoxBg = (isWin || isLoss)
                                        ? 'rgba(0,0,0,0.15)'
                                        : isTie
                                          ? isDark
                                            ? 'rgba(0,0,0,0.25)'
                                            : 'rgba(146, 64, 14, 0.12)'
                                          : isDark
                                            ? 'rgba(255,255,255,0.05)'
                                            : colors.surface;

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
                            <TactilePressable style={styles.actionGridItem} haptic="light" onPress={() => setTeamMode('create')}>
                                <View style={styles.actionGridIconBox}>
                                    <Ionicons name="add" size={24} color={colors.primary} />
                                </View>
                                <Text style={styles.actionGridTitle}>Create Team</Text>
                                <Text style={styles.actionGridSub}>Start a new roster</Text>
                            </TactilePressable>
                            <TactilePressable style={styles.actionGridItem} haptic="light" onPress={() => setTeamMode('join')}>
                                <View style={[styles.actionGridIconBox, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="scan" size={24} color={colors.text} />
                                </View>
                                <Text style={styles.actionGridTitle}>Join Team</Text>
                                <Text style={styles.actionGridSub}>Code or search</Text>
                            </TactilePressable>
                            <TactilePressable style={styles.actionGridItem} haptic="light" onPress={openScheduleModal}>
                                <View style={[styles.actionGridIconBox, { backgroundColor: colors.primaryLight }]}>
                                    <Ionicons name="calendar" size={24} color={colors.primary} />
                                </View>
                                <Text style={styles.actionGridTitle}>Schedule Game</Text>
                                <Text style={styles.actionGridSub}>Calendar entry</Text>
                            </TactilePressable>
                        </View>

                        <View style={styles.playWithoutAccountSection}>
                            <Text style={styles.playWithoutAccountTitle}>Practice & neutral scoring</Text>
                            <Text style={styles.playWithoutAccountSub}>
                                Run a local scrimmage with no login, or record two registered teams without coach access.
                            </Text>
                            <View style={styles.playWithoutAccountRow}>
                                <TouchableOpacity
                                    style={[styles.playWithoutCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                                    onPress={() => router.push('/demo')}
                                    activeOpacity={0.88}
                                >
                                    <Ionicons name="flash-outline" size={22} color={colors.primary} />
                                    <Text style={styles.playWithoutCardTitle}>Offline quick match</Text>
                                    <Text style={styles.playWithoutCardSub}>Local demo roster · no cloud account needed</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.playWithoutCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                                    onPress={() => router.push('/game/observer-start' as any)}
                                    activeOpacity={0.88}
                                >
                                    <Ionicons name="people-outline" size={22} color={colors.primary} />
                                    <Text style={styles.playWithoutCardTitle}>Neutral scorer</Text>
                                    <Text style={styles.playWithoutCardSub}>Two observer codes · teams accept later</Text>
                                </TouchableOpacity>
                            </View>
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
            {user && (
                <>
                    <DemoPresentationMenuModal
                        visible={demoMenuVisible}
                        onClose={() => setDemoMenuVisible(false)}
                        hasLiveDemoContent={hasLiveDemoContent}
                        isSeeding={demoSeeding}
                        onOpenTour={() => setDemoWalkthroughVisible(true)}
                        onLoadSampleData={async () => {
                            const ok = await runDemoSeed();
                            if (ok) setDemoMenuVisible(false);
                        }}
                    />
                    <DemoWalkthroughModal
                        visible={demoWalkthroughVisible}
                        onClose={() => setDemoWalkthroughVisible(false)}
                        universityIowaTeamId={resolvedTourIds.u}
                        followTeamId={resolvedTourIds.follow}
                    />
                </>
            )}
        </KeyboardAvoidingView>
        </TabSceneShell>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        logoImage: { width: 32, height: 32 },
        logoText: { ...Typography.title, fontSize: 20, color: colors.text },
        profileAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
        
        mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 24 },
        pageHeader: { marginBottom: 24 },
        pageTitle: { ...Typography.title, fontSize: 28 },
        pageSubtitle: { ...Typography.subtitle, marginTop: 4 },

        demoTeamsBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 14,
            marginBottom: 20,
            borderWidth: 1.5,
            borderColor: colors.primary,
            ...Layout.shadow,
        },
        demoTeamsBannerTitle: { ...Typography.body, fontWeight: '700', color: colors.text },
        demoTeamsBannerSub: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 2 },

        sectionContainer: { marginBottom: 32 },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
        sectionTitle: { ...Typography.label },

        // Live Cards — darker red emphasis. Uses the semantic `live*` palette
        // from DesignSystem so light/dark switch keeps WCAG-AA on the score pill.
        liveCardsRail: { gap: 12, paddingRight: 20, paddingBottom: 4 },
        liveMatchCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 12,
            borderWidth: 1,
            borderColor: colors.liveBorder,
            width: 272,
            minHeight: 142,
            ...Layout.shadow,
        },
        liveMatchTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
        liveStatusBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.live,
            alignSelf: 'flex-start',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: Layout.radiusSm,
        },
        liveDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.onLive,
            marginRight: 6,
        },
        liveStatusText: { ...Typography.label, color: colors.onLive, fontSize: 10 },
        liveTeamsBlock: { gap: 6 },
        liveTeamScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
        liveTeamNameWithAvatar: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
        liveTeamAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
        liveTeamName: { ...Typography.body, flex: 1, minWidth: 0, color: colors.textSecondary, fontWeight: '800' },
        liveTeamNameLeading: { color: colors.text },
        liveScoreNumber: { fontSize: 30, lineHeight: 32, fontWeight: '900', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        liveScoreNumberLeading: { color: colors.liveStrong },
        liveStreakBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            marginTop: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.liveStrong,
            maxWidth: '100%',
        },
        liveStreakText: { ...Typography.label, color: colors.onLive, fontSize: 10, flexShrink: 1 },
        liveLastGoalText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '700', marginTop: 8, letterSpacing: 0.15 },
        playIconContainer: {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: colors.live,
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 3,
        },

        playWithoutAccountSection: { marginTop: 12, marginBottom: 48 },
        playWithoutAccountTitle: { ...Typography.title, fontSize: 20, marginBottom: 6 },
        playWithoutAccountSub: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 20, marginBottom: 14 },
        playWithoutAccountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
        playWithoutCard: {
            flex: 1,
            minWidth: 160,
            borderWidth: 1,
            borderRadius: Layout.radiusLg,
            padding: 16,
            gap: 6,
            ...Layout.shadow,
        },
        playWithoutCardTitle: { ...Typography.body, fontWeight: '800', marginTop: 6 },
        playWithoutCardSub: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 18 },

        // Action Grid
        actionGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
        actionGridItem: {
            width: '31.5%',
            minHeight: 120,
            backgroundColor: colors.surface,
            paddingVertical: 12,
            paddingHorizontal: 4,
            borderRadius: Layout.radiusLg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'flex-start',
            ...Layout.shadow,
        },
        actionGridIconBox: { width: 40, height: 40, borderRadius: Layout.radiusSm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
        actionGridTitle: { ...Typography.body, fontWeight: '800', fontSize: 12, textAlign: 'center', lineHeight: 14 },
        actionGridSub: { ...Typography.caption, color: colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 4, lineHeight: 12 },

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
        launchGuideCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: Layout.radiusXl, padding: 24, borderWidth: 1, borderColor: colors.primary, ...Layout.shadow },
        launchGuideKicker: { ...Typography.label, color: colors.primary, marginBottom: 8, letterSpacing: 2 },
        launchGuideTitle: { ...Typography.title, fontSize: 24, lineHeight: 28, marginBottom: 14 },
        launchGuideStep: { ...Typography.body, color: colors.textSecondary, lineHeight: 22, marginBottom: 8 },
        launchGuideBtn: { marginTop: 12, backgroundColor: colors.primary, borderRadius: Layout.radiusMd, paddingVertical: 14, alignItems: 'center' },
        launchGuideBtnText: { ...Typography.button, color: colors.onPrimary },
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
