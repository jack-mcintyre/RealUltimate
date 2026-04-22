import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../../../../firebaseConfig';
import { sanitizeAvailability, validateScheduledGameDraft } from '../../../services/scheduleValidation';
import { TeamService } from '../../../services/TeamService';
import { ScheduledAvailabilityStatus, ScheduledGame, Team } from '../../../services/types';
import { getTypography, Layout } from '../../../theme/DesignSystem';
import { ThemeColors, useTheme } from '../../../theme/ThemeContext';

export default function ScheduledGameDetailScreen() {
    const { teamId, gameId } = useLocalSearchParams<{ teamId: string; gameId: string }>();
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [team, setTeam] = useState<Team | null>(null);
    const [scheduledGame, setScheduledGame] = useState<ScheduledGame | null>(null);

    const [opponentName, setOpponentName] = useState('');
    const [location, setLocation] = useState('');
    const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
    const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
    const [availability, setAvailability] = useState<Record<string, ScheduledAvailabilityStatus>>({});

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [formError, setFormError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (!teamId) return;
        const unsubTeam = TeamService.subscribeToTeam(teamId, (nextTeam) => setTeam(nextTeam));
        const unsubGames = TeamService.subscribeToScheduledGames(teamId, (games) => {
            const match = games.find((game) => game.id === gameId) || null;
            setScheduledGame(match);
        });

        return () => {
            unsubTeam();
            unsubGames();
        };
    }, [teamId, gameId]);

    useEffect(() => {
        if (!scheduledGame) return;

        setOpponentName(scheduledGame.opponentName || '');
        setLocation(scheduledGame.location || '');
        setAvailability({ ...(scheduledGame.availability || {}) });
        setFormError('');

        if (typeof scheduledGame.scheduledAt === 'number') {
            const dt = new Date(scheduledGame.scheduledAt);
            setScheduledDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
            setScheduledTime(dt);
        } else {
            setScheduledDate(null);
            setScheduledTime(null);
        }
    }, [scheduledGame?.id]);

    const playerList = useMemo(() => {
        if (!team?.players) return [];
        return Object.values(team.players);
    }, [team?.players]);

    const yesNames = Object.entries(availability)
        .filter(([, status]) => status === 'yes')
        .map(([playerId]) => team?.players?.[playerId]?.name || 'Unknown');
    const noNames = Object.entries(availability)
        .filter(([, status]) => status === 'no')
        .map(([playerId]) => team?.players?.[playerId]?.name || 'Unknown');

    const toGoogleCalendarDate = (timestamp: number) => {
        return new Date(timestamp).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const handleOpenCalendar = async () => {
        if (!scheduledGame || typeof scheduledGame.scheduledAt !== 'number') {
            Alert.alert('Date/Time Needed', 'Set date and time first before exporting to calendar.');
            return;
        }

        const start = scheduledGame.scheduledAt;
        const end = start + (2 * 60 * 60 * 1000);
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: `${scheduledGame.teamName} vs ${scheduledGame.opponentName}`,
            dates: `${toGoogleCalendarDate(start)}/${toGoogleCalendarDate(end)}`,
            details: `Scheduled via RealUltimate${scheduledGame.location ? `\nLocation: ${scheduledGame.location}` : ''}`,
            location: scheduledGame.location || '',
        });

        await Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`);
    };

    const handleDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') setShowDatePicker(false);
        if (!selected) return;
        setScheduledDate(selected);
    };

    const handleTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') setShowTimePicker(false);
        if (!selected) return;
        setScheduledTime(selected);
    };

    const handleAvailability = (playerId: string, status: ScheduledAvailabilityStatus) => {
        setAvailability((prev) => ({ ...prev, [playerId]: status }));
    };

    const handleSave = async () => {
        if (!team || !scheduledGame || !auth.currentUser) return;

        const uid = auth.currentUser.uid;
        const isCoach = uid === team.coachId;
        const isManager = !!team.managers?.[uid];
        if (!isCoach && !isManager) {
            Alert.alert('Permission denied', 'Only coaches/managers can edit scheduled games.');
            return;
        }

        setFormError('');

        const validation = validateScheduledGameDraft({
            opponentName,
            location,
            scheduleDate: scheduledDate,
            scheduleTime: scheduledTime,
        });
        if (!validation.ok) {
            setFormError(validation.error);
            return;
        }

        const validPlayerIds = playerList.map((player) => player.id).filter(Boolean);
        const normalizedAvailability = sanitizeAvailability(availability, validPlayerIds);

        try {
            setIsSaving(true);
            await TeamService.updateScheduledGame(team.id, scheduledGame.id, auth.currentUser.uid, {
                opponentName: validation.opponentName,
                location: validation.location,
                scheduledAt: validation.scheduledAt,
                availability: normalizedAvailability,
            });
            Alert.alert('Saved', 'Scheduled game updated.');
        } catch {
            setFormError('Could not save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStart = () => {
        if (!team || !scheduledGame) return;
        router.push({
            pathname: '/game/record/[teamId]',
            params: {
                teamId: team.id,
                scheduledGameId: scheduledGame.id,
                prefOpponentName: scheduledGame.opponentName,
                prefOpponentTeamId: scheduledGame.opponentTeamId || '',
                prefLocation: scheduledGame.location || '',
            },
        } as any);
    };

    const handleDelete = async () => {
        if (!team || !scheduledGame || !auth.currentUser) return;

        const uid = auth.currentUser.uid;
        const isCoach = uid === team.coachId;
        const isManager = !!team.managers?.[uid];
        if (!isCoach && !isManager) {
            Alert.alert('Permission denied', 'Only coaches/managers can delete scheduled games.');
            return;
        }

        Alert.alert(
            'Delete Scheduled Game',
            'This will permanently remove this scheduled game.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsDeleting(true);
                            await TeamService.removeScheduledGame(team.id, scheduledGame.id, uid);
                            router.back();
                        } catch {
                            Alert.alert('Delete failed', 'Could not delete scheduled game. Please try again.');
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    if (!team || !scheduledGame) {
        return (
            <View style={styles.centeredContainer}>
                <Text style={styles.mutedText}>Loading scheduled game...</Text>
            </View>
        );
    }

    const hasDateTime = typeof scheduledGame.scheduledAt === 'number';
    const currentUserId = auth.currentUser?.uid || '';
    const canEditScheduled = currentUserId === team.coachId || !!team.managers?.[currentUserId];
    const canDeleteScheduled = canEditScheduled;

    return (
        <View style={styles.container}>
            <View style={styles.topAppBar}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.topAppBarTitle} numberOfLines={1}>Scheduled Game</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.mainContent} contentContainerStyle={{ paddingBottom: 44 }}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>{team.name} vs {scheduledGame.opponentName}</Text>
                    <Text style={styles.summaryMeta}>{hasDateTime ? new Date(scheduledGame.scheduledAt as number).toLocaleString() : 'Date/Time TBD'}</Text>
                    <Text style={styles.summaryMeta}>In: {yesNames.length ? yesNames.join(', ') : 'TBD'}</Text>
                    <Text style={styles.summaryMeta}>Out: {noNames.length ? noNames.join(', ') : 'None listed'}</Text>

                    <View style={styles.summaryActionsRow}>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleStart} activeOpacity={0.8}>
                            <Ionicons name="play" size={14} color={colors.primary} />
                            <Text style={styles.actionBtnText}>Start</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionBtn, !hasDateTime && styles.actionBtnDisabled]}
                            disabled={!hasDateTime}
                            onPress={handleOpenCalendar}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="calendar-outline" size={14} color={hasDateTime ? colors.primary : colors.textSecondary} />
                            <Text style={[styles.actionBtnText, !hasDateTime && styles.actionBtnTextDisabled]}>Add to Calendar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.formCard}>
                    <Text style={styles.sectionTitle}>Edit Details</Text>
                    {!canEditScheduled && (
                        <Text style={[styles.mutedText, { marginBottom: 10 }]}>Read-only view. Only coaches/managers can edit this game.</Text>
                    )}

                    <Text style={styles.label}>Opponent Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Rival University"
                        placeholderTextColor={colors.textSecondary}
                        value={opponentName}
                        onChangeText={setOpponentName}
                        editable={canEditScheduled}
                    />

                    <Text style={styles.label}>Location (Optional)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Main Turf"
                        placeholderTextColor={colors.textSecondary}
                        value={location}
                        onChangeText={setLocation}
                        editable={canEditScheduled}
                    />

                    <View style={styles.dateTimeRow}>
                        <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.8} disabled={!canEditScheduled}>
                            <Ionicons name="calendar-outline" size={17} color={colors.primary} />
                            <Text style={styles.dateTimeBtnText}>{scheduledDate ? scheduledDate.toLocaleDateString() : 'Date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.dateTimeBtn} onPress={() => setShowTimePicker(true)} activeOpacity={0.8} disabled={!canEditScheduled}>
                            <Ionicons name="time-outline" size={17} color={colors.primary} />
                            <Text style={styles.dateTimeBtnText}>{scheduledTime ? scheduledTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time'}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.dateTimeRow}>
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setScheduledDate(null)} activeOpacity={0.8} disabled={!canEditScheduled}>
                            <Text style={styles.clearBtnText}>Clear Date</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.clearBtn} onPress={() => setScheduledTime(null)} activeOpacity={0.8} disabled={!canEditScheduled}>
                            <Text style={styles.clearBtnText}>Clear Time</Text>
                        </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                        <DateTimePicker
                            value={scheduledDate || new Date(Date.now() + 60 * 60 * 1000)}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={new Date()}
                            onChange={handleDateChange}
                        />
                    )}

                    {showTimePicker && (
                        <DateTimePicker
                            value={scheduledTime || new Date()}
                            mode="time"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleTimeChange}
                        />
                    )}

                    <Text style={styles.label}>Availability</Text>
                    {playerList.length > 0 ? playerList.map((player) => {
                        const status = availability[player.id];
                        return (
                            <View key={`scheduled-edit-${player.id}`} style={styles.availabilityRow}>
                                <Text style={styles.availabilityName}>{player.name}</Text>
                                <View style={styles.availabilityControls}>
                                    <TouchableOpacity
                                        style={[styles.availabilityBtn, status === 'yes' && styles.availabilityBtnYes]}
                                        onPress={() => handleAvailability(player.id, 'yes')}
                                        disabled={!canEditScheduled}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="checkmark" size={14} color={status === 'yes' ? '#fff' : colors.success} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.availabilityBtn, status === 'no' && styles.availabilityBtnNo]}
                                        onPress={() => handleAvailability(player.id, 'no')}
                                        disabled={!canEditScheduled}
                                        activeOpacity={0.8}
                                    >
                                        <Ionicons name="close" size={14} color={status === 'no' ? '#fff' : colors.error} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    }) : (
                        <Text style={styles.mutedText}>Add players to edit availability.</Text>
                    )}

                    {!!formError && (
                        <View style={styles.errorBox}>
                            <Ionicons name="warning-outline" size={16} color={colors.error} />
                            <Text style={styles.errorText}>{formError}</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        style={[styles.saveBtn, { opacity: isSaving || !canEditScheduled ? 0.85 : 1 }]}
                        disabled={isSaving || !canEditScheduled}
                        onPress={handleSave}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.saveBtnText}>{isSaving ? 'Saving...' : 'Save Changes'}</Text>
                    </TouchableOpacity>

                    {canDeleteScheduled && (
                        <TouchableOpacity
                            style={[styles.deleteBtn, { opacity: isDeleting ? 0.85 : 1 }]}
                            disabled={isDeleting}
                            onPress={handleDelete}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="trash-outline" size={14} color={colors.error} />
                            <Text style={styles.deleteBtnText}>{isDeleting ? 'Deleting...' : 'Delete Scheduled Game'}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
        mutedText: { ...Typography.bodySmall, color: colors.textSecondary },

        topAppBar: {
            height: 60,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: Layout.padding,
            backgroundColor: colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
        topAppBarTitle: { ...Typography.title, fontSize: 18, flex: 1, textAlign: 'center' },

        mainContent: { flex: 1, paddingHorizontal: Layout.padding, paddingTop: 18 },

        summaryCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            borderWidth: 1,
            borderColor: colors.primary,
            padding: 14,
            marginBottom: 14,
            ...Layout.shadow,
        },
        summaryTitle: { ...Typography.body, fontWeight: '700', marginBottom: 4 },
        summaryMeta: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
        summaryActionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
        actionBtn: {
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
        actionBtnDisabled: {
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
        },
        actionBtnText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '700' },
        actionBtnTextDisabled: { color: colors.textSecondary },

        formCard: {
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            ...Layout.shadow,
        },
        sectionTitle: { ...Typography.subtitle, fontWeight: '700', marginBottom: 14 },
        label: { ...Typography.label, marginBottom: 7 },
        input: {
            ...Typography.body,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingHorizontal: 12,
            paddingVertical: 12,
            color: colors.text,
            marginBottom: 12,
        },
        dateTimeRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
        dateTimeBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: Layout.radiusMd,
            paddingHorizontal: 12,
            paddingVertical: 12,
        },
        dateTimeBtnText: { ...Typography.bodySmall, color: colors.text },
        clearBtn: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Layout.radiusSm,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
            paddingVertical: 8,
        },
        clearBtnText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },

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
        availabilityBtnYes: { backgroundColor: colors.success, borderColor: colors.success },
        availabilityBtnNo: { backgroundColor: colors.error, borderColor: colors.error },

        errorBox: {
            marginTop: 6,
            marginBottom: 8,
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
        errorText: { ...Typography.bodySmall, color: colors.error, flex: 1 },

        saveBtn: {
            marginTop: 8,
            backgroundColor: colors.primary,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 13,
        },
        saveBtnText: { ...Typography.button, color: colors.onPrimary },

        deleteBtn: {
            marginTop: 10,
            borderWidth: 1,
            borderColor: colors.error,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            flexDirection: 'row',
            gap: 8,
            backgroundColor: colors.errorBg,
        },
        deleteBtnText: { ...Typography.bodySmall, color: colors.error, fontWeight: '700' },
    });
};
