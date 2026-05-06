import { deleteUser, User } from 'firebase/auth';
import { ref, remove, set, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { NotificationService } from './NotificationService';

export const AccountService = {
    requestAndDeleteAccount: async (user: User): Promise<void> => {
        const uid = user.uid;
        const requestedAt = Date.now();

        await set(ref(db, `users/${uid}/accountDeletion`), {
            requestedAt,
            status: 'client_requested',
            email: user.email || '',
        });

        await NotificationService.updatePreferences(uid, {
            pushSetting: 'off',
            liveActivitiesEnabled: false,
            milestoneAlertsEnabled: false,
            comebackAlertsEnabled: false,
            tournamentAlertsEnabled: false,
        }).catch(() => { /* best effort before account removal */ });

        await remove(ref(db, `users/${uid}/deviceTokens`)).catch(() => { /* best effort */ });
        await update(ref(db, `users/${uid}/profile`), {
            deletedAt: requestedAt,
            displayName: 'Deleted User',
            publicProfile: null,
            activeTeamId: null,
            activeRole: null,
        });

        await deleteUser(user);
    },
};
