import { ScheduledAvailabilityStatus } from './types';

export const SCHEDULE_LIMITS = Object.freeze({
    opponentNameMax: 72,
    locationMax: 120,
});

const normalizeText = (value: string): string => (value || '').replace(/\s+/g, ' ').trim();

type ScheduleValidationSuccess = {
    ok: true;
    opponentName: string;
    location: string;
    scheduledAt?: number;
};

type ScheduleValidationFailure = {
    ok: false;
    error: string;
};

export type ScheduleValidationResult = ScheduleValidationSuccess | ScheduleValidationFailure;

export const isFutureScheduledTimestamp = (scheduledAt: number, nowMs = Date.now()): boolean => {
    return Number.isFinite(scheduledAt) && scheduledAt > nowMs;
};

export const validateScheduledGameDraft = (params: {
    opponentName: string;
    location?: string;
    scheduleDate: Date | null;
    scheduleTime: Date | null;
    nowMs?: number;
}): ScheduleValidationResult => {
    const nowMs = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
    const opponentName = normalizeText(params.opponentName);
    const location = normalizeText(params.location || '');

    if (!opponentName) {
        return { ok: false, error: 'Opponent name is required.' };
    }
    if (opponentName.length > SCHEDULE_LIMITS.opponentNameMax) {
        return { ok: false, error: `Opponent name must be ${SCHEDULE_LIMITS.opponentNameMax} characters or fewer.` };
    }
    if (location.length > SCHEDULE_LIMITS.locationMax) {
        return { ok: false, error: `Location must be ${SCHEDULE_LIMITS.locationMax} characters or fewer.` };
    }

    if (!params.scheduleDate && params.scheduleTime) {
        return { ok: false, error: 'Select a date before setting a time, or clear time for TBD.' };
    }

    let scheduledAt: number | undefined;
    if (params.scheduleDate) {
        const merged = new Date(params.scheduleDate);
        if (params.scheduleTime) {
            merged.setHours(params.scheduleTime.getHours(), params.scheduleTime.getMinutes(), 0, 0);
        } else {
            merged.setHours(23, 59, 0, 0);
        }

        scheduledAt = merged.getTime();
        if (!isFutureScheduledTimestamp(scheduledAt, nowMs)) {
            return { ok: false, error: 'Scheduled games must be in the future.' };
        }
    }

    return {
        ok: true,
        opponentName,
        location,
        ...(typeof scheduledAt === 'number' ? { scheduledAt } : {}),
    };
};

export const sanitizeAvailability = (
    availability: Record<string, ScheduledAvailabilityStatus> | undefined,
    validPlayerIds?: string[]
): Record<string, ScheduledAvailabilityStatus> => {
    const sanitized: Record<string, ScheduledAvailabilityStatus> = {};
    const allowed = validPlayerIds?.length ? new Set(validPlayerIds) : null;

    Object.entries(availability || {}).forEach(([playerId, status]) => {
        if (status !== 'yes' && status !== 'no') return;
        if (allowed && !allowed.has(playerId)) return;
        sanitized[playerId] = status;
    });

    return sanitized;
};
