import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../../../firebaseConfig';
import { GameService } from '../../../services/GameService';
import { TeamService } from '../../../services/TeamService';
import { GameState, PlayerPosition, PlayerPrimaryLine, PlayerRole, ScheduledGame, Team } from '../../../services/types';
import { getTypography, Layout } from '../../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../../theme/ThemeContext';

const isValidCoord = (coord: any) => typeof coord?.x === 'number' && typeof coord?.y === 'number' && coord.x >= 0 && coord.y >= 0;

const sanitizeJerseyInput = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 4);

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

const PLAYER_BADGE_OPTIONS = [
    { key: 'captain', label: 'Captain', color: '#F59E0B', icon: 'ribbon-outline' as const },
    { key: 'handler', label: 'Handler', color: '#2563EB', icon: 'flash-outline' as const },
    { key: 'cutter', label: 'Cutter', color: '#16A34A', icon: 'play-forward-outline' as const },
    { key: 'defender', label: 'Defender', color: '#DC2626', icon: 'shield-outline' as const },
    { key: 'playmaker', label: 'Playmaker', color: '#7C3AED', icon: 'sparkles-outline' as const },
    { key: 'rookie', label: 'Rookie', color: '#0EA5E9', icon: 'school-outline' as const },
    { key: 'mvp', label: 'MVP', color: '#EA580C', icon: 'trophy-outline' as const },
    { key: 'iron', label: 'Iron', color: '#475569', icon: 'fitness-outline' as const },
];

const PLAYER_ROLE_OPTIONS: { key: PlayerRole; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'handler', label: 'Handler', color: '#2563EB', icon: 'flash-outline' },
    { key: 'cutter', label: 'Cutter', color: '#16A34A', icon: 'play-forward-outline' },
    { key: 'hybrid', label: 'Hybrid', color: '#7C3AED', icon: 'shuffle-outline' },
    { key: 'o_handler', label: 'O-Handler', color: '#1D4ED8', icon: 'arrow-forward-outline' },
    { key: 'o_cutter', label: 'O-Cutter', color: '#059669', icon: 'arrow-up-outline' },
    { key: 'd_handler', label: 'D-Handler', color: '#DC2626', icon: 'shield-outline' },
    { key: 'd_cutter', label: 'D-Cutter', color: '#B91C1C', icon: 'shield-half-outline' },
];

const PLAYER_LINE_OPTIONS: { key: PlayerPrimaryLine; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'O', label: 'O-Line', color: '#2563EB', icon: 'arrow-up-circle-outline' },
    { key: 'D', label: 'D-Line', color: '#DC2626', icon: 'shield-checkmark-outline' },
    { key: 'flex', label: 'Flex', color: '#7C3AED', icon: 'shuffle-outline' },
];

const PLAYER_POSITION_OPTIONS: { key: PlayerPosition; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'handler', label: 'Handler', color: '#2563EB', icon: 'flash-outline' },
    { key: 'cutter', label: 'Cutter', color: '#16A34A', icon: 'play-forward-outline' },
    { key: 'hybrid', label: 'Hybrid', color: '#7C3AED', icon: 'git-branch-outline' },
];

export default function PlayerProfileScreen() {
    const { isDark, colors } = useTheme();
    const styles = getStyles(colors);
    const { teamId, playerId } = useLocalSearchParams<{ teamId: string, playerId: string }>();
    const [team, setTeam] = useState<Team | null>(null);
    const [allGames, setAllGames] = useState<GameState[]>([]);
    const [scheduledGames, setScheduledGames] = useState<ScheduledGame[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>('All Time');
    const [claimModalOpen, setClaimModalOpen] = useState(false);
    const [claimCodeInput, setClaimCodeInput] = useState('');
    const [generatedClaimCode, setGeneratedClaimCode] = useState('');
    const [isClaimWorking, setIsClaimWorking] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [numberDraft, setNumberDraft] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);
    const [nameModalOpen, setNameModalOpen] = useState(false);

    useEffect(() => {
        if (!teamId || !playerId) return;

        const unsubscribe = TeamService.subscribeToTeam(teamId, (t) => {
            setTeam(t);
        });

        const unsubscribeScheduled = TeamService.subscribeToScheduledGames(teamId, (games) => {
            setScheduledGames(games);
        });

        const loadStats = async () => {
            const history = await GameService.getPastGamesForTeam(teamId);
            setAllGames(history);
        };

        loadStats();
        return () => {
            unsubscribe();
            unsubscribeScheduled();
        };
    }, [teamId, playerId]);

    useEffect(() => {
        if (!team?.players?.[playerId]) return;
        setNameDraft(team.players[playerId].name ?? '');
        setNumberDraft(sanitizeJerseyInput(team.players[playerId].number ?? ''));
    }, [team, playerId]);

    if (!team || !team.players) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const player = team.players[playerId];
    if (!player) {
         return <View style={styles.centerContainer}><Text>Player not found.</Text></View>;
    }

    const currentUserId = auth.currentUser?.uid || '';
    const canManageBadges = currentUserId === team.coachId || !!team.managers?.[currentUserId];
    const canManagePlayerMeta = canManageBadges;
    const nextScheduledGame = (scheduledGames || []).find((game) => {
        if (typeof game.scheduledAt !== 'number') return true;
        return game.scheduledAt >= Date.now();
    }) || null;
    const nextAvailability = nextScheduledGame?.availability?.[playerId];
    const canSeeNextAvailability = canManagePlayerMeta && !!nextScheduledGame;
    const selectedBadge = PLAYER_BADGE_OPTIONS.find((option) => option.key === player.badge);
    const selectedRole = PLAYER_ROLE_OPTIONS.find((option) => option.key === player.role);
    const selectedLine = PLAYER_LINE_OPTIONS.find((option) => option.key === (player.primaryLine || 'flex'));
    const selectedPosition = PLAYER_POSITION_OPTIONS.find((option) => option.key === (player.position || 'hybrid'));
    const isClaimedByCurrentUser = player.claimedByUid === currentUserId;
    const canManageClaim = canManagePlayerMeta || isClaimedByCurrentUser;
    const statPrivacy = player.statPrivacy || 'team';

    const handleAssignRole = async (roleKey: PlayerRole | null) => {
        if (!canManagePlayerMeta || !teamId || !playerId || !currentUserId) return;
        try {
            await TeamService.updatePlayerRole(teamId, playerId, roleKey, currentUserId);
        } catch {
            // Keep this silent to avoid modal spam while selecting role chips quickly.
        }
    };

    const handleAssignBadge = async (badgeKey: string | null) => {
        if (!canManagePlayerMeta || !teamId || !playerId || !currentUserId) return;
        try {
            await TeamService.updatePlayerBadge(teamId, playerId, badgeKey, currentUserId);
        } catch {
            // Keep this silent to avoid modal spam while selecting badge chips quickly.
        }
    };

    const handleAssignLineProfile = async (
        primaryLine: PlayerPrimaryLine | null = player.primaryLine || 'flex',
        position: PlayerPosition | null = player.position || 'hybrid'
    ) => {
        if (!canManagePlayerMeta || !teamId || !playerId || !currentUserId) return;
        try {
            await TeamService.updatePlayerLineProfile(teamId, playerId, primaryLine, position, currentUserId);
        } catch (error: any) {
            Alert.alert('Line Profile Failed', error?.message || 'Could not update this player line profile.');
        }
    };

    const handleCreateClaimCode = async () => {
        if (!canManagePlayerMeta || !teamId || !playerId || !currentUserId) return;
        try {
            setIsClaimWorking(true);
            const code = await TeamService.createPlayerClaimCode(teamId, playerId, currentUserId);
            setGeneratedClaimCode(code);
            setClaimModalOpen(true);
        } catch (error: any) {
            Alert.alert('Claim Code Failed', error?.message || 'Could not create a player claim code.');
        } finally {
            setIsClaimWorking(false);
        }
    };

    const handleCopyClaimCode = async () => {
        if (!generatedClaimCode) return;
        await Clipboard.setStringAsync(generatedClaimCode);
        Alert.alert('Copied', 'Player claim code copied to clipboard.');
    };

    const handleClaimPlayer = async () => {
        if (!currentUserId || !claimCodeInput.trim()) return;
        try {
            setIsClaimWorking(true);
            await TeamService.claimPlayerByCode(claimCodeInput, currentUserId);
            setClaimCodeInput('');
            setClaimModalOpen(false);
            Alert.alert('Player Claimed', 'This player page is now linked to your account.');
        } catch (error: any) {
            Alert.alert('Claim Failed', error?.message || 'Could not claim this player page.');
        } finally {
            setIsClaimWorking(false);
        }
    };

    const handleSetPrivacy = async (privacy: 'public' | 'team' | 'private') => {
        if (!teamId || !playerId || !currentUserId) return;
        try {
            await TeamService.updatePlayerStatPrivacy(teamId, playerId, privacy, currentUserId);
        } catch (error: any) {
            Alert.alert('Privacy Update Failed', error?.message || 'Could not update stat privacy.');
        }
    };

    const normalizedStoredNumber = sanitizeJerseyInput(player.number ?? '');

    const handleSaveDisplayName = async () => {
        if (!canManagePlayerMeta || !teamId || !playerId || !currentUserId) return;
        const trimmed = nameDraft.trim();
        if (!trimmed) {
            Alert.alert('Name required', 'Enter a display name for this player.');
            return;
        }
        const numSanitized = sanitizeJerseyInput(numberDraft);
        const nameChanged = trimmed !== (player.name ?? '').trim();
        const numberChanged = numSanitized !== normalizedStoredNumber;
        if (!nameChanged && !numberChanged) {
            setNameModalOpen(false);
            return;
        }
        try {
            setIsSavingName(true);
            if (nameChanged) {
                await TeamService.updatePlayerDisplayName(teamId, playerId, trimmed, currentUserId);
            }
            if (numberChanged) {
                await TeamService.updatePlayerNumber(teamId, playerId, numSanitized || null, currentUserId);
            }
            setNameModalOpen(false);
        } catch (error: any) {
            Alert.alert('Could not save', error?.message || 'Try again.');
        } finally {
            setIsSavingName(false);
        }
    };

    const rosterModalNameDirty = nameDraft.trim() !== (player.name ?? '').trim();
    const rosterModalNumberDirty = sanitizeJerseyInput(numberDraft) !== normalizedStoredNumber;
    const rosterModalHasChanges = rosterModalNameDirty || rosterModalNumberDirty;

    const gamesWithPlayer = allGames.filter(game => {
        return (game.history || []).some(e => {
            const throwerId = e.fromPlayerId || e.assistPlayerId || (e.type === 'Pass' ? e.playerId : undefined);
            const receiverId = e.toPlayerId || (e.assistPlayerId ? e.playerId : undefined);
            return e.playerId === playerId || e.assistPlayerId === playerId || throwerId === playerId || receiverId === playerId;
        });
    });

    const availableYears = ['All Time', ...Array.from(new Set(gamesWithPlayer.map(g => {
        return g.history?.length ? new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() : 'Unknown';
    }))).filter(y => y !== 'Unknown').sort((a,b) => b.localeCompare(a))];

    const filteredGames = gamesWithPlayer.filter(g => {
        if (selectedYear === 'All Time') return true;
        if (!g.history?.length) return false;
        return new Date(g.history[g.history.length-1].timestamp).getFullYear().toString() === selectedYear;
    });

    let goals = 0; let assists = 0; let blocks = 0; let turns = 0;
    let passes = 0; let passAttempts = 0; let passCompletions = 0; let passTurnovers = 0; let receptions = 0;
    let callahans = 0; let timeWithDisc = 0;
    let gamesPlayed = 0; let wins = 0; let losses = 0; let ties = 0;
    const chemistryTargets: Record<string, { playerName: string; attempts: number; completions: number }> = {};
    const throwProfiles: Record<string, { attempts: number; completions: number; turnovers: number; distanceSum: number; samples: number }> = {};
    let epvTotal = 0;
    let epvSamples = 0;
    let epvPositive = 0;

    filteredGames.forEach(game => {
        let participated = false;
        
        const isTeam1 = game.team1Id === teamId;
        const ourScore = isTeam1 ? game.score1 : game.score2;
        const theirScore = isTeam1 ? game.score2 : game.score1;

        (game.history || []).forEach(e => {
            const throwerId = e.fromPlayerId || e.assistPlayerId || (e.type === 'Pass' ? e.playerId : undefined);
            const receiverId = e.toPlayerId || (e.assistPlayerId ? e.playerId : undefined);
            const isPassCompletion = e.type === 'Pass' || e.type === 'Goal' || e.type === 'G';
            const isPassTurn = e.type === 'Throwaway' || e.type === 'T' || e.type === 'Drop';

            if (e.playerId === playerId) {
                participated = true;
                if (e.type === 'Goal' || e.type === 'G') goals++;
                if (e.type === 'Callahan_US') { goals++; blocks++; callahans++; }
                if (e.type === 'D' || e.type === 'D-Block') blocks++;
                if (e.type === 'Throwaway' || e.type === 'T' || e.type === 'Drop' || e.type === 'Callahan_THEM') turns++;
                if (e.timeElapsedMs) timeWithDisc += e.timeElapsedMs;
            }

            if ((e.type === 'Goal' || e.type === 'G') && e.assistPlayerId === playerId) {
                participated = true;
                assists++;
            }

            if (throwerId === playerId && (isPassCompletion || isPassTurn)) {
                participated = true;
                passAttempts++;
                if (isPassCompletion) {
                    passCompletions++;
                    passes++;
                }
                if (isPassTurn) passTurnovers++;

                if (receiverId) {
                    if (!chemistryTargets[receiverId]) {
                        chemistryTargets[receiverId] = {
                            playerName: team.players?.[receiverId]?.name?.split(' ')?.[0] || 'Unknown',
                            attempts: 0,
                            completions: 0,
                        };
                    }
                    chemistryTargets[receiverId].attempts += 1;
                    if (isPassCompletion) chemistryTargets[receiverId].completions += 1;
                }

                if (isValidCoord(e.fromFieldPosition) && isValidCoord(e.fieldPosition)) {
                    const fromCoord = e.fromFieldPosition!;
                    const toCoord = e.fieldPosition!;
                    const dx = toCoord.x - fromCoord.x;
                    const dy = toCoord.y - fromCoord.y;
                    const distance = Math.sqrt((dx * dx) + (dy * dy));
                    const profile = classifyThrowProfile(dx, dy, distance, toCoord.x);

                    if (!throwProfiles[profile]) {
                        throwProfiles[profile] = { attempts: 0, completions: 0, turnovers: 0, distanceSum: 0, samples: 0 };
                    }

                    throwProfiles[profile].attempts += 1;
                    throwProfiles[profile].distanceSum += distance;
                    throwProfiles[profile].samples += 1;
                    if (isPassCompletion) throwProfiles[profile].completions += 1;
                    if (isPassTurn) throwProfiles[profile].turnovers += 1;

                    const delta = zoneValueFromX(toCoord.x) - zoneValueFromX(fromCoord.x);
                    epvTotal += delta;
                    epvSamples += 1;
                    if (delta > 0) epvPositive += 1;
                }
            }

            if (receiverId === playerId && isPassCompletion) {
                participated = true;
                receptions++;
            }
        });

        if (participated) {
            gamesPlayed++;
            if (ourScore > theirScore) wins++;
            else if (ourScore < theirScore) losses++;
            else ties++;
        }
    });

    const topChemTarget = Object.values(chemistryTargets)
        .filter((entry) => entry.attempts > 0)
        .sort((a, b) => {
            const pctA = a.completions / a.attempts;
            const pctB = b.completions / b.attempts;
            if (pctB !== pctA) return pctB - pctA;
            return b.attempts - a.attempts;
        })[0];

    const passCompletionPct = passAttempts > 0 ? Math.round((passCompletions / passAttempts) * 100) : 0;
    const throwProfileRows = Object.entries(throwProfiles)
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

    const s = {
        goals,
        assists,
        blocks,
        turns,
        passes,
        passAttempts,
        passCompletions,
        passTurnovers,
        passCompletionPct,
        receptions,
        callahans,
        timeWithDisc,
        gamesPlayed,
        wins,
        losses,
        ties,
    };
    const gp = Math.max(s.gamesPlayed, 1);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    };

    return (
        <View style={styles.container}>
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle} numberOfLines={1}>Athlete Profile</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.mainContent}>
                
                {/* HERO CARD */}
                <View style={styles.heroCard}>
                    <View style={styles.heroAvatar}>
                        <Text style={styles.heroAvatarText}>{player.number || player.name.substring(0,2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.heroNameRow}>
                        <Text style={styles.heroName}>{player.name}</Text>
                        {canManagePlayerMeta && (
                            <TouchableOpacity
                                onPress={() => {
                                    setNameDraft(player.name ?? '');
                                    setNumberDraft(sanitizeJerseyInput(player.number ?? ''));
                                    setNameModalOpen(true);
                                }}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                style={styles.heroNameEditBtn}
                                accessibilityLabel="Edit name and number"
                                activeOpacity={0.75}
                            >
                                <Ionicons name="pencil" size={16} color={colors.primary} />
                            </TouchableOpacity>
                        )}
                        {canSeeNextAvailability && (nextAvailability === 'yes' || nextAvailability === 'no') && (
                            <Ionicons
                                name={nextAvailability === 'yes' ? 'checkmark-circle' : 'close-circle'}
                                size={18}
                                color={nextAvailability === 'yes' ? colors.success : colors.error}
                            />
                        )}
                    </View>
                    {!!selectedRole && (
                        <View style={[styles.playerRoleHeroPill, { borderColor: selectedRole.color, backgroundColor: colors.surfaceSecondary }]}> 
                            <Ionicons name={selectedRole.icon} size={13} color={selectedRole.color} />
                            <Text style={[styles.playerRoleHeroPillText, { color: selectedRole.color }]}>{selectedRole.label}</Text>
                        </View>
                    )}
                    {!!selectedLine && (
                        <View style={[styles.playerRoleHeroPill, { borderColor: selectedLine.color, backgroundColor: colors.surfaceSecondary }]}>
                            <Ionicons name={selectedLine.icon} size={13} color={selectedLine.color} />
                            <Text style={[styles.playerRoleHeroPillText, { color: selectedLine.color }]}>{selectedLine.label}</Text>
                        </View>
                    )}
                    {!!selectedPosition && (
                        <View style={[styles.playerRoleHeroPill, { borderColor: selectedPosition.color, backgroundColor: colors.surfaceSecondary }]}>
                            <Ionicons name={selectedPosition.icon} size={13} color={selectedPosition.color} />
                            <Text style={[styles.playerRoleHeroPillText, { color: selectedPosition.color }]}>{selectedPosition.label}</Text>
                        </View>
                    )}
                    {!!selectedBadge && (
                        <View style={[styles.playerBadgeHeroPill, { borderColor: selectedBadge.color, backgroundColor: colors.surfaceSecondary }]}>
                            <Ionicons name={selectedBadge.icon} size={13} color={selectedBadge.color} />
                            <Text style={[styles.playerBadgeHeroPillText, { color: selectedBadge.color }]}>{selectedBadge.label}</Text>
                        </View>
                    )}
                    <TouchableOpacity 
                        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }} 
                        onPress={() => router.push(`/team/${teamId}` as any)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="shield-half" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                        <Text style={{ ...getTypography(colors).body, color: colors.primary, fontWeight: '600' }}>{team.name}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.primary} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                    
                    <View style={styles.recordBadge}>
                        <Text style={styles.recordText}>{s.wins}W - {s.losses}L{s.ties > 0 ? ` - ${s.ties}T` : ''}</Text>
                    </View>
                </View>

                {canManagePlayerMeta && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>LINE SETUP</Text>
                        <Text style={styles.identitySubtext}>Used by the recorder to build O-line/D-line presets and track points played.</Text>
                        <Text style={[styles.sectionTitle, { marginTop: 10, marginBottom: 8 }]}>PRIMARY LINE</Text>
                        <View style={styles.badgeGrid}>
                            {PLAYER_LINE_OPTIONS.map((option) => {
                                const active = selectedLine?.key === option.key;
                                return (
                                    <TouchableOpacity
                                        key={`line-option-${option.key}`}
                                        style={[styles.badgeChip, active && { borderColor: option.color, backgroundColor: colors.surfaceSecondary }]}
                                        onPress={() => handleAssignLineProfile(option.key, player.position || 'hybrid')}
                                        disabled={!canManagePlayerMeta}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name={option.icon} size={13} color={active ? option.color : colors.textSecondary} />
                                        <Text style={[styles.badgeChipText, active && { color: option.color }]}>{option.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <Text style={[styles.sectionTitle, { marginTop: 10, marginBottom: 8 }]}>POSITION</Text>
                        <View style={styles.badgeGrid}>
                            {PLAYER_POSITION_OPTIONS.map((option) => {
                                const active = selectedPosition?.key === option.key;
                                return (
                                    <TouchableOpacity
                                        key={`position-option-${option.key}`}
                                        style={[styles.badgeChip, active && { borderColor: option.color, backgroundColor: colors.surfaceSecondary }]}
                                        onPress={() => handleAssignLineProfile(player.primaryLine || 'flex', option.key)}
                                        disabled={!canManagePlayerMeta}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name={option.icon} size={13} color={active ? option.color : colors.textSecondary} />
                                        <Text style={[styles.badgeChipText, active && { color: option.color }]}>{option.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                <View style={styles.card}>
                    <View style={styles.identityHeaderRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionTitle}>PLAYER IDENTITY</Text>
                            <Text style={styles.identitySubtext}>
                                {player.verifiedRosterLink
                                    ? 'Verified roster link is active for this player page.'
                                    : 'Players can claim this page with a coach-generated code.'}
                            </Text>
                        </View>
                        <View style={[styles.claimStatusPill, player.verifiedRosterLink && styles.claimStatusPillVerified]}>
                            <Ionicons
                                name={player.verifiedRosterLink ? 'checkmark-circle' : 'person-add-outline'}
                                size={14}
                                color={player.verifiedRosterLink ? colors.success : colors.textSecondary}
                            />
                            <Text style={[styles.claimStatusText, player.verifiedRosterLink && { color: colors.success }]}>
                                {player.verifiedRosterLink ? 'Verified' : 'Unclaimed'}
                            </Text>
                        </View>
                    </View>

                    {canManagePlayerMeta && !player.claimedByUid && (
                        <TouchableOpacity style={styles.claimPrimaryBtn} onPress={handleCreateClaimCode} disabled={isClaimWorking} activeOpacity={0.85}>
                            <Ionicons name="key-outline" size={17} color={colors.onPrimary} />
                            <Text style={styles.claimPrimaryBtnText}>{isClaimWorking ? 'Creating...' : 'Create Claim Code'}</Text>
                        </TouchableOpacity>
                    )}

                    {!player.claimedByUid && !!currentUserId && (
                        <TouchableOpacity style={styles.claimSecondaryBtn} onPress={() => { setGeneratedClaimCode(''); setClaimModalOpen(true); }} activeOpacity={0.85}>
                            <Text style={styles.claimSecondaryBtnText}>I Have a Claim Code</Text>
                        </TouchableOpacity>
                    )}

                    {canManageClaim && (
                        <View style={styles.privacyRow}>
                            {(['public', 'team', 'private'] as const).map((privacy) => (
                                <TouchableOpacity
                                    key={`privacy-${privacy}`}
                                    style={[styles.privacyChip, statPrivacy === privacy && styles.privacyChipActive]}
                                    onPress={() => handleSetPrivacy(privacy)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.privacyChipText, statPrivacy === privacy && styles.privacyChipTextActive]}>
                                        {privacy === 'public' ? 'Public Stats' : privacy === 'team' ? 'Team Only' : 'Private'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {canManagePlayerMeta && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>PLAYER ROLE</Text>
                        <View style={styles.badgeGrid}>
                            {PLAYER_ROLE_OPTIONS.map((option) => {
                                const active = selectedRole?.key === option.key;
                                return (
                                    <TouchableOpacity
                                        key={`role-option-${option.key}`}
                                        style={[styles.badgeChip, active && { borderColor: option.color, backgroundColor: colors.surfaceSecondary }]}
                                        onPress={() => handleAssignRole(option.key)}
                                        disabled={!canManagePlayerMeta}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name={option.icon} size={13} color={active ? option.color : colors.textSecondary} />
                                        <Text style={[styles.badgeChipText, active && { color: option.color }]}>{option.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {canManagePlayerMeta && !!selectedRole && (
                            <TouchableOpacity style={styles.clearBadgeBtn} onPress={() => handleAssignRole(null)} activeOpacity={0.8}>
                                <Text style={styles.clearBadgeBtnText}>Clear Role</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {canManagePlayerMeta && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>PLAYER BADGE</Text>
                        <View style={styles.badgeGrid}>
                            {PLAYER_BADGE_OPTIONS.map((option) => {
                                const active = selectedBadge?.key === option.key;
                                return (
                                    <TouchableOpacity
                                        key={`badge-option-${option.key}`}
                                        style={[styles.badgeChip, active && { borderColor: option.color, backgroundColor: colors.surfaceSecondary }]}
                                        onPress={() => handleAssignBadge(option.key)}
                                        disabled={!canManagePlayerMeta}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name={option.icon} size={13} color={active ? option.color : colors.textSecondary} />
                                        <Text style={[styles.badgeChipText, active && { color: option.color }]}>{option.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {canManagePlayerMeta && !!selectedBadge && (
                            <TouchableOpacity style={styles.clearBadgeBtn} onPress={() => handleAssignBadge(null)} activeOpacity={0.8}>
                                <Text style={styles.clearBadgeBtnText}>Clear Badge</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* YEAR FILTER */}
                {gamesWithPlayer.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
                            {availableYears.map(year => (
                                <TouchableOpacity 
                                    key={year} 
                                    style={[styles.filterChip, selectedYear === year && styles.filterChipActive]}
                                    onPress={() => setSelectedYear(year)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.filterChipText, selectedYear === year && styles.filterChipTextActive]}>{year}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                )}

                {/* CAREER TOTALS */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>CAREER TOTALS</Text>
                    <View style={styles.statGrid}>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.primary }]}>{s.goals}</Text>
                            <Text style={styles.statLabel}>Goals</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.primary }]}>{s.assists}</Text>
                            <Text style={styles.statLabel}>Assists</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.primary }]}>{s.blocks}</Text>
                            <Text style={styles.statLabel}>D-Blocks</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.error }]}>{s.turns}</Text>
                            <Text style={styles.statLabel}>Turns</Text>
                        </View>
                    </View>
                    
                    <View style={[styles.statGrid, { marginTop: 16 }]}>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{s.passAttempts}</Text>
                            <Text style={styles.statLabel}>Pass Attempts</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: s.passCompletionPct >= 75 ? colors.success : colors.text }]}>{s.passCompletionPct}%</Text>
                            <Text style={styles.statLabel}>Pass Completion</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{s.receptions}</Text>
                            <Text style={styles.statLabel}>Receptions</Text>
                        </View>
                    </View>

                    <View style={[styles.statGrid, { marginTop: 16 }]}>
                        <View style={styles.statBox}>
                            <Text style={[styles.statValue, { color: colors.error }]}>{s.passTurnovers}</Text>
                            <Text style={styles.statLabel}>Pass Turns</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{s.callahans}</Text>
                            <Text style={styles.statLabel}>Callahans</Text>
                        </View>
                        <View style={[styles.statBox, { flex: 2 }]}>
                            <Text style={styles.statValue}>{formatTime(s.timeWithDisc)}</Text>
                            <Text style={styles.statLabel}>Time With Disc</Text>
                        </View>
                    </View>
                </View>

                {/* PASSING CHEMISTRY */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>PASSING CHEMISTRY</Text>
                    {topChemTarget ? (
                        <>
                            <Text style={{ ...getTypography(colors).body, fontWeight: '600', marginBottom: 6 }}>
                                Best Link: {player.name.split(' ')[0]} to {topChemTarget.playerName}
                            </Text>
                            <Text style={styles.statLabel}>
                                {topChemTarget.completions}/{topChemTarget.attempts} completed ({Math.round((topChemTarget.completions / topChemTarget.attempts) * 100)}%)
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.statLabel}>Not enough tracked pass data yet.</Text>
                    )}
                </View>

                {throwProfileRows.length > 0 && (
                    <View style={styles.card}>
                        <Text style={styles.sectionTitle}>THROW PROFILE + EPV</Text>
                        <Text style={{ ...getTypography(colors).bodySmall, marginBottom: 8 }}>
                            Avg EPV delta: <Text style={{ color: epvAverage >= 0 ? colors.success : colors.error, fontWeight: '700' }}>{epvAverage.toFixed(2)}</Text>
                            {'   '}Positive EPV: <Text style={{ fontWeight: '700' }}>{epvPositiveRate}%</Text>
                        </Text>
                        {throwProfileRows.map((row) => (
                            <Text key={row.name} style={{ ...getTypography(colors).bodySmall, marginBottom: 4 }}>
                                {row.name}: {row.completionPct}% on {row.attempts} attempts (avg {row.avgDistance})
                            </Text>
                        ))}
                    </View>
                )}

                {/* PER GAME AVERAGES */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>PER GAME AVERAGES</Text>
                    <View style={styles.statGrid}>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.goals / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>G/Game</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.assists / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>A/Game</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.blocks / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>D/Game</Text>
                        </View>
                        <View style={styles.statBox}>
                            <Text style={styles.statValue}>{(s.turns / gp).toFixed(1)}</Text>
                            <Text style={styles.statLabel}>T/Game</Text>
                        </View>
                    </View>
                </View>

                {/* MATCH HISTORY INVOLVEMENT */}
                <Text style={[styles.sectionTitle, { marginLeft: 8, marginTop: 16, marginBottom: 8 }]}>PARTICIPATED MATCHES</Text>
                {filteredGames.length === 0 ? (
                    <Text style={styles.emptyText}>No games recorded for this player in {selectedYear}.</Text>
                ) : (
                    filteredGames.map((game) => {
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
                                <View style={[styles.historyScoreBox, { backgroundColor: scoreBoxBg }]}>
                                    <Text style={[styles.historyScoreText, { color: textColor }]}>
                                        {ourScore} - {theirScore}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </View>
        </ScrollView>

        <Modal visible={nameModalOpen} animationType="fade" transparent onRequestClose={() => setNameModalOpen(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.claimModalCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.modalTitle}>Name & number</Text>
                        <TouchableOpacity onPress={() => setNameModalOpen(false)} accessibilityLabel="Close">
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.identitySubtext}>Shown on the roster and recorder. Name up to 80 characters; jersey up to 4 letters or digits.</Text>
                    <TextInput
                        style={styles.nameModalInput}
                        value={nameDraft}
                        onChangeText={setNameDraft}
                        placeholder="Player name"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="words"
                        maxLength={80}
                    />
                    <Text style={[styles.identitySubtext, { marginTop: 10, marginBottom: 4 }]}>Jersey number</Text>
                    <TextInput
                        style={styles.nameModalInput}
                        value={numberDraft}
                        onChangeText={(t) => setNumberDraft(sanitizeJerseyInput(t))}
                        placeholder="e.g. 7 or 23"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="default"
                        autoCapitalize="characters"
                        maxLength={4}
                    />
                    <TouchableOpacity
                        style={[
                            styles.claimPrimaryBtn,
                            (isSavingName || nameDraft.trim().length === 0 || !rosterModalHasChanges) && styles.nameSaveBtnDisabled,
                        ]}
                        onPress={handleSaveDisplayName}
                        disabled={isSavingName || nameDraft.trim().length === 0 || !rosterModalHasChanges}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.claimPrimaryBtnText}>{isSavingName ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.claimSecondaryBtn} onPress={() => setNameModalOpen(false)} activeOpacity={0.85}>
                        <Text style={styles.claimSecondaryBtnText}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

        <Modal visible={claimModalOpen} animationType="fade" transparent onRequestClose={() => setClaimModalOpen(false)}>
            <View style={styles.modalOverlay}>
                <View style={styles.claimModalCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.modalTitle}>Player Claim</Text>
                        <TouchableOpacity onPress={() => setClaimModalOpen(false)}>
                            <Ionicons name="close" size={22} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    {generatedClaimCode ? (
                        <>
                            <Text style={styles.identitySubtext}>Give this code to {player.name}. Once they enter it, this page becomes their verified roster link.</Text>
                            <TouchableOpacity style={styles.generatedCodeBox} onPress={handleCopyClaimCode} activeOpacity={0.85}>
                                <Text style={styles.generatedCodeText}>{generatedClaimCode}</Text>
                                <Text style={styles.generatedCodeHint}>Tap to copy</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <Text style={styles.identitySubtext}>Enter the six-character code your coach gave you to claim this player page.</Text>
                            <TextInput
                                style={styles.claimInput}
                                value={claimCodeInput}
                                onChangeText={(value) => setClaimCodeInput(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                                autoCapitalize="characters"
                                placeholder="ABC123"
                                placeholderTextColor={colors.textSecondary}
                            />
                            <TouchableOpacity style={styles.claimPrimaryBtn} onPress={handleClaimPlayer} disabled={isClaimWorking || claimCodeInput.length < 6} activeOpacity={0.85}>
                                <Text style={styles.claimPrimaryBtnText}>{isClaimWorking ? 'Claiming...' : 'Claim Player Page'}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </Modal>
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

    heroCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 32, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    heroAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroAvatarText: { ...getTypography(colors).title, fontSize: 32, color: colors.primary },
    heroNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
    heroName: { ...getTypography(colors).title, fontSize: 24 },
    heroNameEditBtn: { padding: 4, borderRadius: Layout.radiusSm },
    playerRoleHeroPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: Layout.radiusFull,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 8,
    },
    playerRoleHeroPillText: { ...getTypography(colors).bodySmall, fontWeight: '700' },
    playerBadgeHeroPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderWidth: 1,
        borderRadius: Layout.radiusFull,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 10,
    },
    playerBadgeHeroPillText: { ...getTypography(colors).bodySmall, fontWeight: '700' },
    heroSubtitle: { ...getTypography(colors).body, color: colors.textSecondary, marginBottom: 16 },
    
    recordBadge: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border },
    recordText: { ...getTypography(colors).label, letterSpacing: 1 },
    nameModalInput: {
        ...getTypography(colors).body,
        marginTop: 12,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        color: colors.text,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    nameSaveBtnDisabled: { opacity: 0.45 },

    card: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    sectionTitle: { ...getTypography(colors).label, marginBottom: 16 },
    badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    badgeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: Layout.radiusFull,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    badgeChipText: { ...getTypography(colors).bodySmall, color: colors.textSecondary, fontWeight: '700' },
    clearBadgeBtn: {
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        borderRadius: Layout.radiusSm,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    clearBadgeBtnText: { ...getTypography(colors).bodySmall, color: colors.textSecondary, fontWeight: '700' },
    identityHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    identitySubtext: { ...getTypography(colors).bodySmall, color: colors.textSecondary, lineHeight: 19 },
    claimStatusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        borderRadius: Layout.radiusFull,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        paddingHorizontal: 9,
        paddingVertical: 5,
    },
    claimStatusPillVerified: { borderColor: colors.success },
    claimStatusText: { ...getTypography(colors).bodySmall, fontWeight: '700' },
    claimPrimaryBtn: {
        marginTop: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: Layout.radiusMd,
        backgroundColor: colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 14,
    },
    claimPrimaryBtnText: { ...getTypography(colors).button, color: colors.onPrimary },
    claimSecondaryBtn: {
        marginTop: 10,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        paddingVertical: 11,
        alignItems: 'center',
    },
    claimSecondaryBtnText: { ...getTypography(colors).bodySmall, color: colors.text, fontWeight: '700' },
    privacyRow: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' },
    privacyChip: {
        borderRadius: Layout.radiusFull,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    privacyChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    privacyChipText: { ...getTypography(colors).bodySmall, color: colors.textSecondary, fontWeight: '700' },
    privacyChipTextActive: { color: colors.primary },
    
    statGrid: { flexDirection: 'row', gap: 12 },
    statBox: { flex: 1, backgroundColor: colors.surfaceSecondary, paddingVertical: 16, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    statValue: { ...getTypography(colors).title, fontSize: 20, marginBottom: 4 },
    statLabel: { ...getTypography(colors).bodySmall, fontSize: 11, color: colors.textSecondary },

    emptyText: { ...getTypography(colors).bodySmall, textAlign: 'center', marginVertical: 16 },

    historyCard: { flexDirection: 'row', padding: 16, borderRadius: Layout.radiusMd, marginBottom: 12, alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, ...Layout.shadow },
    historyMatchInfo: { flex: 1, paddingRight: 10 },
    historyOpponent: { ...getTypography(colors).body, fontWeight: '600', marginBottom: 4 },
    historyDate: { ...getTypography(colors).bodySmall },
    historyScoreBox: { backgroundColor: 'rgba(255,255,255,0.7)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Layout.radiusSm },
    historyScoreText: { ...getTypography(colors).title, fontSize: 18 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    claimModalCard: { width: '100%', maxWidth: 430, backgroundColor: colors.surface, borderRadius: Layout.radiusLg, padding: 20, borderWidth: 1, borderColor: colors.border },
    modalTitle: { ...getTypography(colors).title, fontSize: 20 },
    claimInput: {
        ...getTypography(colors).title,
        letterSpacing: 4,
        textAlign: 'center',
        marginTop: 14,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        color: colors.text,
        padding: 14,
    },
    generatedCodeBox: {
        marginTop: 16,
        borderRadius: Layout.radiusMd,
        borderWidth: 1,
        borderColor: colors.primary,
        backgroundColor: colors.primaryLight,
        padding: 16,
        alignItems: 'center',
    },
    generatedCodeText: { ...getTypography(colors).title, color: colors.primary, letterSpacing: 3 },
    generatedCodeHint: { ...getTypography(colors).bodySmall, color: colors.primary, marginTop: 4, fontWeight: '700' },

    filterChip: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Layout.radiusFull, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { ...getTypography(colors).bodySmall, fontWeight: '600', color: colors.textSecondary },
    filterChipTextActive: { color: colors.onPrimary }
});
}
