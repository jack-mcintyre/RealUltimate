import { get, push, ref, set } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { SafetyReport, SafetyReportTargetType, UserBlock } from './types';

export const SafetyService = {
    reportContent: async (
        report: Omit<SafetyReport, 'id' | 'createdAt' | 'status'>
    ): Promise<string> => {
        const reportsRef = push(ref(db, 'safetyReports'));
        if (!reportsRef.key) throw new Error('Could not create safety report.');

        const payload: SafetyReport = {
            ...report,
            id: reportsRef.key,
            reason: report.reason.trim().slice(0, 120),
            details: report.details?.trim().slice(0, 1000) || '',
            status: 'open',
            createdAt: Date.now(),
        };

        await set(reportsRef, payload);
        return reportsRef.key;
    },

    blockUser: async (
        currentUid: string,
        blockedUid: string,
        source?: SafetyReportTargetType
    ): Promise<void> => {
        if (!currentUid || !blockedUid || currentUid === blockedUid) {
            throw new Error('Invalid block target.');
        }

        const payload: UserBlock = {
            blockedUid,
            createdAt: Date.now(),
            ...(source ? { source } : {}),
        };
        await set(ref(db, `userBlocks/${currentUid}/${blockedUid}`), payload);
    },

    unblockUser: async (currentUid: string, blockedUid: string): Promise<void> => {
        await set(ref(db, `userBlocks/${currentUid}/${blockedUid}`), null);
    },

    isBlocked: async (currentUid: string, blockedUid: string): Promise<boolean> => {
        const snapshot = await get(ref(db, `userBlocks/${currentUid}/${blockedUid}`));
        return snapshot.exists();
    },
};
