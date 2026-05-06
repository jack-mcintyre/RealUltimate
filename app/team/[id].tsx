import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../firebaseConfig';
import { GameService } from '../services/GameService';
import { ensureHttps, getHostname, validateExternalUrl, validateSocialExternalUrl } from '../services/linkUtils';
import { sanitizeAvailability, validateScheduledGameDraft } from '../services/scheduleValidation';
import { TeamService } from '../services/TeamService';
import { GameState, ScheduledAvailabilityStatus, ScheduledGame, SocialLinks, Team, TeamGameLink, TeamJoinCodes, TeamManager, TeamMediaItem } from '../services/types';
import { getTypography, Layout } from '../theme/DesignSystem';
import { ThemeColors, useTheme } from '../theme/ThemeContext';

const isValidCoord = (coord: any) => typeof coord?.x === 'number' && typeof coord?.y === 'number' && coord.x >= 0 && coord.y >= 0;

const zoneValueFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(100, x));
    const base = clamped / 100;
    const redZoneBonus = clamped >= 82 ? 0.35 : 0;
    const ownEndzonePenalty = clamped <= 18 ? -0.15 : 0;
    return base + redZoneBonus + ownEndzonePenalty;
};

const classifyThrowProfile = (dx: number, dy: number, distance: number, toX: number) => {
    if (toX >= 82 && distance >= 16) return 'Red Zone Attack';
    if (distance >= 32 && dx >= 18) return 'Huck';
    if (Math.abs(dy) >= 20) return 'Break';
    if (distance <= 12) return 'Reset';
    return 'Under';
};

const managerNameFromEmail = (email?: string) => {
    if (!email) return 'Coach';
    return email.split('@')[0] || email;
};

const managerDisplayName = (manager?: Partial<TeamManager>) => {
    const displayName = (manager?.displayName || '').trim();
    if (displayName) return displayName;
    return managerNameFromEmail(manager?.email);
};

const hexToRgba = (hex: string, alpha: number) => {
    const clean = hex.replace('#', '');
    const normalized = clean.length === 3
        ? clean.split('').map((ch) => `${ch}${ch}`).join('')
        : clean;

    if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) {
        return `rgba(24, 119, 242, ${alpha})`;
    }

    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const BADGE_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    captain: { label: 'Captain', color: '#F59E0B', icon: 'ribbon-outline' },
    handler: { label: 'Handler', color: '#2563EB', icon: 'flash-outline' },
    cutter: { label: 'Cutter', color: '#16A34A', icon: 'play-forward-outline' },
    defender: { label: 'Defender', color: '#DC2626', icon: 'shield-outline' },
    playmaker: { label: 'Playmaker', color: '#7C3AED', icon: 'sparkles-outline' },
    rookie: { label: 'Rookie', color: '#0EA5E9', icon: 'school-outline' },
    mvp: { label: 'MVP', color: '#EA580C', icon: 'trophy-outline' },
    iron: { label: 'Iron', color: '#475569', icon: 'fitness-outline' },
};

const ROLE_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    handler: { label: 'Handler', color: '#2563EB', icon: 'flash-outline' },
    cutter: { label: 'Cutter', color: '#16A34A', icon: 'play-forward-outline' },
    hybrid: { label: 'Hybrid', color: '#7C3AED', icon: 'shuffle-outline' },
    o_handler: { label: 'O-Handler', color: '#1D4ED8', icon: 'arrow-forward-outline' },
    o_cutter: { label: 'O-Cutter', color: '#059669', icon: 'arrow-up-outline' },
    d_handler: { label: 'D-Handler', color: '#DC2626', icon: 'shield-outline' },
    d_cutter: { label: 'D-Cutter', color: '#B91C1C', icon: 'shield-half-outline' },
};

const LINE_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    O: { label: 'O-Line', color: '#2563EB', icon: 'arrow-up-circle-outline' },
    D: { label: 'D-Line', color: '#DC2626', icon: 'shield-checkmark-outline' },
    flex: { label: 'Flex', color: '#7C3AED', icon: 'shuffle-outline' },
};

const POSITION_META: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    handler: { label: 'Handler', color: '#2563EB', icon: 'flash-outline' },
    cutter: { label: 'Cutter', color: '#16A34A', icon: 'play-forward-outline' },
    hybrid: { label: 'Hybrid', color: '#7C3AED', icon: 'git-branch-outline' },
};

const formatRosterDisplayName = (name: string) => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return (name || 'Unknown').toUpperCase();
    const first = parts[0]?.[0] ? `${parts[0][0]}.` : '';
    return `${parts.slice(1).join(' ')}, ${first}`.toUpperCase();
};

export default function TeamDashboardScreen() {
    const { id, preview } = useLocalSearchParams<{ id: string; preview?: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [pastGames, setPastGames] = useState<GameState[]>([]);
    const [pendingObserverNeutralGames, setPendingObserverNeutralGames] = useState<{ gameId: string; opponentTeamId?: string }[]>([]);
    const [scheduledGames, setScheduledGames] = useState<ScheduledGame[]>([]);
    const [joinCodes, setJoinCodes] = useState<TeamJoinCodes | null>(null);
    const [isSpectator, setIsSpectator] = useState(false);
    const [hideToastTimeoutRef, setHideToastTimeoutRef] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [showCopiedToast, setShowCopiedToast] = useState(false);

    // Player Input
    const [playerName, setPlayerName] = useState('');
    const [playerNumber, setPlayerNumber] = useState('');
    
    // Analytics Filter
    const [selectedYear, setSelectedYear] = useState<string>('All Time');
    
    // Team Roles UI
    const [showPermissionsModal, setShowPermissionsModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showAddMediaModal, setShowAddMediaModal] = useState(false);
    const [mediaTitleInput, setMediaTitleInput] = useState('');
    const [mediaUrlInput, setMediaUrlInput] = useState('');
    const [isSavingMedia, setIsSavingMedia] = useState(false);
    const [scheduleOpponentName, setScheduleOpponentName] = useState('');
    const [scheduleLocation, setScheduleLocation] = useState('');
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
    const [scheduleTime, setScheduleTime] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [scheduleAvailability, setScheduleAvailability] = useState<Record<string, ScheduledAvailabilityStatus>>({});
    const [scheduleFormError, setScheduleFormError] = useState('');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);

    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);
    const currentUserId = auth.currentUser?.uid || '';

    useEffect(() => {
        if (!id) return;
        
        const unsubscribe = TeamService.subscribeToTeam(id, (t) => {
            setTeam(t);
        });

        const loadPastGames = async () => {
            const history = await GameService.getPastGamesForTeam(id);
            setPastGames(history);
        };
        loadPastGames();

        const unsubscribeScheduled = TeamService.subscribeToScheduledGames(id, (games) => {
            setScheduledGames(games);
        });

        return () => {
            unsubscribe();
            unsubscribeScheduled();
        };
    }, [id]);

    useEffect(() => {
        if (!id) return;

        return TeamService.subscribeToTeamGameLinks(id, (links: Record<string, TeamGameLink>) => {
            const pending = Object.entries(links || {})
                .filter(
                    ([, link]) =>
                        link &&
                        link.source === 'observer_neutral' &&
                        (link.profileInclusion ?? 'pending') === 'pending' &&
                        link.status === 'final'
                )
                .map(([gameId, link]) => ({ gameId, opponentTeamId: link.opponentTeamId }));

            setPendingObserverNeutralGames(pending);
            GameService.clearPastGamesCacheForTeam(id);
            GameService.getPastGamesForTeam(id).then(setPastGames).catch(() => {});
        });
    }, [id]);

    useEffect(() => {
        if (!id || !currentUserId) return;
        return TeamService.subscribeToSpectatorStatus(id, currentUserId, (status) => {
            setIsSpectator(status);
        });
    }, [id, currentUserId]);

    useEffect(() => {
        if (!id || !team || preview === 'public') {
            setJoinCodes(null);
            return;
        }

        const canEdit = currentUserId === team.coachId || !!team.managers?.[currentUserId];
        if (!canEdit) {
            setJoinCodes(null);
            return;
        }

        return TeamService.subscribeToTeamJoinCodes(id, (codes) => {
            setJoinCodes(codes);
        });
    }, [id, preview, team, currentUserId]);

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
        if (!team || !auth.currentUser) return;
        setScheduleFormError('');

        const validation = validateScheduledGameDraft({
            opponentName: scheduleOpponentName,
            location: scheduleLocation,
            scheduleDate,
            scheduleTime,
        });
        if (!validation.ok) {
            setScheduleFormError(validation.error);
            return;
        }

        const validPlayerIds = Object.keys(team.players || {});
        const normalizedAvailability = sanitizeAvailability(scheduleAvailability, validPlayerIds);

        try {
            setIsSavingSchedule(true);
            await TeamService.createScheduledGame(team.id, {
                teamName: team.name,
                opponentName: validation.opponentName,
                opponentTeamId: '',
                location: validation.location,
                scheduledAt: validation.scheduledAt,
                availability: normalizedAvailability,
                createdBy: auth.currentUser.uid,
            });

            setShowScheduleModal(false);
            setScheduleOpponentName('');
            setScheduleLocation('');
            setScheduleDate(null);
            setScheduleTime(null);
            setScheduleAvailability({});
            setShowDatePicker(false);
            setShowTimePicker(false);
        } catch {
            setScheduleFormError('Could not schedule game. Please try again.');
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
        const title = `${game.teamName} vs ${game.opponentName}`;
        const details = `Scheduled in RealUltimate${game.location ? `\nLocation: ${game.location}` : ''}`;
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: title,
            dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
            details,
            location: game.location || '',
        });

        await Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
    };

    const handleOpenExternal = async (url: string) => {
        const validated = validateExternalUrl((url || '').trim());
        if (!validated.ok) {
            Alert.alert('Invalid URL', validated.error);
            return;
        }
        await Linking.openURL(validated.url);
    };

    const handleSaveTeamMedia = async () => {
        if (!team || !currentUserId) return;
        const normalizedUrl = ensureHttps(mediaUrlInput.trim());
        const host = getHostname(normalizedUrl);
        const title = mediaTitleInput.trim();
        if (!title) {
            Alert.alert('Title needed', 'Add a short title for this media post.');
            return;
        }
        if (!normalizedUrl || !host) {
            Alert.alert('Invalid URL', 'Paste a valid YouTube, image, or web link.');
            return;
        }

        const lowerUrl = normalizedUrl.toLowerCase();
        const mediaType: TeamMediaItem['type'] = host.includes('youtube') || host.includes('youtu.be')
            ? 'youtube'
            : /\.(png|jpe?g|gif|webp)(\?|$)/i.test(lowerUrl)
                ? 'image'
                : 'link';

        const newMedia: TeamMediaItem = {
            id: `${Date.now()}`,
            type: mediaType,
            title,
            url: normalizedUrl,
            createdAt: Date.now(),
        };

        try {
            setIsSavingMedia(true);
            await TeamService.updateTeamPageConfig(team.id, currentUserId, {
                ...pageConfig,
                media: [newMedia, ...(pageConfig.media || [])].slice(0, 12),
            });
            setMediaTitleInput('');
            setMediaUrlInput('');
            setShowAddMediaModal(false);
        } catch {
            Alert.alert('Could not add media', 'Please check your permissions and try again.');
        } finally {
            setIsSavingMedia(false);
        }
    };

    const handleShareTeam = async () => {
        if (!team) return;
        const fanCode = joinCodes?.spectator || team.spectatorCode;
        const message = fanCode 
            ? `Check out my ultimate frisbee team on RealUltimate! Download the app and enter the Fan Code ${fanCode} to follow us!`
            : `Check out my ultimate frisbee team on RealUltimate! Search for "${team.name}" in the app to follow us!`;
            
        try {
            await Share.share({ message });
        } catch (error) {
            console.error("Error sharing", error);
        }
    };

    const handleOpenSocialExternal = async (platform: keyof SocialLinks, url: string) => {
        const validated = validateSocialExternalUrl(platform, url);
        if (!validated.ok) {
            Alert.alert('Invalid URL', validated.error);
            return;
        }
        await Linking.openURL(validated.url);
    };

    const refreshPastGamesForTeam = async () => {
        if (!id) return;
        GameService.clearPastGamesCacheForTeam(id);
        const history = await GameService.getPastGamesForTeam(id);
        setPastGames(history);
    };

    const handleAcceptObserverNeutralGame = async (gameId: string) => {
        if (!id || !currentUserId) return;
        try {
            await TeamService.acceptObserverNeutralGameOnProfile(id, gameId, currentUserId);
            await refreshPastGamesForTeam();
            Alert.alert('Added to profile', 'This observer-recorded match is now visible in history and analytics.');
        } catch {
            Alert.alert('Something went wrong', 'Could not add this match.');
        }
    };

    const handleDeclineObserverNeutralGame = async (gameId: string) => {
        if (!id || !currentUserId) return;
        try {
            await TeamService.declineObserverNeutralGameOnProfile(id, gameId, currentUserId);
            Alert.alert('Declined', 'This match stays off your public history.');
        } catch {
            Alert.alert('Something went wrong', 'Could not update this request.');
        }
    };

    const handleFollowToggle = async () => {
        if (!team || !currentUserId) return;
        try {
            if (isSpectator) {
                await TeamService.unfollowTeam(team.id, currentUserId);
            } else {
                await TeamService.followTeam(team.id, currentUserId);
            }
        } catch {
            Alert.alert("Error", "Could not update follow status.");
        }
    };

    const copyToClipboard = async (text: string) => {
        await Clipboard.setStringAsync(text);
        if (hideToastTimeoutRef) clearTimeout(hideToastTimeoutRef);
        setShowCopiedToast(true);
        const timeout = setTimeout(() => setShowCopiedToast(false), 2000);
        setHideToastTimeoutRef(timeout);
    };

    const handleScheduleAvailability = (playerId: string, value: ScheduledAvailabilityStatus) => {
        setScheduleAvailability((prev) => ({ ...prev, [playerId]: value }));
    };

    const openScheduleModal = () => {
        setScheduleOpponentName('');
        setScheduleLocation('');
        setScheduleDate(null);
        setScheduleTime(null);
        setScheduleAvailability({});
        setShowDatePicker(false);
        setShowTimePicker(false);
        setScheduleFormError('');
        setShowScheduleModal(true);
    };

    const handleAddPlayer = async () => {
        if (!team || !playerName) return;
        try {
            const uid = auth.currentUser?.uid;
            if (!uid) return;
            await TeamService.addPlayer(team.id, playerName, uid, playerNumber);
            setPlayerName('');
            setPlayerNumber('');
        } catch {
            Alert.alert("Failed to add player.");
        }
    };

    const parseRosterLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const numberMatch = trimmed.match(/^#?(\d{1,3})[\s,.-]+(.+)$/);
        const namePart = (numberMatch ? numberMatch[2] : trimmed)
            .replace(/\b(O-Line|D-Line|O|D|Flex|Handler|Cutter|Hybrid)\b/gi, '')
            .replace(/[|,]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const lower = trimmed.toLowerCase();
        const primaryLine = /\bd-line\b|\bd\b/.test(lower) ? 'D' : /\bo-line\b|\bo\b/.test(lower) ? 'O' : 'flex';
        const position = lower.includes('handler') ? 'handler' : lower.includes('cutter') ? 'cutter' : 'hybrid';

        return {
            name: namePart || trimmed,
            number: numberMatch?.[1] || '',
            primaryLine: primaryLine as 'O' | 'D' | 'flex',
            position: position as 'handler' | 'cutter' | 'hybrid',
        };
    };

    const handlePasteRoster = async () => {
        if (!team) return;
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        const clipboard = await Clipboard.getStringAsync();
        const parsed = clipboard
            .split(/\r?\n/)
            .map(parseRosterLine)
            .filter(Boolean)
            .slice(0, 60) as { name: string; number: string; primaryLine: 'O' | 'D' | 'flex'; position: 'handler' | 'cutter' | 'hybrid' }[];

        if (!parsed.length) {
            Alert.alert('Paste Roster', 'Copy one player per line first. Optional format: "#12 Jane Smith O Handler".');
            return;
        }

        try {
            for (const player of parsed) {
                await TeamService.addPlayer(team.id, player.name, uid, player.number, player.primaryLine, player.position);
            }
            Alert.alert('Roster Imported', `Added ${parsed.length} players from your clipboard.`);
        } catch (error: any) {
            Alert.alert('Import Failed', error?.message || 'Could not import this roster.');
        }
    };

    if (!team) return <View style={styles.centerContainer}><Text style={styles.loadingText}>Loading Team...</Text></View>;

    const isPreviewPublic = preview === 'public';
    const isCoach = currentUserId === team.coachId && !isPreviewPublic;
    const isManager = !!team.managers?.[currentUserId] && !isPreviewPublic;
    const canEditTeamPage = isCoach || isManager;

    const pageConfig = team.pageConfig || {};
    const pageSettings = {
        isPublic: pageConfig.settings?.isPublic ?? true,
        advancedStatsPublic: pageConfig.settings?.advancedStatsPublic ?? true,
        mediaPublic: pageConfig.settings?.mediaPublic ?? true,
        showCoachCode: pageConfig.settings?.showCoachCode ?? false,
        showFanCode: pageConfig.settings?.showFanCode ?? false,
        showFanCount: pageConfig.settings?.showFanCount ?? true,
    };
    const canSeeAdvancedStats = pageSettings.advancedStatsPublic || canEditTeamPage;

    const teamAvatarUrl = pageConfig.branding?.avatarUrl?.trim() || '';
    const teamBannerUrl = pageConfig.branding?.bannerUrl?.trim() || '';
    const teamBio = pageConfig.branding?.bio?.trim() || '';
    const teamAccent = /^#([0-9A-F]{3}){1,2}$/i.test(pageConfig.theme?.accentColor || '') ? (pageConfig.theme?.accentColor as string) : colors.primary;
    const teamAccentSoft = hexToRgba(teamAccent, 0.28);
    const teamAccentBg = hexToRgba(teamAccent, 0.12);
    const teamMedia = (pageConfig.media || []).slice(0, 6);
    const showTeamMediaSection = canEditTeamPage || (pageSettings.mediaPublic && teamMedia.length > 0);

    const announcement = pageConfig.announcement;
    const announcementActive = !!announcement?.message && (!announcement.expiresAt || announcement.expiresAt > Date.now());

    const nextScheduledGame = (scheduledGames || []).find((game) => {
        if (typeof game.scheduledAt !== 'number') return true;
        return game.scheduledAt >= Date.now();
    }) || null;
    /** Coaches/managers see per-player avail. icons next to roster when there is an upcoming/TBD scheduled game. */
    const canSeeAvailabilityStatus = canEditTeamPage && !!nextScheduledGame;
    /** Only finalized games belong in Previous Games / win stats. */
    const finishedPastGames = pastGames.filter((g) => g.isGameActive === false);

    const socialEntries = [
        { key: 'x', label: 'X', url: pageConfig.socialLinks?.x || '' },
        { key: 'youtube', icon: 'logo-youtube' as const, url: pageConfig.socialLinks?.youtube || '' },
        { key: 'facebook', icon: 'logo-facebook' as const, url: pageConfig.socialLinks?.facebook || '' },
        { key: 'instagram', icon: 'logo-instagram' as const, url: pageConfig.socialLinks?.instagram || '' },
        { key: 'website', icon: 'globe-outline' as const, url: pageConfig.socialLinks?.website || '' },
    ].filter((entry) => !!entry.url);

    const managerEntries = Object.entries(team.managers || {});
    const headCoachEntry = managerEntries.find(([, manager]) => manager.role === 'Head Coach');
    const headCoachNameOverride = (pageConfig.branding?.coachDisplayName || '').trim();
    const headCoachName = headCoachNameOverride || managerDisplayName(headCoachEntry?.[1]);
    const coCoachNames = managerEntries
        .filter(([, manager]) => manager.role !== 'Head Coach')
        .map(([, manager]) => managerDisplayName(manager));

    const handleDeleteTeam = () => {
        if (Platform.OS === 'web') {
            const confirmed = window.confirm("Are you sure you want to delete this team?");
            if (confirmed) {
                if (auth.currentUser) {
                    TeamService.deleteTeam(team.id, auth.currentUser.uid)
                        .then(() => router.replace('/(tabs)/teams'))
                        .catch(() => alert("Failed to delete team."));
                }
            }
        } else {
            Alert.alert(
                "Delete Team",
                "Are you sure you want to delete this team?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: async () => {
                        try {
                            if (auth.currentUser) {
                                await TeamService.deleteTeam(team.id, auth.currentUser.uid);
                                router.replace('/(tabs)/teams');
                            }
                        } catch {
                            Alert.alert("Error", "Failed to delete team.");
                        }
                    }}
                ]
            );
        }
    };

    const handleRoleChange = (managerId: string, currentRole: string) => {
        if (!team) return;
        Alert.alert(
            "Change Role",
            "Select new role for this manager",
            [
                {
                    text: "Assistant Coach",
                    onPress: () => {
                        const uid = auth.currentUser?.uid;
                        if (!uid) return;
                        TeamService.updateManagerRole(team.id, managerId, "Assistant Coach", uid);
                    }
                },
                {
                    text: "Stats Taker",
                    onPress: () => {
                        const uid = auth.currentUser?.uid;
                        if (!uid) return;
                        TeamService.updateManagerRole(team.id, managerId, "Stats Taker", uid);
                    }
                },
                { text: "Cancel", style: "cancel" }
            ]
        );
    };

    const handleRemoveManager = (managerId: string) => {
        if (!team) return;
        Alert.alert(
            "Remove Manager",
            "Are you sure you want to remove this user from the team managers?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                        const uid = auth.currentUser?.uid;
                        if (!uid) return;
                        TeamService.removeManager(team.id, managerId, uid);
                    }
                }
            ]
        );
    };

    const handleRemovePlayer = (playerId: string, playerName: string) => {
        if (!team) return;
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        Alert.alert(
            "Remove Player",
            `Remove ${playerName} from roster?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await TeamService.removePlayer(team.id, playerId, uid);
                        } catch {
                            Alert.alert("Error", "Failed to remove player.");
                        }
                    }
                }
            ]
        );
    };
    const availableYears = ['All Time', ...Array.from(new Set(finishedPastGames.map(g => {
        return g.history?.length ? new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() : 'Unknown';
    }))).filter(y => y !== 'Unknown').sort((a,b) => b.localeCompare(a))];

    const filteredGames = finishedPastGames.filter(g => {
        if (selectedYear === 'All Time') return true;
        if (!g.history?.length) return false;
        return new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() === selectedYear;
    });

    const totalGames = filteredGames.length;
    let wins = 0;
    let losses = 0;
    let ties = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;
    filteredGames.forEach(g => {
        const isTeam1 = g.team1Id === team.id;
        const ourScore = isTeam1 ? g.score1 : g.score2;
        const theirScore = isTeam1 ? g.score2 : g.score1;
        pointsFor += ourScore || 0;
        pointsAgainst += theirScore || 0;
        if (ourScore > theirScore) wins++;
        else if (theirScore > ourScore) losses++;
        else ties++;
    });
    const winrate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const winPctDecimal = totalGames > 0 ? wins / totalGames : 0;
    const avgPointDiff = totalGames > 0 ? (pointsFor - pointsAgainst) / totalGames : 0;
    /** SPI = (win %)×100 + (avg margin)×10 — same filter as match list. */
    const spiRaw = winPctDecimal * 100 + avgPointDiff * 10;
    const spiScore = totalGames > 0 ? Math.round(spiRaw * 10) / 10 : 0;
    const pointsForAvg = totalGames > 0 ? (pointsFor / totalGames).toFixed(1) : '0.0';
    const pointsAgainstAvg = totalGames > 0 ? (pointsAgainst / totalGames).toFixed(1) : '0.0';

    const chronGames = [...filteredGames].sort((a, b) => {
        const aTs = a.history?.length ? a.history[a.history.length - 1].timestamp : 0;
        const bTs = b.history?.length ? b.history[b.history.length - 1].timestamp : 0;
        return bTs - aTs;
    });

    let currentWinStreak = 0;
    for (const game of chronGames) {
        const isTeam1 = game.team1Id === team.id;
        const ourScore = isTeam1 ? game.score1 : game.score2;
        const theirScore = isTeam1 ? game.score2 : game.score1;
        if (ourScore > theirScore) {
            currentWinStreak += 1;
            continue;
        }
        break;
    }

    const lastFiveRecord = chronGames.slice(0, 5).reduce(
        (record, game) => {
            const isTeam1 = game.team1Id === team.id;
            const ourScore = isTeam1 ? game.score1 : game.score2;
            const theirScore = isTeam1 ? game.score2 : game.score1;
            if (ourScore > theirScore) record.wins += 1;
            else if (theirScore > ourScore) record.losses += 1;
            else record.ties += 1;
            return record;
        },
        { wins: 0, losses: 0, ties: 0 }
    );

    const formSummary =
        currentWinStreak > 0
            ? `+${currentWinStreak} win streak`
            : [ties > 0 ? `${ties} draw${ties === 1 ? '' : 's'}` : '', losses > 0 ? `${losses} loss${losses === 1 ? '' : 'es'}` : '']
                  .filter(Boolean)
                  .join(' · ') || 'Even';

    const chemistryPairs: Record<string, { thrower: string; receiver: string; attempts: number; completions: number }> = {};
    filteredGames.forEach((game) => {
        (game.history || []).forEach((event: any) => {
            const isCompletion = event.type === 'Pass' || event.type === 'Goal' || event.type === 'G';
            const isTurn = event.type === 'Throwaway' || event.type === 'T' || event.type === 'Drop';
            if (!isCompletion && !isTurn) return;

            const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined);
            const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
            if (!throwerId || !receiverId || !team.players?.[throwerId] || !team.players?.[receiverId]) return;

            const key = `${throwerId}|${receiverId}`;
            if (!chemistryPairs[key]) {
                chemistryPairs[key] = {
                    thrower: team.players[throwerId].name.split(' ')[0] || 'Unknown',
                    receiver: team.players[receiverId].name.split(' ')[0] || 'Unknown',
                    attempts: 0,
                    completions: 0,
                };
            }

            chemistryPairs[key].attempts += 1;
            if (isCompletion) chemistryPairs[key].completions += 1;
        });
    });

    const topChemistryPair = Object.values(chemistryPairs)
        .filter((pair) => pair.attempts > 0)
        .sort((a, b) => {
            const aPct = a.completions / a.attempts;
            const bPct = b.completions / b.attempts;
            if (bPct !== aPct) return bPct - aPct;
            return b.attempts - a.attempts;
        })[0];

    const throwProfiles: Record<string, { attempts: number; completions: number; turnovers: number; distanceSum: number; samples: number }> = {};
    let epvTotal = 0;
    let epvSamples = 0;
    let epvPositive = 0;

    filteredGames.forEach((game) => {
        (game.history || []).forEach((event: any) => {
            const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined);
            const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);
            const isCompletion = event.type === 'Pass' || event.type === 'Goal' || event.type === 'G';
            const isTurn = event.type === 'Throwaway' || event.type === 'T' || event.type === 'Drop';
            const isDirectional = (isCompletion || isTurn) && !!throwerId && !!receiverId;

            if (!isDirectional || !isValidCoord(event.fromFieldPosition) || !isValidCoord(event.fieldPosition)) return;

            const dx = event.fieldPosition.x - event.fromFieldPosition.x;
            const dy = event.fieldPosition.y - event.fromFieldPosition.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy));
            const profile = classifyThrowProfile(dx, dy, distance, event.fieldPosition.x);

            if (!throwProfiles[profile]) {
                throwProfiles[profile] = { attempts: 0, completions: 0, turnovers: 0, distanceSum: 0, samples: 0 };
            }

            throwProfiles[profile].attempts += 1;
            throwProfiles[profile].distanceSum += distance;
            throwProfiles[profile].samples += 1;
            if (isCompletion) throwProfiles[profile].completions += 1;
            if (isTurn) throwProfiles[profile].turnovers += 1;

            const delta = zoneValueFromX(event.fieldPosition.x) - zoneValueFromX(event.fromFieldPosition.x);
            epvTotal += delta;
            epvSamples += 1;
            if (delta > 0) epvPositive += 1;
        });
    });

    const topThrowProfiles = Object.entries(throwProfiles)
        .map(([name, data]) => ({
            name,
            attempts: data.attempts,
            completionPct: data.attempts ? Math.round((data.completions / data.attempts) * 100) : 0,
            avgDistance: data.samples ? Math.round(data.distanceSum / data.samples) : 0,
        }))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 3);

    const epvAverage = epvSamples > 0 ? epvTotal / epvSamples : 0;
    const epvPositiveRate = epvSamples > 0 ? Math.round((epvPositive / epvSamples) * 100) : 0;

    return (
        <View style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle} numberOfLines={1}>{team.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                        style={[styles.topEditBtn, { borderColor: teamAccent, backgroundColor: teamAccentBg }]}
                        onPress={handleShareTeam}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="share-outline" size={18} color={teamAccent} />
                    </TouchableOpacity>
                    {canEditTeamPage ? (
                        <TouchableOpacity
                            style={[styles.topEditBtn, { borderColor: teamAccent, backgroundColor: teamAccentBg }]}
                            onPress={() => router.push(`/team/${team.id}/edit` as any)}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="create-outline" size={18} color={teamAccent} />
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 40 }} />
                    )}
                </View>
            </View>

            {isPreviewPublic && (
                <View style={styles.previewModePill}>
                    <Ionicons name="eye-outline" size={13} color={colors.primary} />
                    <Text style={styles.previewModeText}>Public Preview Mode</Text>
                </View>
            )}

            <ScrollView style={styles.mainContent} contentContainerStyle={styles.mainContentContainer} showsVerticalScrollIndicator={false}>
                
                {/* TEAM INFO CARD */}
                <View style={[styles.infoCard, { borderColor: teamAccentSoft }]}>
                    <View style={[styles.teamBannerWrap, { borderColor: teamAccentSoft }]}>
                        {teamBannerUrl ? (
                            <Image source={{ uri: teamBannerUrl }} style={styles.teamBannerImage} resizeMode="cover" />
                        ) : (
                            <View style={[styles.teamBannerPlaceholder, { backgroundColor: teamAccentBg }]}> 
                                <Text style={styles.teamBannerPlaceholderText}>{team.name.toUpperCase()}</Text>
                            </View>
                        )}
                    </View>

                    <View style={[styles.teamAvatarOverlay, { borderColor: teamAccent }]}>
                        {teamAvatarUrl ? (
                            <Image source={{ uri: teamAvatarUrl }} style={styles.teamAvatarImage} resizeMode="cover" />
                        ) : (
                            <View style={[styles.teamBadgeLg, { backgroundColor: teamAccentBg }]}> 
                                <Text style={[styles.teamBadgeTextLg, { color: teamAccent }]}>{team.name.substring(0, 2).toUpperCase()}</Text>
                            </View>
                        )}
                    </View>

                    <Text style={[styles.teamNameTitle, { color: teamAccent, marginBottom: 4 }]}>{team.name}</Text>
                    
                    {pageSettings.showFanCount && (
                        <Text style={{ ...getTypography(colors).bodySmall, color: colors.textSecondary, marginBottom: 8 }}>
                            <Ionicons name="people" size={14} color={colors.textSecondary} /> {team.fanCount || 0} Followers
                        </Text>
                    )}

                    {!canEditTeamPage && currentUserId && (
                        <TouchableOpacity
                            style={{ paddingVertical: 10, paddingHorizontal: 24, borderRadius: Layout.radiusMd, marginTop: 4, marginBottom: 12, backgroundColor: isSpectator ? colors.surfaceSecondary : teamAccent, borderWidth: 1, borderColor: isSpectator ? colors.border : teamAccent }}
                            onPress={handleFollowToggle}
                            activeOpacity={0.8}
                        >
                            <Text style={{ ...getTypography(colors).button, color: isSpectator ? colors.text : colors.onPrimary }}>
                                {isSpectator ? 'Following' : 'Follow Team'}
                            </Text>
                        </TouchableOpacity>
                    )}

                    {((canEditTeamPage && pageSettings.showCoachCode) || pageSettings.showFanCode) && (
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                            {canEditTeamPage && pageSettings.showCoachCode && (
                                <TouchableOpacity style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => { const code = joinCodes?.coach || team.accessCode; if (code) copyToClipboard(code); }} activeOpacity={0.7}>
                                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 2, fontWeight: '700' }}>COACH CODE</Text>
                                    <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 1, color: teamAccent }}>{joinCodes?.coach || team.accessCode || 'N/A'}</Text>
                                </TouchableOpacity>
                            )}
                            {pageSettings.showFanCode && (
                                <TouchableOpacity style={{ backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => { const code = joinCodes?.spectator || team.spectatorCode; if (code) copyToClipboard(code); }} activeOpacity={0.7}>
                                    <Text style={{ fontSize: 10, color: colors.textSecondary, marginBottom: 2, fontWeight: '700' }}>FAN CODE</Text>
                                    <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 1, color: teamAccent }}>{joinCodes?.spectator || team.spectatorCode || 'N/A'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {!!teamBio && <Text style={styles.teamBioText}>{teamBio}</Text>}

                    <View style={[styles.pageVisibilityPill, { borderColor: teamAccent, backgroundColor: colors.surfaceSecondary }]}>
                        <Ionicons name={pageSettings.isPublic ? 'earth-outline' : 'lock-closed-outline'} size={14} color={teamAccent} />
                        <Text style={[styles.pageVisibilityText, { color: teamAccent }]}>{pageSettings.isPublic ? 'Public Team Page' : 'Private Team Page'}</Text>
                    </View>

                    {announcementActive && (
                        <View style={[styles.announcementCard, { borderColor: teamAccent }]}> 
                            <Ionicons name="megaphone-outline" size={14} color={teamAccent} />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.announcementLabel}>Pinned Announcement</Text>
                                <Text style={styles.announcementText}>{announcement?.message}</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.coachRow}>
                        <Ionicons name="person-circle-outline" size={14} color={colors.textSecondary} />
                        <Text style={styles.coachText}>Coach: {headCoachName}</Text>
                    </View>
                    {!!coCoachNames.length && (
                        <View style={styles.coachRow}>
                            <Ionicons name="people-outline" size={14} color={colors.textSecondary} />
                            <Text style={styles.coachText}>Co-Coach: {coCoachNames.slice(0, 3).join(', ')}</Text>
                        </View>
                    )}

                    {!!socialEntries.length && (
                        <View style={styles.socialIconRow}>
                            {socialEntries.map((entry) => (
                                <TouchableOpacity
                                    key={`team-social-${entry.key}`}
                                    style={[styles.socialIconBtn, { borderColor: teamAccent, backgroundColor: colors.surfaceSecondary }]}
                                    onPress={() => handleOpenSocialExternal(entry.key as keyof SocialLinks, entry.url)}
                                    activeOpacity={0.8}
                                >
                                    {entry.key === 'x' ? (
                                        <Text style={[styles.xMarkText, { color: teamAccent }]}>X</Text>
                                    ) : (
                                        <Ionicons name={entry.icon as any} size={15} color={teamAccent} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    

                </View>

                {/* ACTION BUTTONS */}
                        <View style={styles.actionRow}>
                            {isCoach ? (
                                <TouchableOpacity 
                                    style={[styles.primaryActionBtn, { flex: 1, marginRight: team.activeGameId ? 8 : 0, backgroundColor: teamAccent }]}
                                    onPress={() => router.push(`/game/record/${team.id}` as any)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name={team.activeGameId ? "play" : "videocam"} size={24} color={colors.onPrimary} style={{ marginBottom: 8 }} />
                                    <Text style={styles.primaryActionBtnText}>{team.activeGameId ? 'Resume Match' : 'Record Match'}</Text>
                                </TouchableOpacity>
                            ) : null}

                            {team.activeGameId && (
                                <TouchableOpacity 
                                    style={[styles.liveActionBtn, { flex: 1 }]}
                                    onPress={() => router.push(`/game/watch/${team.id}` as any)}
                                    activeOpacity={0.8}
                                >
                                    <Ionicons name="radio" size={24} color={colors.onPrimary} style={{ marginBottom: 8 }} />
                                    <Text style={styles.primaryActionBtnText}>Watch Live</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                {/* MEDIA HIGHLIGHTS */}
                {showTeamMediaSection && (
                    <View style={{ marginBottom: 20 }}>
                        <View style={[styles.sectionHeader, styles.teamMediaSectionHeader]}>
                            <Text style={styles.sectionTitle}>Team Media</Text>
                            {canEditTeamPage && (
                                <TouchableOpacity
                                    style={[styles.addMediaInlineBtn, { borderColor: teamAccent, backgroundColor: teamAccentBg }]}
                                    onPress={() => setShowAddMediaModal(true)}
                                    activeOpacity={0.85}
                                >
                                    <Ionicons name="add-circle-outline" size={15} color={teamAccent} />
                                    <Text style={[styles.addMediaInlineText, { color: teamAccent }]}>Add Post</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.mediaHighlightsRow}>
                                {canEditTeamPage && teamMedia.length === 0 && (
                                    <TouchableOpacity
                                        style={[styles.mediaCard, styles.addMediaCard, { borderColor: teamAccentSoft }]}
                                        onPress={() => setShowAddMediaModal(true)}
                                        activeOpacity={0.85}
                                    >
                                        <View style={[styles.mediaCardIconBox, { backgroundColor: teamAccentBg }]}>
                                            <Ionicons name="add" size={22} color={teamAccent} />
                                        </View>
                                        <Text style={styles.mediaCardTitle} numberOfLines={1}>Add team post</Text>
                                        <View style={styles.mediaCardMetaRow}>
                                            <Text style={styles.mediaCardMetaText} numberOfLines={1}>Share a clip, photo, or link</Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                {teamMedia.map((media) => (
                                    <TouchableOpacity
                                        key={media.id}
                                        style={[styles.mediaCard, { borderColor: teamAccentSoft }]}
                                        onPress={() => handleOpenExternal(media.url)}
                                        activeOpacity={0.85}
                                    >
                                        {media.type === 'image' && (media.thumbnailUrl || media.url) ? (
                                            <Image source={{ uri: media.thumbnailUrl || media.url }} style={styles.mediaCardImage} resizeMode="cover" />
                                        ) : (
                                            <View style={styles.mediaCardIconBox}>
                                                <Ionicons
                                                    name={media.type === 'youtube' ? 'logo-youtube' : 'link-outline'}
                                                    size={20}
                                                    color={media.type === 'youtube' ? colors.error : colors.primary}
                                                />
                                            </View>
                                        )}
                                        <Text style={styles.mediaCardTitle} numberOfLines={1}>{media.title}</Text>
                                        <View style={styles.mediaCardMetaRow}>
                                            <Text style={styles.mediaCardMetaText} numberOfLines={1}>{getHostname(media.url)}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                )}

                {!pageSettings.isPublic && !canEditTeamPage ? (
                    <View style={styles.privatePageCard}>
                        <Ionicons name="lock-closed-outline" size={26} color={colors.textSecondary} />
                        <Text style={styles.privatePageTitle}>This team page is private</Text>
                        <Text style={styles.privatePageText}>Ask a coach for access or spectator code to view the full roster and stats.</Text>
                    </View>
                ) : (
                    <>

                {/* ROSTER MANAGEMENT */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Roster ({team.players ? Object.keys(team.players).length : 0})</Text>
                    {canSeeAvailabilityStatus && (
                        <Text style={styles.rosterHintText}>Next game: ✓ in · ✕ out · ? not set (coaches only).</Text>
                    )}
                </View>

                <View style={styles.rosterShowcase}>
                    <View style={[styles.rosterShowcaseHeader, { borderBottomColor: teamAccentSoft }]}>
                        <Text style={styles.rosterShowcaseTitle}>Active Roster</Text>
                        <Text style={styles.rosterShowcaseSub}>{Object.keys(team.players || {}).length} players</Text>
                    </View>
                    {team.players && Object.values(team.players).map((p) => (
                        (() => {
                            const roleMeta = p.role ? ROLE_META[p.role] : undefined;
                            const lineMeta = LINE_META[p.primaryLine || 'flex'];
                            const positionMeta = POSITION_META[p.position || 'hybrid'];
                            const lineDisplayMeta = lineMeta || roleMeta;
                            const badgeMeta = p.badge ? BADGE_META[p.badge] : undefined;
                            const availability = nextScheduledGame?.availability?.[p.id];
                            const availabilityYes = availability === 'yes';
                            const availabilityNo = availability === 'no';

                            return (
                        <TouchableOpacity 
                            key={p.id} 
                            style={[styles.playerCard, { borderColor: teamAccentSoft }]} 
                            onPress={() => router.push(`/team/${team.id}/player/${p.id}`)}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.playerInfo, { flex: 1 }]}>
                                <View style={styles.playerNumberBox}>
                                    <Text style={styles.playerNumberText}>{p.number || '--'}</Text>
                                </View>
                                <View style={styles.playerTextBlock}>
                                    <View style={styles.playerNameRow}>
                                        <Text style={[styles.playerNameText, { color: colors.text }]} numberOfLines={1}>
                                            {formatRosterDisplayName(p.name)}
                                        </Text>
                                        {(lineDisplayMeta || positionMeta || badgeMeta) ? (
                                            <View style={styles.playerMetaInline}>
                                                {lineDisplayMeta && (
                                                    <View style={[styles.playerRolePill, { borderColor: lineDisplayMeta.color, backgroundColor: colors.surfaceSecondary }]}>
                                                        <Ionicons name={lineDisplayMeta.icon} size={9} color={lineDisplayMeta.color} />
                                                        <Text style={[styles.playerRolePillText, { color: lineDisplayMeta.color }]}>{lineDisplayMeta.label}</Text>
                                                    </View>
                                                )}
                                                {positionMeta && (
                                                    <View style={[styles.playerRolePill, { borderColor: positionMeta.color, backgroundColor: colors.surfaceSecondary }]}>
                                                        <Ionicons name={positionMeta.icon} size={9} color={positionMeta.color} />
                                                        <Text style={[styles.playerRolePillText, { color: positionMeta.color }]}>{positionMeta.label}</Text>
                                                    </View>
                                                )}
                                                {badgeMeta && (
                                                    <View style={[styles.playerBadgePill, { borderColor: badgeMeta.color, backgroundColor: colors.surfaceSecondary }]}>
                                                        <Ionicons name={badgeMeta.icon} size={10} color={badgeMeta.color} />
                                                        <Text style={[styles.playerBadgePillText, { color: badgeMeta.color }]}>{badgeMeta.label}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        ) : null}
                                    </View>
                                </View>
                            </View>
                            {canSeeAvailabilityStatus ? (
                                <View
                                    style={styles.playerAvailCoachCol}
                                    accessibilityLabel={
                                        availabilityYes ? 'Available next game' : availabilityNo ? 'Not available next game' : 'Availability not set'
                                    }
                                >
                                    <Ionicons
                                        name={availabilityYes ? 'checkmark-circle' : availabilityNo ? 'close-circle' : 'help-circle-outline'}
                                        size={22}
                                        color={
                                            availabilityYes ? colors.success : availabilityNo ? colors.error : colors.textSecondary
                                        }
                                    />
                                </View>
                            ) : null}
                            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                            );
                        })()
                    ))}
                    {canEditTeamPage && (
                        <View style={styles.rosterManageFooter}>
                            <TouchableOpacity
                                style={[styles.rosterManageBtn, { backgroundColor: teamAccent, borderColor: teamAccent }]}
                                onPress={() => router.push(`/team/${team.id}/manage` as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="people-outline" size={16} color={colors.onPrimary} />
                                <Text style={styles.rosterManageBtnText}>Manage Roster</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.rosterManageBtn, styles.rosterManageSecondaryBtn, { borderColor: teamAccent, backgroundColor: teamAccentBg }]}
                                onPress={() => router.push(`/team/${team.id}/manage` as any)}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="shield-checkmark-outline" size={16} color={teamAccent} />
                                <Text style={[styles.rosterManageBtnText, { color: teamAccent }]}>Team Permissions</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* SCHEDULED GAMES */}
                {
                    <View style={{ marginTop: 12 }}>
                        <View style={[styles.sectionHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}> 
                            <Text style={styles.sectionTitle}>Scheduled Games</Text>
                            {canEditTeamPage ? (
                                <TouchableOpacity style={[styles.scheduleBtn, { backgroundColor: teamAccent }]} onPress={openScheduleModal} activeOpacity={0.85}>
                                    <Ionicons name="calendar" size={16} color={colors.onPrimary} />
                                    <Text style={styles.scheduleBtnText}>Schedule</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        {scheduledGames.length === 0 ? (
                            <View style={styles.emptyStateCardTeam}>
                                <Ionicons name="calendar-clear-outline" size={28} color={colors.textSecondary} />
                                <Text style={styles.emptyStateTextTeam}>No scheduled games yet.</Text>
                            </View>
                        ) : (
                            scheduledGames.map((game) => {
                                const hasDateTime = typeof game.scheduledAt === 'number';
                                const dateObj = hasDateTime ? new Date(game.scheduledAt as number) : null;
                                const yesNames = Object.entries(game.availability || {})
                                    .filter(([, status]) => status === 'yes')
                                    .map(([playerId]) => team.players?.[playerId]?.name?.split(' ')[0] || 'Unknown');
                                const noNames = Object.entries(game.availability || {})
                                    .filter(([, status]) => status === 'no')
                                    .map(([playerId]) => team.players?.[playerId]?.name?.split(' ')[0] || 'Unknown');

                                return (
                                    <TouchableOpacity
                                        key={game.id}
                                        style={[styles.scheduledCard, { borderColor: teamAccentSoft, borderLeftWidth: 3, borderLeftColor: teamAccent }]}
                                        activeOpacity={0.88}
                                        onPress={() => router.push({
                                            pathname: '/game/scheduled/[teamId]/[gameId]',
                                            params: {
                                                teamId: team.id,
                                                gameId: game.id,
                                            },
                                        } as any)}
                                    >
                                        <Text style={styles.scheduledTitle}>{team.name} vs {game.opponentName}</Text>
                                        <Text style={styles.scheduledMeta}>
                                            {dateObj
                                                ? `${dateObj.toLocaleDateString()} • ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                                : 'Date/Time TBD'}
                                        </Text>
                                        <Text style={styles.scheduledMeta}>Available: {yesNames.length ? yesNames.join(', ') : 'TBD'}</Text>
                                        <Text style={styles.scheduledMeta}>Out: {noNames.length ? noNames.join(', ') : 'None listed'}</Text>

                                        <View style={styles.scheduledActionsRow}>
                                            <TouchableOpacity
                                                style={[styles.scheduledActionBtn, { borderColor: teamAccent, backgroundColor: teamAccentBg }]}
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    router.push({
                                                        pathname: '/game/record/[teamId]',
                                                        params: {
                                                            teamId: team.id,
                                                            scheduledGameId: game.id,
                                                            prefOpponentName: game.opponentName,
                                                            prefLocation: game.location || '',
                                                        }
                                                    } as any);
                                                }}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="play" size={14} color={teamAccent} />
                                                <Text style={[styles.scheduledActionText, { color: teamAccent }]}>Start</Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.scheduledActionBtn, { borderColor: teamAccent, backgroundColor: teamAccentBg }, !hasDateTime && styles.scheduledActionBtnDisabled]}
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenCalendar(game);
                                                }}
                                                disabled={!hasDateTime}
                                                activeOpacity={0.8}
                                            >
                                                <Ionicons name="calendar-outline" size={14} color={hasDateTime ? teamAccent : colors.textSecondary} />
                                                <Text style={[styles.scheduledActionText, { color: teamAccent }, !hasDateTime && styles.scheduledActionTextDisabled]}>Add to Calendar</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>
                }

                {/* PENDING OBSERVER-NEUTRAL MATCHES */}
                {pendingObserverNeutralGames.length > 0 && preview !== 'public' && (
                    <View style={{ marginTop: 26 }}>
                        <View style={[styles.pendingObserverHeader, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Text style={[styles.pendingObserverTitle, { color: colors.text }]}>Observer-recorded match</Text>
                            <Text style={[styles.pendingObserverSubtitle, { color: colors.textSecondary }]}>
                                A scorer used both fan codes without coach access. Add to your timeline and stats — or decline to keep this private.
                            </Text>
                        </View>
                        {pendingObserverNeutralGames.map((entry) => (
                            <View
                                key={`pending-obs-${entry.gameId}`}
                                style={[styles.pendingObserverCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                            >
                                <Text style={[styles.pendingObserverCardTitle, { color: colors.text }]}>
                                    Match ready for review
                                </Text>
                                <Text style={[styles.pendingObserverSubtitle, { color: colors.textSecondary }]}>
                                    Recorded neutrally with both fan codes. Review the recap, then accept to include stats or decline.
                                </Text>
                                <View style={styles.pendingObserverActions}>
                                    <TouchableOpacity
                                        style={[styles.pendingObserverGhostBtn, { borderColor: colors.border }]}
                                        onPress={() => router.push(`/game/history/${entry.gameId}` as any)}
                                        activeOpacity={0.82}
                                    >
                                        <Text style={[styles.pendingObserverGhostBtnText, { color: colors.primary }]}>Review</Text>
                                    </TouchableOpacity>
                                    {canEditTeamPage && (
                                        <>
                                            <TouchableOpacity
                                                style={[styles.pendingObserverPrimaryBtn, { backgroundColor: colors.success }]}
                                                onPress={() => handleAcceptObserverNeutralGame(entry.gameId)}
                                                activeOpacity={0.88}
                                            >
                                                <Text style={[styles.pendingObserverPrimaryBtnText, { color: '#fff' }]}>Accept</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.pendingObserverDangerBtn, { borderColor: colors.error }]}
                                                onPress={() => handleDeclineObserverNeutralGame(entry.gameId)}
                                                activeOpacity={0.85}
                                            >
                                                <Text style={[styles.pendingObserverDangerBtnText, { color: colors.error }]}>Decline</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </View>
                        ))}
                        {!canEditTeamPage && currentUserId && (
                            <Text style={[styles.pendingObserverFanNote, { color: colors.textSecondary }]}>
                                Only coaches/managers can accept or decline. Ask your coach to decide.
                            </Text>
                        )}
                    </View>
                )}

                {/* PAST GAMES & ANALYTICS */}
                {finishedPastGames.length > 0 && (
                    <View style={{ marginTop: 24 }}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Match History & Stats</Text>
                        </View>
                        
                        {/* YEAR FILTER */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                                {availableYears.map(year => (
                                    <TouchableOpacity 
                                        key={year} 
                                        style={[
                                            styles.filterChip,
                                            selectedYear === year && styles.filterChipActive,
                                            selectedYear === year && { backgroundColor: teamAccent, borderColor: teamAccent },
                                        ]}
                                        onPress={() => setSelectedYear(year)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[styles.filterChipText, selectedYear === year && styles.filterChipTextActive]}>{year}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>
                        
                        {/* QUICK STATS TAPE */}
                        <View style={[styles.statsTape, { borderColor: teamAccentSoft }]}>
                            <View style={styles.statsTapeCell}>
                                <Text style={styles.statsTapeLabel}>Win rate</Text>
                                <Text style={styles.statsTapeValue}>{totalGames > 0 ? `${winrate}%` : '—'}</Text>
                            </View>
                            <View style={[styles.statsTapeCell, { backgroundColor: teamAccentBg }]}>
                                <Text style={[styles.statsTapeLabel, { color: teamAccent }]}>Points For/Game</Text>
                                <Text style={[styles.statsTapeValue, { color: teamAccent }]}>{pointsForAvg}</Text>
                            </View>
                            <View style={styles.statsTapeCell}>
                                <Text style={styles.statsTapeLabel}>Points Against/Game</Text>
                                <Text style={styles.statsTapeValue}>{pointsAgainstAvg}</Text>
                            </View>
                        </View>

                        <View style={[styles.efficiencyCard, { backgroundColor: teamAccent, borderColor: teamAccent }]}>
                            <Text style={styles.efficiencyKicker}>Team Rating</Text>
                            <Text style={styles.efficiencyExplainer}>
                                Win rate and average scoring margin combined into one local index for this filter.
                            </Text>
                            <View style={styles.efficiencyScoreRow}>
                                <Text style={styles.efficiencyScore}>{totalGames > 0 ? spiScore : '—'}</Text>
                                <Text style={styles.efficiencyDelta}>
                                    {totalGames > 0
                                        ? `${winrate}% wins · ${avgPointDiff >= 0 ? '+' : ''}${avgPointDiff.toFixed(1)} avg margin`
                                        : formSummary}
                                </Text>
                            </View>
                            <View style={[styles.efficiencyMetaRow, { flexWrap: 'wrap', gap: 20 }]}>
                                <View>
                                    <Text style={styles.efficiencyMetaLabel}>Record</Text>
                                    <Text style={styles.efficiencyMetaValue}>{wins}-{losses}-{ties}</Text>
                                </View>
                                <View>
                                    <Text style={styles.efficiencyMetaLabel}>Last 5</Text>
                                    <Text style={styles.efficiencyMetaValue}>
                                        {lastFiveRecord.wins}-{lastFiveRecord.losses}-{lastFiveRecord.ties}
                                    </Text>
                                </View>
                                <View>
                                    <Text style={styles.efficiencyMetaLabel}>Win streak</Text>
                                    <Text style={styles.efficiencyMetaValue}>
                                        {currentWinStreak > 0 ? `W${currentWinStreak}` : '—'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {canSeeAdvancedStats && topChemistryPair && (
                            <View style={[styles.statCard, { marginBottom: 16, alignItems: 'flex-start', borderColor: teamAccentSoft }]}> 
                                <Text style={[styles.statLabel, { marginBottom: 4 }]}>Top Chemistry Pair</Text>
                                <Text style={{ ...getTypography(colors).body, fontWeight: '700', color: teamAccent }}>
                                    {topChemistryPair.thrower} to {topChemistryPair.receiver}
                                </Text>
                                <Text style={styles.statLabel}>
                                    {topChemistryPair.completions}/{topChemistryPair.attempts} completed ({Math.round((topChemistryPair.completions / topChemistryPair.attempts) * 100)}%)
                                </Text>
                            </View>
                        )}

                        {canSeeAdvancedStats && topThrowProfiles.length > 0 && (
                            <View style={[styles.statCard, { marginBottom: 16, alignItems: 'flex-start', borderColor: teamAccentSoft }]}> 
                                <Text style={[styles.statLabel, { marginBottom: 4 }]}>Throw Profile + EPV Snapshot</Text>
                                <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 6 }}>
                                    Avg EPV delta: <Text style={{ color: epvAverage >= 0 ? colors.success : colors.error, fontWeight: '700' }}>{epvAverage.toFixed(2)}</Text>
                                    {'   '}Positive EPV: <Text style={{ fontWeight: '700' }}>{epvPositiveRate}%</Text>
                                </Text>
                                {topThrowProfiles.map((row) => (
                                    <Text key={row.name} style={{ ...getTypography(colors).bodySmall, marginBottom: 3 }}>
                                        {row.name}: {row.completionPct}% on {row.attempts} attempts (avg {row.avgDistance})
                                    </Text>
                                ))}
                            </View>
                        )}

                        {filteredGames.length === 0 ? (
                            <Text style={{ ...getTypography(colors).bodySmall, textAlign: 'center', marginTop: 12 }}>No matches recorded for {selectedYear}.</Text>
                        ) : (
                            <View style={styles.recentFormCard}>
                                <View style={styles.recentFormHeader}>
                                    <Text style={styles.recentFormTitle}>Previous Games</Text>
                                </View>
                                {filteredGames.map((game) => {
                                const isTeam1 = game.team1Id === team.id;
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
                                    key={game.gameId} 
                                    style={[styles.historyCard, { backgroundColor: bgColor }]}
                                    onPress={() => router.push(`/game/history/${game.gameId}` as any)}
                                    activeOpacity={0.8}
                                >
                                    <View style={styles.historyMatchInfo}>
                                        <Text style={[styles.historyOpponent, { color: textColor }]} numberOfLines={1}>vs {opponentName}</Text>
                                        <Text style={[styles.historyDate, { color: subTextColor }]}>{dateText}</Text>
                                    </View>
                                    <View style={[styles.historyResultPill, { backgroundColor: scoreBoxBg }]}>
                                        <Text style={[styles.historyResultText, { color: textColor }]}>{isWin ? 'W' : isLoss ? 'L' : 'T'}</Text>
                                    </View>
                                    <View style={[styles.historyScoreBox, { backgroundColor: scoreBoxBg }]}>
                                        <Text style={[styles.historyScoreText, { color: textColor }]}>
                                            {ourScore} - {theirScore}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                                })}
                            </View>
                        )}
                    </View>
                )}

                {isCoach && (
                    <TouchableOpacity style={styles.deleteTeamBtn} onPress={handleDeleteTeam}>
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                        <Text style={styles.deleteTeamBtnText}>Delete Team</Text>
                    </TouchableOpacity>
                )}
                    </>
                )}
            </ScrollView>

            {/* TEAM PERMISSIONS MODAL */}
            <Modal visible={showPermissionsModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitle, { marginBottom: 4 }]}>Team Permissions</Text>
                                <Text style={styles.modalSub}>Manage who has Manager/Coach access to edit rosters and start games.</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowPermissionsModal(false)} style={{ padding: 4 }}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.permissionsList}>
                            {team.managers && Object.entries(team.managers).map(([uid, r]) => (
                                <View key={uid} style={styles.permissionRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.permissionEmail}>{r.email}</Text>
                                        <TouchableOpacity onPress={() => handleRoleChange(uid, r.role)} disabled={r.role === 'Head Coach'}>
                                            <Text style={styles.permissionRole}>
                                                {r.role} {r.role !== 'Head Coach' && <Ionicons name="create-outline" size={14} />}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    {r.role !== 'Head Coach' && (
                                        <TouchableOpacity onPress={() => handleRemoveManager(uid)}>
                                            <Ionicons name="trash-outline" size={20} color={colors.error} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </View>

                        <View style={styles.addPermissionBox}>
                            <Text style={styles.inputLabel}>ADD TEAM MANAGER</Text>
                            <Text style={{ ...getTypography(colors).bodySmall, color: colors.textSecondary, marginBottom: 12 }}>
                                To allow another user to record games and manage the roster, have them download the app and enter the Coach Code (found in Team Settings) on the Teams Hub.
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>

            <Modal visible={showScheduleModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                            <Text style={styles.modalTitle}>Schedule Future Game</Text>
                            <TouchableOpacity onPress={() => setShowScheduleModal(false)}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>

                        <Text style={styles.inputLabel}>Opponent Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Rival University"
                            placeholderTextColor={colors.textSecondary}
                            value={scheduleOpponentName}
                            onChangeText={setScheduleOpponentName}
                        />

                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <TouchableOpacity style={styles.dateTimePickerBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8}>
                                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                                <Text style={styles.dateTimeText}>{scheduleDate ? scheduleDate.toLocaleDateString() : 'Date'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.dateTimePickerBtn} onPress={() => setShowTimePicker(true)} activeOpacity={0.8}>
                                <Ionicons name="time-outline" size={18} color={colors.primary} />
                                <Text style={styles.dateTimeText}>{scheduleTime ? scheduleTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time'}</Text>
                            </TouchableOpacity>
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

                        <Text style={[styles.inputLabel, { marginTop: 12 }]}>Location (Optional)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Main Turf"
                            placeholderTextColor={colors.textSecondary}
                            value={scheduleLocation}
                            onChangeText={setScheduleLocation}
                        />

                        <Text style={[styles.inputLabel, { marginTop: 4 }]}>Player Availability</Text>
                        {team.players && Object.values(team.players).length > 0 ? (
                            Object.values(team.players).map((player) => {
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
                            <Text style={styles.emptyStateTextTeam}>Add players to enable availability tracking.</Text>
                        )}

                        {!!scheduleFormError && (
                            <View style={styles.formErrorBox}>
                                <Ionicons name="warning-outline" size={16} color={colors.error} />
                                <Text style={styles.formErrorText}>{scheduleFormError}</Text>
                            </View>
                        )}

                        <Text style={styles.scheduleHintText}>Date and time are optional. Leave both blank for Date/Time TBD.</Text>

                        </ScrollView>

                        <TouchableOpacity
                            style={[styles.addPermissionBtn, { opacity: isSavingSchedule ? 0.8 : 1 }]}
                            onPress={handleCreateScheduledGame}
                            activeOpacity={0.85}
                            disabled={isSavingSchedule}
                        >
                            <Text style={styles.addPermissionBtnText}>{isSavingSchedule ? 'Saving...' : 'Save Scheduled Game'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={showAddMediaModal} animationType="fade" transparent={true} onRequestClose={() => setShowAddMediaModal(false)}>
                <View style={styles.addMediaModalRoot}>
                    <TouchableOpacity style={styles.addMediaModalBackdrop} activeOpacity={1} onPress={() => setShowAddMediaModal(false)} />
                    <View style={styles.addMediaModalSheetAnchor} pointerEvents="box-none">
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                            style={styles.addMediaModalKav}
                            keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
                        >
                            <View style={styles.modalContent}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <Text style={styles.modalTitle}>Add Post</Text>
                                    <TouchableOpacity onPress={() => setShowAddMediaModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                                        <Ionicons name="close" size={24} color={colors.textSecondary} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
                                    <Text style={styles.inputLabel}>Title</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g. Highlights vs Knights"
                                        placeholderTextColor={colors.textSecondary}
                                        value={mediaTitleInput}
                                        onChangeText={setMediaTitleInput}
                                        autoCapitalize="sentences"
                                    />

                                    <Text style={[styles.inputLabel, { marginTop: 12 }]}>Link</Text>
                                    <TextInput
                                        style={[styles.input, { marginBottom: 0 }]}
                                        placeholder="YouTube, image URL, or any https link"
                                        placeholderTextColor={colors.textSecondary}
                                        value={mediaUrlInput}
                                        onChangeText={setMediaUrlInput}
                                        autoCapitalize="none"
                                        keyboardType="url"
                                    />
                                </ScrollView>

                                <TouchableOpacity
                                    style={[styles.addPermissionBtn, { opacity: isSavingMedia ? 0.75 : 1, marginTop: 20 }]}
                                    onPress={handleSaveTeamMedia}
                                    disabled={isSavingMedia}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.addPermissionBtnText}>{isSavingMedia ? 'Saving...' : 'Publish'}</Text>
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </View>
            </Modal>

            {showCopiedToast && (
                <View pointerEvents="none" style={{ position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: '#16A34A', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 999 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Copied to clipboard!</Text>
                </View>
            )}

        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        loadingText: { ...Typography.body, color: colors.textSecondary },
        
        topAppBar: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.padding, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
        backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
        topAppBarTitle: { ...Typography.title, fontSize: 18, flex: 1, textAlign: 'center' },
        topEditBtn: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
        },
        previewModePill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'center',
            marginTop: 10,
            marginBottom: -10,
            backgroundColor: colors.primaryLight,
            borderRadius: Layout.radiusFull,
            borderWidth: 1,
            borderColor: colors.primary,
            paddingHorizontal: 10,
            paddingVertical: 4,
            zIndex: 3,
        },
        previewModeText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },

        mainContent: { flex: 1 },
        mainContentContainer: { paddingHorizontal: Layout.padding, paddingTop: 24, paddingBottom: 60 },
        
        infoCard: { alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderRadius: Layout.radiusLg, marginBottom: 24, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        teamBannerWrap: {
            width: '100%',
            aspectRatio: 16 / 6,
            borderRadius: Layout.radiusMd,
            overflow: 'hidden',
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border,
        },
        teamBannerImage: { width: '100%', height: '100%' },
        teamBannerPlaceholder: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryLight,
        },
        teamBannerPlaceholderText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700', letterSpacing: 1 },
        teamAvatarOverlay: {
            marginTop: -48,
            marginBottom: 2,
            width: 96,
            height: 96,
            borderWidth: 3,
            borderColor: colors.surface,
            borderRadius: 48,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
        },
        teamAvatarImage: {
            width: '100%',
            height: '100%',
            backgroundColor: colors.surfaceSecondary,
        },
        teamBadgeLg: { width: '100%', height: '100%', borderRadius: 48, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
        teamBadgeTextLg: { ...Typography.title, fontSize: 32, color: colors.primary },
        teamNameTitle: { ...Typography.title, fontSize: 24, marginBottom: 10, textAlign: 'center' },
        teamBioText: { ...Typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: 10 },
        pageVisibilityPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.primaryLight,
            borderWidth: 1,
            borderColor: colors.primary,
            borderRadius: Layout.radiusFull,
            paddingHorizontal: 10,
            paddingVertical: 5,
            marginBottom: 8,
        },
        pageVisibilityText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        announcementCard: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            borderWidth: 1,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 10,
            paddingVertical: 9,
            marginBottom: 10,
            backgroundColor: colors.surfaceSecondary,
        },
        announcementLabel: { ...Typography.label, marginBottom: 2 },
        announcementText: { ...Typography.bodySmall, color: colors.textSecondary },
        coachRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
        coachText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
        socialIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 10 },
        socialIconBtn: {
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.primaryLight,
        },
        xMarkText: { ...Typography.bodySmall, fontWeight: '800' },
        
        codeContainerRow: { flexDirection: 'row', gap: 16, width: '100%', justifyContent: 'center' },
        codeBadge: { backgroundColor: colors.surfaceSecondary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: Layout.radiusMd, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
        codeBadgeLabel: { ...Typography.label, marginBottom: 4 },
        codeBadgeCode: { ...Typography.title, fontSize: 20, color: colors.text, letterSpacing: 2 },

        actionRow: { flexDirection: 'row', marginBottom: 32, alignItems: 'stretch', gap: 0 },
        primaryActionBtn: { backgroundColor: colors.primary, paddingVertical: 20, paddingHorizontal: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
        primaryActionBtnText: { ...Typography.button, color: colors.onPrimary },
        liveActionBtn: { backgroundColor: colors.error, paddingVertical: 20, paddingHorizontal: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
        secondaryMediaBtn: {
            width: 112,
            paddingVertical: 14,
            paddingHorizontal: 10,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
        },
        secondaryMediaBtnText: { ...Typography.label, fontSize: 11, fontWeight: '900', textAlign: 'center', lineHeight: 14 },

        addMediaInlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: Layout.radiusSm, paddingHorizontal: 9, paddingVertical: 5 },
        addMediaInlineText: { ...Typography.label, fontSize: 10 },
        mediaHighlightsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 2 },
        mediaCard: {
            width: 150,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusMd,
            overflow: 'hidden',
            ...Layout.shadow,
        },
        addMediaCard: { borderStyle: 'dashed' },
        mediaCardImage: { width: '100%', height: 90, backgroundColor: colors.surfaceSecondary },
        mediaCardIconBox: {
            width: '100%',
            height: 90,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceSecondary,
        },
        mediaCardTitle: { ...Typography.bodySmall, color: colors.text, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 7 },
        mediaCardMetaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            paddingHorizontal: 8,
            paddingBottom: 8,
        },
        mediaCardMetaText: { ...Typography.label, color: colors.textSecondary, flex: 1 },
        privatePageCard: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusLg,
            alignItems: 'center',
            paddingVertical: 22,
            paddingHorizontal: 16,
            marginBottom: 24,
            ...Layout.shadow,
        },
        privatePageTitle: { ...Typography.subtitle, marginTop: 8, marginBottom: 4, fontWeight: '700' },
        privatePageText: { ...Typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },

        sectionHeader: { marginBottom: 16 },
        teamMediaSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
        sectionTitle: { ...Typography.subtitle, fontWeight: '600', color: colors.text },
        rosterHintText: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 4 },

        addPlayerContainer: { backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, marginBottom: 24, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        claimRosterHint: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            padding: 10,
            borderRadius: Layout.radiusSm,
            backgroundColor: colors.surfaceSecondary,
            marginBottom: 14,
        },
        claimRosterHintText: { ...Typography.bodySmall, color: colors.textSecondary, flex: 1, lineHeight: 18 },
        inputRow: { flexDirection: 'row', marginBottom: 16 },
        input: { ...Typography.body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: Layout.radiusMd, color: colors.text },
        inputNum: { ...Typography.body, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: Layout.radiusMd, color: colors.text, textAlign: 'center' },
        addPlayerBtn: { flexDirection: 'row', backgroundColor: 'transparent', padding: 12, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary },
        addPlayerBtnText: { ...Typography.button, color: colors.primary, marginLeft: 8 },
        pasteRosterBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 12, borderRadius: Layout.radiusMd, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
        pasteRosterText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '700' },

        rosterShowcase: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusLg, marginBottom: 18, overflow: 'hidden', ...Layout.shadow },
        rosterShowcaseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
        rosterShowcaseTitle: { ...Typography.label, color: colors.text, letterSpacing: 1.2 },
        rosterShowcaseSub: { ...Typography.caption, color: colors.textSecondary, fontWeight: '700' },
        rosterList: { marginBottom: 18 },
        playerCard: { flexDirection: 'row', backgroundColor: colors.surface, paddingVertical: 11, paddingLeft: 4, paddingRight: 8, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border },
        playerInfo: { flexDirection: 'row', alignItems: 'center' },
        playerNumberBox: { width: 36, alignItems: 'flex-end', justifyContent: 'center', marginRight: 6 },
        playerNumberText: { ...Typography.body, fontSize: 22, fontWeight: '900', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
        playerNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: 0 },
        playerTextBlock: { flex: 1, flexDirection: 'column', justifyContent: 'center' },
        playerAvailCoachCol: { width: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
        playerNameText: { ...Typography.body, fontSize: 22, lineHeight: 26, flexShrink: 1, fontWeight: '900', letterSpacing: 0.1 },
        playerMetaInline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, flexShrink: 1 },
        playerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
        playerAvailabilityPill: { width: 21, height: 21, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
        playerRolePill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            borderWidth: 1,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 6,
            paddingVertical: 1,
        },
        playerRolePillText: { ...Typography.label, fontSize: 10, lineHeight: 11 },
        playerBadgePill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            borderWidth: 1,
            borderRadius: Layout.radiusSm,
            paddingHorizontal: 7,
            paddingVertical: 3,
        },
        playerBadgePillText: { ...Typography.label, fontSize: 10, lineHeight: 13 },
        playerClaimRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
        playerClaimText: { ...Typography.bodySmall, color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
        playerDelBtn: { padding: 6, marginLeft: 4 },
        rosterManageFooter: { flexDirection: 'row', gap: 10, padding: 10, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.border },
        rosterManageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: Layout.radiusMd, paddingVertical: 11, paddingHorizontal: 8 },
        rosterManageSecondaryBtn: { backgroundColor: colors.surface },
        rosterManageBtnText: { ...Typography.button, color: colors.onPrimary, fontSize: 12 },

        recentFormCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        recentFormHeader: { backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
        recentFormTitle: { ...Typography.label, color: colors.text, letterSpacing: 1.2 },
        historyCard: { flexDirection: 'row', backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.18)' },
        historyMatchInfo: { flex: 1, paddingRight: 10 },
        historyOpponent: { ...Typography.bodySmall, color: colors.text, fontWeight: '700', marginBottom: 3 },
        historyDate: { ...Typography.caption },
        historyResultPill: { width: 30, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: Layout.radiusSm, marginRight: 8 },
        historyResultText: { ...Typography.label, fontWeight: '900' },
        historyScoreBox: { backgroundColor: colors.surfaceSecondary, paddingVertical: 5, paddingHorizontal: 10, borderRadius: Layout.radiusSm },
        historyScoreText: { ...Typography.title, fontSize: 16 },

        deleteTeamBtn: { flexDirection: 'row', backgroundColor: colors.errorBg, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 32 },
        deleteTeamBtnText: { ...Typography.button, color: colors.error, marginLeft: 8 },

        filterChip: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 14, paddingVertical: 4, borderRadius: Layout.radiusFull, borderWidth: 1, borderColor: colors.border },
        filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
        filterChipText: { ...Typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
        filterChipTextActive: { color: colors.onPrimary },

        quickStatCard: { flex: 1, backgroundColor: colors.surface, paddingVertical: 12, paddingHorizontal: 12, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', ...Layout.shadow },
        statsTape: { flexDirection: 'row', overflow: 'hidden', backgroundColor: colors.surface, borderRadius: Layout.radiusMd, borderWidth: 1, marginBottom: 12, ...Layout.shadow },
        statsTapeCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.border },
        statsTapeLabel: { ...Typography.label, fontSize: 8, textAlign: 'center' },
        statsTapeValue: { ...Typography.title, fontSize: 17, marginTop: 3 },
        efficiencyCard: { borderWidth: 1, borderRadius: Layout.radiusLg, padding: 16, marginBottom: 12, overflow: 'hidden', ...Layout.shadow },
        efficiencyKicker: { ...Typography.label, color: 'rgba(255,255,255,0.78)', marginBottom: 4 },
        efficiencyExplainer: {
            ...Typography.caption,
            color: 'rgba(255,255,255,0.82)',
            marginBottom: 10,
            lineHeight: 16,
            fontSize: 11,
        },
        efficiencyScoreRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
        efficiencyScore: { fontSize: 48, lineHeight: 52, fontWeight: '900', color: '#fff', letterSpacing: -2 },
        efficiencyDelta: { ...Typography.bodySmall, color: 'rgba(255,255,255,0.86)', fontWeight: '900' },
        efficiencyMetaRow: { flexDirection: 'row', gap: 28, marginTop: 12 },
        efficiencyMetaLabel: { ...Typography.label, color: 'rgba(255,255,255,0.72)', fontSize: 9 },
        efficiencyMetaValue: { ...Typography.bodySmall, color: '#fff', fontWeight: '900', marginTop: 2 },
        metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
        metricBox: { flexGrow: 1, flexBasis: '22%', minWidth: 72, backgroundColor: colors.surface, borderWidth: 1, borderRadius: Layout.radiusMd, padding: 10, ...Layout.shadow },
        metricBoxLabel: { ...Typography.label, fontSize: 9 },
        metricBoxValue: { ...Typography.title, fontSize: 20, marginTop: 8, lineHeight: 22 },
        metricBoxRank: { ...Typography.label, color: colors.textSecondary, fontSize: 8, marginTop: 4 },
        statCard: { backgroundColor: colors.surface, paddingVertical: 16, paddingHorizontal: 14, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start', justifyContent: 'center', ...Layout.shadow },
        statValue: { ...Typography.title, fontSize: 32, marginBottom: 4 },
        statLabel: { ...Typography.bodySmall, textAlign: 'left', fontSize: 11, lineHeight: 17 },
        winStreakInlineText: { ...Typography.bodySmall, color: colors.success, fontWeight: '700', marginTop: 2 },

        scheduleBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusSm,
            paddingVertical: 8,
            paddingHorizontal: 12,
        },
        scheduleBtnText: { ...Typography.button, color: colors.onPrimary, fontSize: 12 },
        emptyStateCardTeam: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: 'dashed',
            borderRadius: Layout.radiusMd,
            paddingVertical: 18,
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
        },
        emptyStateTextTeam: { ...Typography.bodySmall, color: colors.textSecondary },
        scheduledCard: {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.primary,
            borderRadius: Layout.radiusMd,
            padding: 14,
            marginBottom: 10,
            ...Layout.shadow,
        },
        scheduledTitle: { ...Typography.body, fontWeight: '700', marginBottom: 4 },
        scheduledMeta: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
        scheduledActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
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
            paddingHorizontal: 10,
        },
        scheduledActionBtnDisabled: {
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
        },
        scheduledActionText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        scheduledActionTextDisabled: { color: colors.textSecondary },

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
        availabilityControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
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

        permissionsBtn: { flexDirection: 'row', backgroundColor: colors.surface, padding: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 12, ...Layout.shadow },
        permissionsBtnText: { ...Typography.button, color: colors.primary, marginLeft: 8 },

        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
        addMediaModalRoot: { flex: 1 },
        addMediaModalBackdrop: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
        },
        addMediaModalSheetAnchor: {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            justifyContent: 'flex-end',
            pointerEvents: 'box-none' as const,
        },
        addMediaModalKav: { width: '100%' },
        modalContent: { backgroundColor: colors.background, borderTopLeftRadius: Layout.radiusLg, borderTopRightRadius: Layout.radiusLg, padding: Layout.padding, paddingTop: 32, paddingBottom: Platform.OS === 'ios' ? 40 : 24, ...Layout.shadow },
        modalTitle: { ...Typography.title, fontSize: 20 },
        modalSub: { ...Typography.bodySmall },
        dateTimePickerBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surfaceSecondary,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 12,
            marginBottom: 4,
        },
        dateTimeText: { ...Typography.bodySmall, color: colors.text },
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
        scheduleHintText: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 2, marginBottom: 8 },
        
        permissionsList: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, paddingHorizontal: 16, marginBottom: 24, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        permissionRow: { flexDirection: 'row', paddingVertical: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
        permissionEmail: { ...Typography.body, fontWeight: '600' },
        permissionRole: { ...Typography.bodySmall, color: colors.primary, marginTop: 2 },
        
        addPermissionBox: { backgroundColor: colors.surface, padding: 20, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
        inputLabel: { ...Typography.label, marginBottom: 8 },
        addPermissionBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 14, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
        addPermissionBtnText: { ...Typography.button, color: colors.onPrimary },

        pendingObserverHeader: {
            borderWidth: 1,
            borderRadius: Layout.radiusLg,
            padding: 14,
            marginBottom: 10,
            ...Layout.shadow,
        },
        pendingObserverTitle: { ...Typography.body, fontWeight: '900', marginBottom: 6 },
        pendingObserverSubtitle: { ...Typography.bodySmall, lineHeight: 18 },
        pendingObserverCard: {
            borderWidth: 1,
            borderRadius: Layout.radiusLg,
            padding: 14,
            marginBottom: 12,
            ...Layout.shadow,
        },
        pendingObserverCardTitle: { ...Typography.body, fontWeight: '800', marginBottom: 4 },
        pendingObserverActions: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 12,
        },
        pendingObserverGhostBtn: {
            borderWidth: 1,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surfaceSecondary,
        },
        pendingObserverGhostBtnText: { ...Typography.button, fontWeight: '800', fontSize: 13 },
        pendingObserverPrimaryBtn: {
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: Layout.radiusMd,
            minWidth: 88,
            alignItems: 'center',
        },
        pendingObserverPrimaryBtnText: { ...Typography.button, fontWeight: '800', fontSize: 13 },
        pendingObserverDangerBtn: {
            borderWidth: 1,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: Layout.radiusMd,
            backgroundColor: colors.surfaceSecondary,
        },
        pendingObserverDangerBtnText: { ...Typography.button, fontWeight: '800', fontSize: 13 },
        pendingObserverFanNote: { ...Typography.bodySmall, marginTop: 10, paddingHorizontal: 4 },
    });
}
