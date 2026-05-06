import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { push, ref, set } from 'firebase/database';
import { auth, db } from '../../firebaseConfig';
import { UserFeedback } from './types';

const QUOTA_STORAGE_KEY = 'realultimate.feedbackClientQuota.v1';
const MIN_INTERVAL_MS = 90_000;
const MAX_SUBMISSIONS_PER_LOCAL_DAY = 8;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;

type QuotaState = {
    /** UTC calendar date YYYY-MM-DD used for daily cap */
    dayKey: string;
    count: number;
    lastSubmitAt: number;
};

function utcDayKey(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

function sanitizeMessage(raw: string): string {
    const trimmed = raw.trim().replace(/\r\n/g, '\n');
    return trimmed.replace(/\n{6,}/g, '\n\n\n\n\n').slice(0, MESSAGE_MAX);
}

function isPlausibleEmail(s: string): boolean {
    const t = s.trim();
    if (t.length < 3 || t.length > 320) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

async function readQuota(): Promise<QuotaState> {
    const now = Date.now();
    const dayKey = utcDayKey(now);
    try {
        const raw = await AsyncStorage.getItem(QUOTA_STORAGE_KEY);
        if (!raw) return { dayKey, count: 0, lastSubmitAt: 0 };
        const parsed = JSON.parse(raw) as Partial<QuotaState>;
        const base: QuotaState = {
            dayKey: typeof parsed.dayKey === 'string' ? parsed.dayKey : dayKey,
            count: typeof parsed.count === 'number' && parsed.count >= 0 ? parsed.count : 0,
            lastSubmitAt: typeof parsed.lastSubmitAt === 'number' ? parsed.lastSubmitAt : 0,
        };
        if (base.dayKey !== dayKey) {
            return { dayKey, count: 0, lastSubmitAt: base.lastSubmitAt };
        }
        return base;
    } catch {
        return { dayKey, count: 0, lastSubmitAt: 0 };
    }
}

async function writeQuota(q: QuotaState): Promise<void> {
    await AsyncStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(q));
}

export const FeedbackService = {
    MESSAGE_MIN,
    MESSAGE_MAX,
    MIN_INTERVAL_MS,
    MAX_SUBMISSIONS_PER_LOCAL_DAY,

    /**
     * Submits feedback to Realtime Database (userFeedback). Requires sign-in.
     * Server rules enforce schema; this layer adds client rate limits (interval + daily cap).
     * To receive email alerts, use Firebase Console extensions, Cloud Functions, or export from DB — never put SMTP/API keys in the app.
     */
    submitFeedback: async (message: string, options?: { contactEmail?: string }): Promise<string> => {
        const user = auth.currentUser;
        if (!user) throw new Error('You must be signed in to send feedback.');

        const body = sanitizeMessage(message);
        if (body.length < MESSAGE_MIN) {
            throw new Error(`Please enter at least ${MESSAGE_MIN} characters.`);
        }

        const contact = (options?.contactEmail || '').trim();
        if (contact && !isPlausibleEmail(contact)) {
            throw new Error('Optional contact email does not look valid.');
        }

        const now = Date.now();
        const q = await readQuota();
        if (q.lastSubmitAt > 0 && now - q.lastSubmitAt < MIN_INTERVAL_MS) {
            const waitSec = Math.ceil((MIN_INTERVAL_MS - (now - q.lastSubmitAt)) / 1000);
            throw new Error(`Please wait ${waitSec}s before sending another message.`);
        }
        if (q.count >= MAX_SUBMISSIONS_PER_LOCAL_DAY) {
            throw new Error('You have reached the daily limit for feedback. Try again tomorrow.');
        }

        const entryRef = push(ref(db, 'userFeedback'));
        const id = entryRef.key;
        if (!id) throw new Error('Could not create feedback entry.');

        const appVersion =
            (typeof Constants.expoConfig?.version === 'string' && Constants.expoConfig.version) ||
            (typeof Constants.nativeAppVersion === 'string' && Constants.nativeAppVersion) ||
            'unknown';
        const platform =
            Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : Platform.OS;

        const payload: UserFeedback = {
            id,
            submitterUid: user.uid,
            message: body,
            createdAt: now,
            appVersion: appVersion.slice(0, 64),
            platform: platform.slice(0, 24),
            ...(contact ? { contactEmail: contact.slice(0, 320) } : {}),
        };

        await set(entryRef, payload);

        const dayKey = utcDayKey(now);
        await writeQuota({
            dayKey,
            count: (q.dayKey === dayKey ? q.count : 0) + 1,
            lastSubmitAt: now,
        });

        return id;
    },
};
