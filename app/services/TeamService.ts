import { get, onValue, push, ref, set, runTransaction } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameService } from './GameService';
import { isFutureScheduledTimestamp, sanitizeAvailability, SCHEDULE_LIMITS } from './scheduleValidation';
import { Player, PlayerPosition, PlayerPrimaryLine, ScheduledGame, Team, TeamJoinCodes, TeamGameLink, TeamPageConfig } from './types';

const TEAM_LIMITS = Object.freeze({
    nameMin: 2,
    nameMax: 64,
});

const normalizeTeamName = (value: string): string => {
    return (value || '').replace(/\s+/g, ' ').trim();
};

export const sanitizeForFirebase = (value: any): any => {
    if (value === undefined) return undefined;
    if (value === null) return null;

    if (Array.isArray(value)) {
        return value
            .map((entry) => sanitizeForFirebase(entry))
            .filter((entry) => entry !== undefined);
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value)
            .map(([key, entry]) => [key, sanitizeForFirebase(entry)] as const)
            .filter(([, entry]) => entry !== undefined);
        return Object.fromEntries(entries);
    }

    return value;
};

// Helper to generate a random 6-character access code
const generateAccessCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const generateUniqueAccessCode = async (excludeCode?: string): Promise<string> => {
    for (let attempt = 0; attempt < 25; attempt++) {
        const next = generateAccessCode();
        if (excludeCode && next === excludeCode) {
            continue;
        }

        const snapshot = await get(ref(db, `accessCodes/${next}`));
        if (!snapshot.exists()) {
            return next;
        }
    }

    throw new Error('Failed to generate unique access code');
};

const generateUniquePlayerClaimCode = async (): Promise<string> => {
    for (let attempt = 0; attempt < 25; attempt++) {
        const next = generateAccessCode();
        const snapshot = await get(ref(db, `playerClaimCodes/${next}`));
        if (!snapshot.exists()) {
            return next;
        }
    }

    throw new Error('Failed to generate unique player claim code');
};

export const TeamService = {
    createTeam: async (teamName: string, coachId: string, coachEmail: string, coachDisplayName?: string): Promise<string> => {
        try {
            const normalizedTeamName = normalizeTeamName(teamName);
            if (normalizedTeamName.length < TEAM_LIMITS.nameMin) {
                throw new Error(`Team name must be at least ${TEAM_LIMITS.nameMin} characters.`);
            }
            if (normalizedTeamName.length > TEAM_LIMITS.nameMax) {
                throw new Error(`Team name must be ${TEAM_LIMITS.nameMax} characters or fewer.`);
            }

            // Push new team to get ID
            const teamsRef = ref(db, 'teams');
            const newTeamRef = push(teamsRef);
            const teamId = newTeamRef.key;

            if (!teamId) throw new Error("Failed to generate team ID");

            const accessCode = await generateUniqueAccessCode();
            const spectatorCode = await generateUniqueAccessCode(accessCode);
            const observerCode = await generateUniqueAccessCode(accessCode);

            const newTeam: Team = {
                id: teamId,
                coachId,
                name: normalizedTeamName,
                players: {},
                managers: {
                    [coachId]: {
                        email: coachEmail,
                        role: 'Head Coach',
                        ...(coachDisplayName?.trim() ? { displayName: coachDisplayName.trim() } : {}),
                    }
                }
            };

            await set(newTeamRef, newTeam);

            // Map access code -> { teamId, role }
            await set(ref(db, `accessCodes/${accessCode}`), { teamId, role: 'coach' });
            await set(ref(db, `accessCodes/${spectatorCode}`), { teamId, role: 'spectator' });
            await set(ref(db, `accessCodes/${observerCode}`), { teamId, role: 'observer' });
            await set(ref(db, `teamJoinCodes/${teamId}`), { coach: accessCode, spectator: spectatorCode, observer: observerCode } as TeamJoinCodes);

            // Automatically add to user's coached list
            await set(ref(db, `users/${coachId}/coached_teams/${teamId}`), true);

            return teamId;
        } catch (error) {
            console.error("Error creating team:", error);
            throw error;
        }
    },

    joinTeamByCode: async (
        accessCode: string,
        userId: string,
        userEmail: string,
        userDisplayName?: string
    ): Promise<{ teamId: string, role: string } | null> => {
        const accessCodeRef = ref(db, `accessCodes/${accessCode}`);
        const snapshot = await get(accessCodeRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            
            const listType = data.role === 'coach' ? 'coached_teams' : 'spectated_teams';
            await set(ref(db, `users/${userId}/${listType}/${data.teamId}`), true);

            if (data.role === 'coach') {
                await set(ref(db, `teams/${data.teamId}/managers/${userId}`), {
                    email: userEmail,
                    role: 'Assistant Coach',
                    ...(userDisplayName?.trim() ? { displayName: userDisplayName.trim() } : {}),
                });
            }

            return data;
        }
        return null;
    },

    searchTeams: async (queryText: string): Promise<{ id: string, name: string }[]> => {
        if (!queryText || queryText.length < 2) return [];
        const normalized = queryText.toLowerCase().trim();
        const teamsRef = ref(db, 'teams');
        const snapshot = await get(teamsRef);
        if (!snapshot.exists()) return [];
        
        const data = snapshot.val();
        const results: { id: string, name: string }[] = [];
        
        Object.entries(data).forEach(([id, team]: [string, any]) => {
            if (team.name && team.name.toLowerCase().includes(normalized)) {
                results.push({ id, name: team.name });
            }
        });
        
        return results.slice(0, 10);
    },

    searchPublicTeams: async (queryText: string): Promise<Team[]> => {
        if (!queryText || queryText.length < 2) return [];
        const normalized = queryText.toLowerCase().trim();
        const teamsRef = ref(db, 'teams');
        const snapshot = await get(teamsRef);
        if (!snapshot.exists()) return [];
        
        const data = snapshot.val();
        const results: Team[] = [];
        
        Object.entries(data).forEach(([id, team]: [string, any]) => {
            // Include teams unless they are explicitly set to private
            if (team.pageConfig?.settings?.isPublic !== false) {
                if (team.name && team.name.toLowerCase().includes(normalized)) {
                    results.push({ ...team, id });
                }
            }
        });
        
        return results.slice(0, 10);
    },

    followTeam: async (teamId: string, userId: string) => {
        await set(ref(db, `users/${userId}/spectated_teams/${teamId}`), true);
        const teamRef = ref(db, `teams/${teamId}/fanCount`);
        await runTransaction(teamRef, (currentCount) => {
            return (currentCount || 0) + 1;
        });
    },

    unfollowTeam: async (teamId: string, userId: string) => {
        await set(ref(db, `users/${userId}/spectated_teams/${teamId}`), null);
        const teamRef = ref(db, `teams/${teamId}/fanCount`);
        await runTransaction(teamRef, (currentCount) => {
            const next = (currentCount || 0) - 1;
            return next < 0 ? 0 : next;
        });
    },

    subscribeToSpectatorStatus: (teamId: string, userId: string, callback: (isSpectator: boolean) => void) => {
        const specRef = ref(db, `users/${userId}/spectated_teams/${teamId}`);
        return onValue(specRef, (snapshot) => {
            callback(!!snapshot.val());
        });
    },

    lookupTeamByAccessCode: async (accessCode: string): Promise<Team | null> => {
        const accessCodeRef = ref(db, `accessCodes/${accessCode}`);
        const snapshot = await get(accessCodeRef);
        if (!snapshot.exists()) return null;

        const data = snapshot.val() as { teamId: string };
        if (!data?.teamId) return null;

        const teamSnapshot = await get(ref(db, `teams/${data.teamId}`));
        return teamSnapshot.exists() ? (teamSnapshot.val() as Team) : null;
    },

    /** Resolves a team only when the code is the public spectator (fan) code — kept for backward compat. */
    lookupTeamBySpectatorCode: async (accessCode: string): Promise<Team | null> => {
        const normalized = accessCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(normalized)) return null;
        const accessCodeRef = ref(db, `accessCodes/${normalized}`);
        const snapshot = await get(accessCodeRef);
        if (!snapshot.exists()) return null;
        const data = snapshot.val() as { teamId: string; role?: string };
        if (data.role !== 'spectator' || !data.teamId) return null;
        const teamSnapshot = await get(ref(db, `teams/${data.teamId}`));
        return teamSnapshot.exists() ? (teamSnapshot.val() as Team) : null;
    },

    /**
     * Resolves a team only when the code is the dedicated observer / scorer code.
     * Used for the neutral-scorer flow so coaches can rotate scoring access without
     * affecting fan follow links.
     */
    lookupTeamByObserverCode: async (accessCode: string): Promise<Team | null> => {
        const normalized = accessCode.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(normalized)) return null;
        const accessCodeRef = ref(db, `accessCodes/${normalized}`);
        const snapshot = await get(accessCodeRef);
        if (!snapshot.exists()) return null;
        const data = snapshot.val() as { teamId: string; role?: string };
        if (data.role !== 'observer' || !data.teamId) return null;
        const teamSnapshot = await get(ref(db, `teams/${data.teamId}`));
        return teamSnapshot.exists() ? (teamSnapshot.val() as Team) : null;
    },

    /**
     * Ensures an observer code exists for legacy teams (created before observer
     * codes were introduced). Idempotent. Coaches and managers can call this.
     */
    ensureObserverCode: async (teamId: string, actingUserId: string): Promise<string> => {
        const teamSnap = await get(ref(db, `teams/${teamId}`));
        if (!teamSnap.exists()) throw new Error('Team not found');
        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) throw new Error('Permission denied');

        const codesSnap = await get(ref(db, `teamJoinCodes/${teamId}`));
        const codes: TeamJoinCodes = codesSnap.exists() ? (codesSnap.val() as TeamJoinCodes) : ({} as TeamJoinCodes);
        if (codes.observer) return codes.observer;

        const observerCode = await generateUniqueAccessCode(codes.coach);
        await set(ref(db, `accessCodes/${observerCode}`), { teamId, role: 'observer' });
        await set(ref(db, `teamJoinCodes/${teamId}/observer`), observerCode);
        return observerCode;
    },

    /**
     * Rotates the observer code: invalidates the old mapping and issues a new one.
     * Returns the new code. Coaches and managers can call this.
     */
    rotateObserverCode: async (teamId: string, actingUserId: string): Promise<string> => {
        const teamSnap = await get(ref(db, `teams/${teamId}`));
        if (!teamSnap.exists()) throw new Error('Team not found');
        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) throw new Error('Permission denied');

        const codesSnap = await get(ref(db, `teamJoinCodes/${teamId}`));
        const codes: TeamJoinCodes = codesSnap.exists() ? (codesSnap.val() as TeamJoinCodes) : ({} as TeamJoinCodes);
        const oldObserver = codes.observer;

        const next = await generateUniqueAccessCode(oldObserver);
        await set(ref(db, `accessCodes/${next}`), { teamId, role: 'observer' });
        if (oldObserver) {
            await set(ref(db, `accessCodes/${oldObserver}`), null);
        }
        await set(ref(db, `teamJoinCodes/${teamId}/observer`), next);
        return next;
    },

    subscribeToTeamGameLinks: (teamId: string, callback: (links: Record<string, TeamGameLink>) => void) => {
        const linksRef = ref(db, `teamGameLinks/${teamId}`);
        return onValue(linksRef, (snapshot) => {
            callback(((snapshot.val() || {}) as Record<string, TeamGameLink>) || {});
        });
    },

    acceptObserverNeutralGameOnProfile: async (teamId: string, gameId: string, actingUserId: string): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const teamSnap = await get(teamRef);
        if (!teamSnap.exists()) throw new Error('Team not found');
        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) throw new Error('Permission denied');

        const linkRef = ref(db, `teamGameLinks/${teamId}/${gameId}`);
        const linkSnap = await get(linkRef);
        if (!linkSnap.exists()) throw new Error('Game link not found');
        const link = linkSnap.val() as TeamGameLink;
        if (link.source !== 'observer_neutral') throw new Error('Not an observer-neutral game');

        await set(ref(db, `teamGameLinks/${teamId}/${gameId}/profileInclusion`), 'accepted');
        await set(ref(db, `teams/${teamId}/pastGames/${gameId}`), true);
        GameService.clearPastGamesCacheForTeam(teamId);
    },

    declineObserverNeutralGameOnProfile: async (teamId: string, gameId: string, actingUserId: string): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const teamSnap = await get(teamRef);
        if (!teamSnap.exists()) throw new Error('Team not found');
        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) throw new Error('Permission denied');

        const linkRef = ref(db, `teamGameLinks/${teamId}/${gameId}`);
        const linkSnap = await get(linkRef);
        if (!linkSnap.exists()) throw new Error('Game link not found');
        const link = linkSnap.val() as TeamGameLink;
        if (link.source !== 'observer_neutral') throw new Error('Not an observer-neutral game');

        await set(ref(db, `teamGameLinks/${teamId}/${gameId}/profileInclusion`), 'declined');
        await set(ref(db, `teams/${teamId}/pastGames/${gameId}`), null);
        GameService.clearPastGamesCacheForTeam(teamId);
    },

    addPlayer: async (
        teamId: string,
        playerName: string,
        actingUserId: string,
        playerNumber?: string,
        primaryLine: PlayerPrimaryLine = 'flex',
        position: PlayerPosition = 'hybrid'
    ): Promise<string> => {
        try {
            const teamRef = ref(db, `teams/${teamId}`);
            const teamSnapshot = await get(teamRef);
            if (!teamSnapshot.exists()) {
                throw new Error('Team not found');
            }

            const team = teamSnapshot.val() as Team;
            const isCoach = team.coachId === actingUserId;
            const isManager = !!team.managers?.[actingUserId];
            if (!isCoach && !isManager) {
                throw new Error('Permission denied');
            }

            const playersRef = ref(db, `teams/${teamId}/players`);
            const newPlayerRef = push(playersRef);
            const playerId = newPlayerRef.key;

            if (!playerId) throw new Error("Failed to generate player ID");

            const newPlayer: Player = {
                id: playerId,
                name: playerName,
                number: playerNumber,
                teamId: teamId,
                primaryLine,
                position,
            };

            await set(newPlayerRef, newPlayer);
            return playerId;
        } catch (error) {
            console.error("Error adding player:", error);
            throw error;
        }
    },

    // Real-time listener for roster
    subscribeToTeam: (teamId: string, callback: (team: Team | null) => void) => {
        const teamRef = ref(db, `teams/${teamId}`);
        return onValue(teamRef, (snapshot) => {
            const data = snapshot.val();
            callback(data);
        });
    },

    subscribeToTeamJoinCodes: (teamId: string, callback: (codes: TeamJoinCodes | null) => void) => {
        const codesRef = ref(db, `teamJoinCodes/${teamId}`);
        return onValue(codesRef, (snapshot) => {
            const data = snapshot.val() as TeamJoinCodes | null;
            callback(data);
        });
    },

    // New dual-fetcher: fetches coached AND spectated teams concurrently
    // New dual-fetcher: fetches coached AND spectated teams concurrently
    getTeamsForUser: (userId: string, callback: (coached: Team[], spectated: Team[]) => void) => {
        let coachedIds: string[] = [];
        let spectatedIds: string[] = [];
        const allTeamsData: { [key: string]: Team } = {};
        const teamListeners = new Map<string, () => void>();

        const emitMappedTeams = () => {
            const finalCoached: Team[] = [];
            const finalSpectated: Team[] = [];

            coachedIds.forEach(id => {
                if (allTeamsData[id]) {
                    finalCoached.push({ ...allTeamsData[id], role: 'coach' });
                }
            });

            spectatedIds.forEach(id => {
                if (allTeamsData[id]) {
                    finalSpectated.push({ ...allTeamsData[id], role: 'spectator' });
                }
            });

            callback(finalCoached, finalSpectated);
        };

        const syncTeamListeners = () => {
            const currentIds = Array.from(new Set([...coachedIds, ...spectatedIds]));

            // Remove unused listeners
            for (const [id, unsub] of teamListeners.entries()) {
                if (!currentIds.includes(id)) {
                    unsub();
                    teamListeners.delete(id);
                    delete allTeamsData[id];
                }
            }

            // Add new listeners
            for (const id of currentIds) {
                if (!teamListeners.has(id)) {
                    const unsub = onValue(ref(db, `teams/${id}`), (snap) => {
                        const data = snap.val();
                        if (data) {
                            allTeamsData[id] = data;
                        } else {
                            delete allTeamsData[id];
                        }
                        emitMappedTeams();
                    });
                    teamListeners.set(id, unsub);
                }
            }
        };

        const handleListsChanged = () => {
            syncTeamListeners();
            emitMappedTeams();
        };

        // 1. Fetch user's coached list mapping
        const unsubCoached = onValue(ref(db, `users/${userId}/coached_teams`), (snap) => {
            coachedIds = snap.exists() ? Object.keys(snap.val()) : [];
            handleListsChanged();
        });

        // 2. Fetch user's spectated list mapping
        const unsubSpectated = onValue(ref(db, `users/${userId}/spectated_teams`), (snap) => {
            spectatedIds = snap.exists() ? Object.keys(snap.val()) : [];
            handleListsChanged();
        });

        return () => {
            unsubCoached();
            unsubSpectated();
            // Cleanup all individual team listeners
            for (const unsub of teamListeners.values()) {
                unsub();
            }
            teamListeners.clear();
        }; // Return combined listeners for cleanup
    },

    setActiveGame: async (teamId: string, gameId: string | null): Promise<void> => {
        try {
            await set(ref(db, `teams/${teamId}/activeGameId`), gameId);
        } catch (error) {
            console.error("Error setting active game:", error);
            throw error;
        }
    },

    updateManagerRole: async (teamId: string, managerId: string, role: string, actingUserId: string): Promise<void> => {
        try {
            const teamRef = ref(db, `teams/${teamId}`);
            const teamSnap = await get(teamRef);
            if (!teamSnap.exists()) throw new Error('Team not found');

            const team = teamSnap.val() as Team;
            if (team.coachId !== actingUserId) {
                throw new Error('Permission denied');
            }

            await set(ref(db, `teams/${teamId}/managers/${managerId}/role`), role);
        } catch (error) {
            console.error("Error updating manager role:", error);
            throw error;
        }
    },

    removeManager: async (teamId: string, managerId: string, actingUserId: string): Promise<void> => {
        try {
            const teamRef = ref(db, `teams/${teamId}`);
            const teamSnap = await get(teamRef);
            if (!teamSnap.exists()) throw new Error('Team not found');

            const team = teamSnap.val() as Team;
            if (team.coachId !== actingUserId) {
                throw new Error('Permission denied');
            }

            await set(ref(db, `teams/${teamId}/managers/${managerId}`), null);
            await set(ref(db, `users/${managerId}/coached_teams/${teamId}`), null);
        } catch (error) {
            console.error("Error removing manager:", error);
            throw error;
        }
    },

    deleteTeam: async (teamId: string, actingUserId: string): Promise<void> => {
        try {
            const teamRef = ref(db, `teams/${teamId}`);
            const teamSnap = await get(teamRef);
            if (!teamSnap.exists()) throw new Error('Team not found');

            const team = teamSnap.val() as Team;
            if (team.coachId !== actingUserId) {
                throw new Error('Permission denied');
            }

            // Delete from global teams node
            await set(teamRef, null);
            // Delete from coach's coached_teams list
            await set(ref(db, `users/${team.coachId}/coached_teams/${teamId}`), null);
        } catch (error) {
            console.error("Error deleting team:", error);
            throw error;
        }
    },

    getAllTeams: async (): Promise<Team[]> => {
        try {
            const teamsRef = ref(db, 'teams');
            const snapshot = await get(teamsRef);
            if (!snapshot.exists()) return [];

            const data = snapshot.val() as Record<string, Partial<Team>>;
            return Object.entries(data || {})
                .map(([key, team]) => ({
                    ...(team as Team),
                    id: team?.id || key,
                    players: team?.players || {},
                }))
                .filter((team) => !!team?.id && !!team?.name);
        } catch (error) {
            console.error('Error fetching all teams:', error);
            return [];
        }
    },

    createScheduledGame: async (
        teamId: string,
        payload: Omit<ScheduledGame, 'id' | 'teamId' | 'createdAt'>
    ): Promise<string> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const teamSnap = await get(teamRef);
        if (!teamSnap.exists()) throw new Error('Team not found');

        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === payload.createdBy;
        const isManager = !!team.managers?.[payload.createdBy];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const opponentName = (payload.opponentName || '').trim();
        if (!opponentName) throw new Error('Opponent name is required');
        if (opponentName.length > SCHEDULE_LIMITS.opponentNameMax) {
            throw new Error(`Opponent name must be ${SCHEDULE_LIMITS.opponentNameMax} characters or fewer`);
        }

        const location = (payload.location || '').trim();
        if (location.length > SCHEDULE_LIMITS.locationMax) {
            throw new Error(`Location must be ${SCHEDULE_LIMITS.locationMax} characters or fewer`);
        }

        if (typeof payload.scheduledAt === 'number' && !isFutureScheduledTimestamp(payload.scheduledAt)) {
            throw new Error('Scheduled games must be in the future');
        }

        const validPlayerIds = Object.keys(team.players || {});
        const normalizedAvailability = sanitizeAvailability(payload.availability, validPlayerIds);

        const scheduledRef = push(ref(db, `teams/${teamId}/scheduledGames`));
        const id = scheduledRef.key;
        if (!id) throw new Error('Failed to create scheduled game ID');

        const scheduledGame: ScheduledGame = {
            id,
            teamId,
            teamName: team.name,
            opponentName,
            createdAt: Date.now(),
            createdBy: payload.createdBy,
        };

        if (payload.opponentTeamId) {
            scheduledGame.opponentTeamId = payload.opponentTeamId;
        }

        if (location) {
            scheduledGame.location = location;
        }

        if (typeof payload.scheduledAt === 'number') {
            scheduledGame.scheduledAt = payload.scheduledAt;
        }

        if (Object.keys(normalizedAvailability).length > 0) {
            scheduledGame.availability = normalizedAvailability;
        }

        await set(scheduledRef, scheduledGame);
        return id;
    },

    subscribeToScheduledGames: (teamId: string, callback: (games: ScheduledGame[]) => void) => {
        const scheduledRef = ref(db, `teams/${teamId}/scheduledGames`);
        return onValue(scheduledRef, (snapshot) => {
            const data = snapshot.val() as Record<string, ScheduledGame> | null;
            if (!data) {
                callback([]);
                return;
            }

            const games = Object.values(data)
                .filter((game) => !!game?.id)
                .sort((a, b) => {
                    const aTime = typeof a.scheduledAt === 'number' ? a.scheduledAt : Number.MAX_SAFE_INTEGER;
                    const bTime = typeof b.scheduledAt === 'number' ? b.scheduledAt : Number.MAX_SAFE_INTEGER;
                    if (aTime !== bTime) return aTime - bTime;
                    return (a.createdAt || 0) - (b.createdAt || 0);
                });

            callback(games);
        });
    },

    updateScheduledGame: async (
        teamId: string,
        scheduledGameId: string,
        actingUserId: string,
        updates: {
            opponentName: string;
            location?: string;
            scheduledAt?: number;
            availability?: Record<string, 'yes' | 'no'>;
        }
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const teamSnap = await get(teamRef);
        if (!teamSnap.exists()) throw new Error('Team not found');

        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const opponentName = (updates.opponentName || '').trim();
        if (!opponentName) throw new Error('Opponent name is required');
        if (opponentName.length > SCHEDULE_LIMITS.opponentNameMax) {
            throw new Error(`Opponent name must be ${SCHEDULE_LIMITS.opponentNameMax} characters or fewer`);
        }

        const location = (updates.location || '').trim();
        if (location.length > SCHEDULE_LIMITS.locationMax) {
            throw new Error(`Location must be ${SCHEDULE_LIMITS.locationMax} characters or fewer`);
        }

        if (typeof updates.scheduledAt === 'number' && !isFutureScheduledTimestamp(updates.scheduledAt)) {
            throw new Error('Scheduled games must be in the future');
        }

        const validPlayerIds = Object.keys(team.players || {});
        const normalizedAvailability = sanitizeAvailability(updates.availability, validPlayerIds);

        const gameRef = ref(db, `teams/${teamId}/scheduledGames/${scheduledGameId}`);
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) throw new Error('Scheduled game not found');

        const current = snapshot.val() as ScheduledGame;
        const nextGame: ScheduledGame = {
            ...current,
            opponentName,
        };

        if (location) {
            nextGame.location = location;
        } else {
            delete nextGame.location;
        }

        if (typeof updates.scheduledAt === 'number') {
            nextGame.scheduledAt = updates.scheduledAt;
        } else {
            delete nextGame.scheduledAt;
        }

        if (Object.keys(normalizedAvailability).length > 0) {
            nextGame.availability = normalizedAvailability;
        } else {
            delete nextGame.availability;
        }

        await set(gameRef, nextGame);
    },

    removeScheduledGame: async (teamId: string, scheduledGameId: string, actingUserId: string): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const teamSnap = await get(teamRef);
        if (!teamSnap.exists()) throw new Error('Team not found');

        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        await set(ref(db, `teams/${teamId}/scheduledGames/${scheduledGameId}`), null);
    },

    updateScheduledGameAvailability: async (
        teamId: string,
        scheduledGameId: string,
        playerId: string,
        status: 'yes' | 'no',
        actingUserId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const teamSnap = await get(teamRef);
        if (!teamSnap.exists()) throw new Error('Team not found');

        const team = teamSnap.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        await set(ref(db, `teams/${teamId}/scheduledGames/${scheduledGameId}/availability/${playerId}`), status);
    },

    updateTeamPageConfig: async (
        teamId: string,
        userId: string,
        nextConfig: TeamPageConfig
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const sanitizedConfig = sanitizeForFirebase(nextConfig);
        await set(ref(db, `teams/${teamId}/pageConfig`), sanitizedConfig);
    },

    removePlayer: async (
        teamId: string,
        playerId: string,
        userId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        await set(ref(db, `teams/${teamId}/players/${playerId}`), null);
    },

    updatePlayerBadge: async (
        teamId: string,
        playerId: string,
        badge: string | null,
        userId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const badgeRef = ref(db, `teams/${teamId}/players/${playerId}/badge`);
        await set(badgeRef, badge || null);
    },

    updatePlayerRole: async (
        teamId: string,
        playerId: string,
        role: string | null,
        userId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const roleRef = ref(db, `teams/${teamId}/players/${playerId}/role`);
        await set(roleRef, role || null);
    },

    updatePlayerLineProfile: async (
        teamId: string,
        playerId: string,
        primaryLine: PlayerPrimaryLine | null,
        position: PlayerPosition | null,
        userId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const allowedLines: (PlayerPrimaryLine | null)[] = ['O', 'D', 'flex', null];
        const allowedPositions: (PlayerPosition | null)[] = ['handler', 'cutter', 'hybrid', null];
        if (!allowedLines.includes(primaryLine)) throw new Error('Invalid line value');
        if (!allowedPositions.includes(position)) throw new Error('Invalid position value');

        await set(ref(db, `teams/${teamId}/players/${playerId}/primaryLine`), primaryLine || null);
        await set(ref(db, `teams/${teamId}/players/${playerId}/position`), position || null);
    },

    updatePlayerDisplayName: async (
        teamId: string,
        playerId: string,
        name: string,
        userId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const trimmed = (name || '').trim();
        if (!trimmed) {
            throw new Error('Name cannot be empty');
        }
        if (trimmed.length > 80) {
            throw new Error('Name must be 80 characters or fewer');
        }

        await set(ref(db, `teams/${teamId}/players/${playerId}/name`), trimmed);
    },

    updatePlayerNumber: async (
        teamId: string,
        playerId: string,
        number: string | null,
        userId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === userId;
        const isManager = !!team.managers?.[userId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const trimmed = (number ?? '').trim().slice(0, 4);
        const safe = trimmed.replace(/[^A-Za-z0-9]/g, '');

        await set(ref(db, `teams/${teamId}/players/${playerId}/number`), safe || null);
    },

    createPlayerClaimCode: async (
        teamId: string,
        playerId: string,
        actingUserId: string
    ): Promise<string> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        if (!isCoach && !isManager) {
            throw new Error('Permission denied');
        }

        const player = team.players?.[playerId];
        if (!player) {
            throw new Error('Player not found');
        }
        if (player.claimedByUid) {
            throw new Error('This player has already been claimed.');
        }

        const claimCode = await generateUniquePlayerClaimCode();
        const createdAt = Date.now();
        await set(ref(db, `playerClaimCodes/${claimCode}`), {
            teamId,
            playerId,
            createdBy: actingUserId,
            createdAt,
        });
        await set(ref(db, `teams/${teamId}/players/${playerId}/claimCodeHash`), claimCode);
        await set(ref(db, `teams/${teamId}/players/${playerId}/claimCodeCreatedAt`), createdAt);
        return claimCode;
    },

    claimPlayerByCode: async (
        claimCode: string,
        userId: string
    ): Promise<{ teamId: string; playerId: string }> => {
        const normalizedCode = claimCode.trim().toUpperCase();
        const codeSnap = await get(ref(db, `playerClaimCodes/${normalizedCode}`));
        if (!codeSnap.exists()) {
            throw new Error('Invalid player claim code.');
        }

        const mapping = codeSnap.val() as { teamId?: string; playerId?: string };
        if (!mapping.teamId || !mapping.playerId) {
            throw new Error('Invalid player claim code.');
        }

        const playerRef = ref(db, `teams/${mapping.teamId}/players/${mapping.playerId}`);
        const playerSnap = await get(playerRef);
        if (!playerSnap.exists()) {
            throw new Error('Player not found.');
        }

        const player = playerSnap.val() as Player;
        if (player.claimedByUid && player.claimedByUid !== userId) {
            throw new Error('This player has already been claimed.');
        }

        await set(ref(db, `teams/${mapping.teamId}/players/${mapping.playerId}/claimedByUid`), userId);
        await set(ref(db, `teams/${mapping.teamId}/players/${mapping.playerId}/verifiedRosterLink`), true);
        await set(ref(db, `teams/${mapping.teamId}/players/${mapping.playerId}/claimCodeHash`), null);
        await set(ref(db, `teams/${mapping.teamId}/players/${mapping.playerId}/claimCodeCreatedAt`), null);
        await set(ref(db, `users/${userId}/claimedPlayers/${mapping.teamId}_${mapping.playerId}`), {
            teamId: mapping.teamId,
            playerId: mapping.playerId,
            claimedAt: Date.now(),
        });
        await set(ref(db, `playerClaimCodes/${normalizedCode}`), null);

        return { teamId: mapping.teamId, playerId: mapping.playerId };
    },

    updatePlayerStatPrivacy: async (
        teamId: string,
        playerId: string,
        statPrivacy: 'public' | 'team' | 'private',
        actingUserId: string
    ): Promise<void> => {
        const teamRef = ref(db, `teams/${teamId}`);
        const snapshot = await get(teamRef);
        if (!snapshot.exists()) {
            throw new Error('Team not found');
        }

        const team = snapshot.val() as Team;
        const player = team.players?.[playerId];
        const isCoach = team.coachId === actingUserId;
        const isManager = !!team.managers?.[actingUserId];
        const isClaimedPlayer = player?.claimedByUid === actingUserId;
        if (!isCoach && !isManager && !isClaimedPlayer) {
            throw new Error('Permission denied');
        }

        await set(ref(db, `teams/${teamId}/players/${playerId}/statPrivacy`), statPrivacy);
    }
};
