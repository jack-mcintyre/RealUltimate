import { get, push, ref, set, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { NotificationPreferences, NotificationTeamPreference, UserDeviceToken } from './types';

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
    pushSetting: 'game',
    liveActivitiesEnabled: true,
    milestoneAlertsEnabled: true,
    comebackAlertsEnabled: true,
    tournamentAlertsEnabled: true,
    teamPreferences: {},
};

export type NotificationEventType =
    | 'game_start'
    | 'score'
    | 'final'
    | 'milestone'
    | 'comeback'
    | 'tournament_update'
    | 'live_activity';

export type NotificationEventPayload = {
    type: NotificationEventType;
    teamId?: string;
    gameId?: string;
    tournamentId?: string;
    playerId?: string;
    title: string;
    body: string;
    createdAt?: number;
    data?: Record<string, string | number | boolean>;
};

export const NotificationService = {
    getDefaultPreferences: () => DEFAULT_NOTIFICATION_PREFERENCES,

    saveDeviceToken: async (
        userId: string,
        token: string,
        platform: UserDeviceToken['platform'] = 'unknown',
        appVersion?: string
    ) => {
        const trimmed = token.trim();
        if (!trimmed) throw new Error('Push token is required.');

        const tokenKey = trimmed.replace(/[.#$/\[\]]/g, '_');
        const payload: UserDeviceToken = {
            token: trimmed,
            platform,
            updatedAt: Date.now(),
            ...(appVersion ? { appVersion } : {}),
        };

        await set(ref(db, `users/${userId}/deviceTokens/${tokenKey}`), payload);
    },

    updatePreferences: async (
        userId: string,
        preferences: Partial<NotificationPreferences>
    ) => {
        await update(ref(db, `users/${userId}/profile/notificationPreferences`), preferences);

        if (preferences.pushSetting) {
            await set(ref(db, `users/${userId}/profile/pushSetting`), preferences.pushSetting);
        }
    },

    updateTeamPreference: async (
        userId: string,
        teamId: string,
        preference: NotificationTeamPreference
    ) => {
        await set(ref(db, `users/${userId}/profile/notificationPreferences/teamPreferences/${teamId}`), preference);
    },

    shouldQueueForUser: async (
        userId: string,
        event: NotificationEventPayload
    ) => {
        const profileSnap = await get(ref(db, `users/${userId}/profile`));
        const profile = profileSnap.exists() ? profileSnap.val() : {};
        const preferences: NotificationPreferences = {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...(profile.notificationPreferences || {}),
            ...(profile.pushSetting ? { pushSetting: profile.pushSetting } : {}),
        };

        if (preferences.pushSetting === 'off') return false;

        const teamPreference = event.teamId
            ? preferences.teamPreferences?.[event.teamId]
            : undefined;
        if (teamPreference?.enabled === false) return false;
        if (event.type === 'live_activity' && (preferences.liveActivitiesEnabled === false || teamPreference?.liveActivityEnabled === false)) return false;
        if (event.type === 'milestone' && preferences.milestoneAlertsEnabled === false) return false;
        if (event.type === 'comeback' && preferences.comebackAlertsEnabled === false) return false;
        if (event.type === 'tournament_update' && preferences.tournamentAlertsEnabled === false) return false;
        if (event.type === 'score' && preferences.pushSetting === 'game') return false;
        if (event.type === 'score' && teamPreference?.scoreAlerts === 'off') return false;
        if (event.type === 'score' && teamPreference?.scoreAlerts === 'finals') return false;
        if (event.playerId && teamPreference?.playerFilters?.length && !teamPreference.playerFilters.includes(event.playerId)) return false;

        return true;
    },

    queueEvent: async (event: NotificationEventPayload) => {
        const eventRef = push(ref(db, 'notificationQueue'));
        if (!eventRef.key) throw new Error('Could not create notification event.');

        const payload: NotificationEventPayload = {
            ...event,
            createdAt: event.createdAt || Date.now(),
        };

        await set(eventRef, payload);
        return eventRef.key;
    },
};
