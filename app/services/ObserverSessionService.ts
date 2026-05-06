import { get, ref, set, update } from 'firebase/database';
import { auth, db } from '../../firebaseConfig';
import { signInAnonymously } from 'firebase/auth';
import { GameState, Team } from './types';

export type ObserverRecordingScope = 'team' | 'both';

export interface ObserverRecordingSession {
    pin: string;
    gameId: string;
    teamId: string;
    createdByUid: string;
    scope: ObserverRecordingScope;
    status: 'active' | 'claimed' | 'revoked' | 'expired';
    createdAt: number;
    expiresAt: number;
    activeUid?: string;
}

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

const createUniquePin = async () => {
    for (let i = 0; i < 25; i++) {
        const pin = generatePin();
        const snap = await get(ref(db, `observerSessionPins/${pin}`));
        if (!snap.exists()) return pin;
    }
    throw new Error('Could not create observer PIN.');
};

const requireSignedInUid = async () => {
    if (auth.currentUser?.uid) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
};

export const ObserverSessionService = {
    createSession: async (game: GameState, team: Team, coachUid: string, scope: ObserverRecordingScope): Promise<ObserverRecordingSession> => {
        if (!game.gameId || !team?.id) throw new Error('Active game required.');
        const isCoach = team.coachId === coachUid;
        const isManager = !!team.managers?.[coachUid];
        if (!isCoach && !isManager) throw new Error('Only team coaches/managers can delegate recording.');

        const pin = await createUniquePin();
        const now = Date.now();
        const session: ObserverRecordingSession = {
            pin,
            gameId: game.gameId,
            teamId: team.id,
            createdByUid: coachUid,
            scope,
            status: 'active',
            createdAt: now,
            expiresAt: now + SESSION_TTL_MS,
        };

        await set(ref(db, `gameObserverSessions/${game.gameId}/${pin}`), session);
        await set(ref(db, `observerSessionPins/${pin}`), {
            gameId: game.gameId,
            teamId: team.id,
            scope,
            status: 'active',
            expiresAt: session.expiresAt,
        });
        await update(ref(db, `games/${game.gameId}`), {
            activeObserverSessionPin: pin,
            recordingLockOwner: 'coach',
        });

        return session;
    },

    joinByPin: async (rawPin: string): Promise<{ session: ObserverRecordingSession; uid: string }> => {
        const pin = rawPin.replace(/\D/g, '').slice(0, 6);
        if (pin.length !== 6) throw new Error('Enter the 6-digit observer PIN.');

        const uid = await requireSignedInUid();
        const pinSnap = await get(ref(db, `observerSessionPins/${pin}`));
        if (!pinSnap.exists()) throw new Error('Observer PIN not found.');
        const lookup = pinSnap.val() as Pick<ObserverRecordingSession, 'gameId' | 'teamId' | 'scope' | 'status' | 'expiresAt'>;
        if (lookup.status !== 'active' && lookup.status !== 'claimed') throw new Error('This observer PIN is no longer active.');
        if (lookup.expiresAt <= Date.now()) throw new Error('This observer PIN has expired.');

        const sessionRef = ref(db, `gameObserverSessions/${lookup.gameId}/${pin}`);
        const sessionSnap = await get(sessionRef);
        if (!sessionSnap.exists()) throw new Error('Observer session not found.');
        const session = sessionSnap.val() as ObserverRecordingSession;

        await update(sessionRef, { activeUid: uid, status: 'claimed' });
        await update(ref(db, `observerSessionPins/${pin}`), { activeUid: uid, status: 'claimed' });
        await update(ref(db, `games/${lookup.gameId}`), {
            currentRecorderId: uid,
            delegatedRecorderUid: uid,
            delegatedRecordingScope: lookup.scope,
            recordingLockOwner: 'observer',
            activeObserverSessionPin: pin,
        });

        return { session: { ...session, activeUid: uid, status: 'claimed' }, uid };
    },
};
