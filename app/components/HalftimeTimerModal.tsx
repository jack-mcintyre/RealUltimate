import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { getTypography, Layout, Spacing } from '../theme/DesignSystem';
import { useTheme } from '../theme/ThemeContext';
import TactilePressable from './TactilePressable';

// Lazy require expo-notifications so the bundle still ships if it's removed
// from a sub-target. If absent, we degrade to an in-app `Alert`.
let Notifications: any = null;
try {
    Notifications = require('expo-notifications');
} catch {
    Notifications = null;
}

const STORAGE_PREFIX = 'realultimate.halftime.v1.';

const ensureAndroidChannel = async () => {
    if (!Notifications || Platform.OS !== 'android') return;
    try {
        await Notifications.setNotificationChannelAsync('halftime', {
            name: 'Halftime alerts',
            importance: Notifications.AndroidImportance?.HIGH ?? 4,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#991B1B',
        });
    } catch {
        // ignore
    }
};

const ensurePermissions = async (): Promise<boolean> => {
    if (!Notifications) return false;
    try {
        const settings = await Notifications.getPermissionsAsync();
        if (settings?.granted) return true;
        const req = await Notifications.requestPermissionsAsync();
        return !!req?.granted;
    } catch {
        return false;
    }
};

const scheduleHalftimeEnd = async (gameId: string, fireAtMs: number): Promise<string | null> => {
    if (!Notifications) return null;
    try {
        await ensureAndroidChannel();
        const seconds = Math.max(1, Math.round((fireAtMs - Date.now()) / 1000));
        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Halftime is over',
                body: 'Resume the game when both lines are ready.',
                sound: 'default',
                data: { type: 'halftime_end', gameId },
            },
            trigger: { seconds, channelId: 'halftime' },
        });
        return id || null;
    } catch {
        return null;
    }
};

const cancelScheduled = async (id: string | null) => {
    if (!Notifications || !id) return;
    try {
        await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
        // ignore
    }
};

const formatMmSs = (totalMs: number): string => {
    const safe = Math.max(0, totalMs);
    const totalSec = Math.ceil(safe / 1000);
    const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const ss = (totalSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
};

interface PersistedTimer {
    endAt: number;
    notificationId: string | null;
}

export interface HalftimeTimerModalProps {
    visible: boolean;
    /** Stable key (game id) used for local persistence so a process kill is recoverable. */
    gameId: string;
    /** Default minutes when no prior config exists. Defaults to 10. */
    defaultMinutes?: number;
    onClose: () => void;
    /**
     * Called when the user taps the START button — host should fire its existing
     * `recordEvent('Halftime')` once so the underlying game-state transition still
     * happens. The modal will keep showing the live countdown until close/end.
     */
    onStartHalftime?: () => void;
    /**
     * Called when timer reaches zero (foreground). Host can show its own banner;
     * a local notification is also scheduled for background delivery.
     */
    onTimerEnded?: () => void;
    onTimerStateChange?: (state: { isRunning: boolean; isEnded: boolean; display: string }) => void;
}

/**
 * HalftimeTimerModal — configurable countdown with local notification.
 *
 * Timer state contract:
 *  - User adjusts MM:SS via +/- steppers (1 / 5 / 30s increments).
 *  - START schedules a notification at endAt and persists `{ endAt, notificationId }`
 *    keyed by gameId in AsyncStorage so a brief process kill can be recovered on next mount.
 *  - +1 MIN extends the timer by 60s; the prior notification is cancelled and a new one scheduled.
 *  - CANCEL cancels notification and clears persistence.
 *  - On reaching 0 in foreground, `onTimerEnded` fires and an Alert is shown.
 *  - The notification will still deliver in background regardless of foreground state.
 */
export const HalftimeTimerModal: React.FC<HalftimeTimerModalProps> = ({
    visible,
    gameId,
    defaultMinutes = 10,
    onClose,
    onStartHalftime,
    onTimerEnded,
    onTimerStateChange,
}) => {
    const { colors } = useTheme();
    const Typography = getTypography(colors);
    const styles = useMemo(() => buildStyles(colors), [colors]);

    const [minutes, setMinutes] = useState(defaultMinutes);
    const [seconds, setSeconds] = useState(0);
    const [endAt, setEndAt] = useState<number | null>(null);
    const [now, setNow] = useState<number>(Date.now());
    const [notificationId, setNotificationId] = useState<string | null>(null);
    const [endedAlertShown, setEndedAlertShown] = useState(false);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const storageKey = `${STORAGE_PREFIX}${gameId || 'default'}`;

    // Restore persisted timer on mount or when gameId changes.
    useEffect(() => {
        let alive = true;
        AsyncStorage.getItem(storageKey)
            .then((raw) => {
                if (!alive || !raw) return;
                try {
                    const parsed = JSON.parse(raw) as PersistedTimer;
                    if (parsed?.endAt && parsed.endAt > Date.now()) {
                        setEndAt(parsed.endAt);
                        setNotificationId(parsed.notificationId || null);
                    } else {
                        AsyncStorage.removeItem(storageKey).catch(() => {});
                    }
                } catch {
                    /* ignore */
                }
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [storageKey]);

    // Tick while the timer is running.
    useEffect(() => {
        if (endAt === null) {
            if (tickRef.current) clearInterval(tickRef.current);
            tickRef.current = null;
            return;
        }
        setNow(Date.now());
        tickRef.current = setInterval(() => setNow(Date.now()), 500);
        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            tickRef.current = null;
        };
    }, [endAt]);

    // Re-tick when the app foregrounds so the display catches up after suspension.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (s) => {
            if (s === 'active') setNow(Date.now());
        });
        return () => sub.remove();
    }, []);

    // Foreground "ended" detection.
    const remainingMs = endAt !== null ? endAt - now : null;
    useEffect(() => {
        if (endAt !== null && remainingMs !== null && remainingMs <= 0 && !endedAlertShown) {
            setEndedAlertShown(true);
            onTimerEnded?.();
            Alert.alert('Halftime over', 'Time to resume the game.');
            AsyncStorage.removeItem(storageKey).catch(() => {});
        }
    }, [endAt, remainingMs, endedAlertShown, onTimerEnded, storageKey]);

    const adjust = useCallback((deltaSec: number) => {
        if (endAt !== null) return; // can't edit while running
        const totalSec = Math.max(10, Math.min(60 * 60, minutes * 60 + seconds + deltaSec));
        setMinutes(Math.floor(totalSec / 60));
        setSeconds(totalSec % 60);
    }, [minutes, seconds, endAt]);

    const handleStart = useCallback(async () => {
        const totalMs = (minutes * 60 + seconds) * 1000;
        if (totalMs < 1000) return;
        const granted = await ensurePermissions();
        const target = Date.now() + totalMs;
        const newId = granted ? await scheduleHalftimeEnd(gameId, target) : null;
        if (!granted) {
            Alert.alert(
                'Notifications off',
                'Background alert won\'t fire — open the app to see when halftime ends.'
            );
        }
        setEndAt(target);
        setNotificationId(newId);
        setEndedAlertShown(false);
        await AsyncStorage.setItem(storageKey, JSON.stringify({ endAt: target, notificationId: newId } as PersistedTimer)).catch(() => {});
        onStartHalftime?.();
    }, [minutes, seconds, gameId, storageKey, onStartHalftime]);

    const handleExtend = useCallback(async () => {
        if (endAt === null) return;
        await cancelScheduled(notificationId);
        const newEnd = Math.max(Date.now() + 60 * 1000, endAt + 60 * 1000);
        const newId = await scheduleHalftimeEnd(gameId, newEnd);
        setEndAt(newEnd);
        setNotificationId(newId);
        setEndedAlertShown(false);
        await AsyncStorage.setItem(storageKey, JSON.stringify({ endAt: newEnd, notificationId: newId } as PersistedTimer)).catch(() => {});
    }, [endAt, notificationId, gameId, storageKey]);

    const handleCancel = useCallback(async () => {
        await cancelScheduled(notificationId);
        setEndAt(null);
        setNotificationId(null);
        setEndedAlertShown(false);
        await AsyncStorage.removeItem(storageKey).catch(() => {});
    }, [notificationId, storageKey]);

    const isRunning = endAt !== null && (remainingMs ?? 0) > 0;
    const isEnded = endAt !== null && (remainingMs ?? 0) <= 0;

    const display = (() => {
        if (endAt === null) return formatMmSs((minutes * 60 + seconds) * 1000);
        return formatMmSs(Math.max(0, remainingMs || 0));
    })();

    useEffect(() => {
        onTimerStateChange?.({ isRunning, isEnded, display });
    }, [display, isRunning, isEnded, onTimerStateChange]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <View style={styles.headerRow}>
                        <Ionicons name="hourglass-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={[Typography.label, { color: colors.primary }]}>HALFTIME TIMER</Text>
                        <View style={{ flex: 1 }} />
                        <TactilePressable onPress={onClose} haptic="selection" style={styles.closeBtn}>
                            <Ionicons name="close" size={20} color={colors.textSecondary} />
                        </TactilePressable>
                    </View>

                    <Text style={styles.bigTime}>{display}</Text>
                    {isRunning && (
                        <Text style={styles.subText}>{"Timer running. Lock or background - we'll notify you."}</Text>
                    )}
                    {isEnded && (
                        <Text style={[styles.subText, { color: colors.live }]}>{"Time's up. Resume when both lines are ready."}</Text>
                    )}
                    {!isRunning && !isEnded && (
                        <Text style={styles.subText}>{"Set a duration, then start. We'll send a notification when it ends."}</Text>
                    )}

                    {!isRunning && !isEnded && (
                        <View style={styles.stepperRow}>
                            <View style={styles.stepperGroup}>
                                <Text style={styles.stepperLabel}>MIN</Text>
                                <View style={styles.stepperBtnRow}>
                                    <TactilePressable haptic="selection" onPress={() => adjust(-60)} style={styles.stepBtn}>
                                        <Ionicons name="remove" size={18} color={colors.text} />
                                    </TactilePressable>
                                    <Text style={styles.stepperValue}>{minutes}</Text>
                                    <TactilePressable haptic="selection" onPress={() => adjust(60)} style={styles.stepBtn}>
                                        <Ionicons name="add" size={18} color={colors.text} />
                                    </TactilePressable>
                                </View>
                            </View>
                            <View style={styles.stepperGroup}>
                                <Text style={styles.stepperLabel}>SEC</Text>
                                <View style={styles.stepperBtnRow}>
                                    <TactilePressable haptic="selection" onPress={() => adjust(-15)} style={styles.stepBtn}>
                                        <Ionicons name="remove" size={18} color={colors.text} />
                                    </TactilePressable>
                                    <Text style={styles.stepperValue}>{seconds.toString().padStart(2, '0')}</Text>
                                    <TactilePressable haptic="selection" onPress={() => adjust(15)} style={styles.stepBtn}>
                                        <Ionicons name="add" size={18} color={colors.text} />
                                    </TactilePressable>
                                </View>
                            </View>
                        </View>
                    )}

                    <View style={styles.actionRow}>
                        {!isRunning && !isEnded && (
                            <TactilePressable haptic="medium" onPress={handleStart} style={[styles.primaryBtn, { backgroundColor: colors.primary }]}>
                                <Ionicons name="play" size={18} color={colors.onPrimary} style={{ marginRight: 8 }} />
                                <Text style={[Typography.button, styles.primaryBtnText, { color: colors.onPrimary }]}>Start halftime</Text>
                            </TactilePressable>
                        )}
                        {isRunning && (
                            <>
                                <TactilePressable haptic="light" onPress={handleExtend} style={[styles.secondaryBtn, { borderColor: colors.primary }]}>
                                    <Ionicons name="add" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                                    <Text style={[Typography.button, { color: colors.primary, fontSize: 14 }]}>+1 min</Text>
                                </TactilePressable>
                                <TactilePressable haptic="warning" onPress={handleCancel} style={[styles.secondaryBtn, { borderColor: colors.live }]}>
                                    <Ionicons name="stop" size={16} color={colors.live} style={{ marginRight: 6 }} />
                                    <Text style={[Typography.button, { color: colors.live, fontSize: 14 }]}>Cancel timer</Text>
                                </TactilePressable>
                            </>
                        )}
                        {isEnded && (
                            <TactilePressable haptic="success" onPress={async () => { await handleCancel(); onClose(); }} style={[styles.primaryBtn, { backgroundColor: colors.live }]}>
                                <Text style={[Typography.button, { color: colors.onLive }]}>Dismiss</Text>
                            </TactilePressable>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const buildStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
    StyleSheet.create({
        overlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.lg,
        },
        card: {
            width: '100%',
            maxWidth: 420,
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusXl,
            padding: Spacing.xl,
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
        },
        headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
        closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
        bigTime: {
            fontSize: 64,
            fontWeight: '900',
            color: colors.text,
            textAlign: 'center',
            letterSpacing: 4,
            marginVertical: Spacing.sm,
            fontVariant: ['tabular-nums'],
        },
        subText: { color: colors.textSecondary, textAlign: 'center', fontSize: 13, marginBottom: Spacing.lg },
        stepperRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: Spacing.lg },
        stepperGroup: { alignItems: 'center', gap: Spacing.xs },
        stepperLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
        stepperBtnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
        stepBtn: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
        },
        stepperValue: { fontSize: 28, fontWeight: '800', color: colors.text, minWidth: 48, textAlign: 'center', fontVariant: ['tabular-nums'] },
        actionRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'stretch' },
        primaryBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 52,
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderRadius: Layout.radiusMd,
        },
        primaryBtnText: { flexShrink: 1, textAlign: 'center' },
        secondaryBtn: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
        },
    });

export default HalftimeTimerModal;
