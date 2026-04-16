import { get, onValue, push, ref, set } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { Player, ScheduledGame, Team, TeamPageConfig } from './types';

const sanitizeForFirebase = (value: any): any => {
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

export const TeamService = {
    createTeam: async (teamName: string, coachId: string, coachEmail: string): Promise<string> => {
        try {
            // Push new team to get ID
            const teamsRef = ref(db, 'teams');
            const newTeamRef = push(teamsRef);
            const teamId = newTeamRef.key;

            if (!teamId) throw new Error("Failed to generate team ID");

            const accessCode = await generateUniqueAccessCode();
            const spectatorCode = await generateUniqueAccessCode(accessCode);

            const newTeam: Team = {
                id: teamId,
                coachId,
                name: teamName,
                accessCode,
                spectatorCode,
                players: {},
                managers: {
                    [coachId]: { email: coachEmail, role: 'Head Coach' }
                }
            };

            await set(newTeamRef, newTeam);

            // Map access code -> { teamId, role }
            await set(ref(db, `accessCodes/${accessCode}`), { teamId, role: 'coach' });
            await set(ref(db, `accessCodes/${spectatorCode}`), { teamId, role: 'spectator' });

            // Automatically add to user's coached list
            await set(ref(db, `users/${coachId}/coached_teams/${teamId}`), true);

            return teamId;
        } catch (error) {
            console.error("Error creating team:", error);
            throw error;
        }
    },

    joinTeamByCode: async (accessCode: string, userId: string, userEmail: string): Promise<{ teamId: string, role: string } | null> => {
        const accessCodeRef = ref(db, `accessCodes/${accessCode}`);
        const snapshot = await get(accessCodeRef);
        if (snapshot.exists()) {
            const data = snapshot.val();
            // data is { teamId, role }
            
            // Save relation to user profile!
            const listType = data.role === 'coach' ? 'coached_teams' : 'spectated_teams';
            await set(ref(db, `users/${userId}/${listType}/${data.teamId}`), true);

            // Add manager to team RBAC if coach
            if (data.role === 'coach') {
                await set(ref(db, `teams/${data.teamId}/managers/${userId}`), { email: userEmail, role: 'Assistant Coach' });
            }

            return data;
        }
        return null;
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

    addPlayer: async (teamId: string, playerName: string, actingUserId: string, playerNumber?: string): Promise<string> => {
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
                teamId: teamId
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
                    accessCode: '',
                    spectatorCode: undefined,
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

        const scheduledRef = push(ref(db, `teams/${teamId}/scheduledGames`));
        const id = scheduledRef.key;
        if (!id) throw new Error('Failed to create scheduled game ID');

        const scheduledGame: ScheduledGame = {
            id,
            teamId,
            teamName: team.name,
            opponentName: payload.opponentName,
            createdAt: Date.now(),
            createdBy: payload.createdBy,
        };

        if (payload.opponentTeamId) {
            scheduledGame.opponentTeamId = payload.opponentTeamId;
        }

        if (payload.location && payload.location.trim()) {
            scheduledGame.location = payload.location.trim();
        }

        if (typeof payload.scheduledAt === 'number') {
            scheduledGame.scheduledAt = payload.scheduledAt;
        }

        if (payload.availability && Object.keys(payload.availability).length > 0) {
            scheduledGame.availability = payload.availability;
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

        const gameRef = ref(db, `teams/${teamId}/scheduledGames/${scheduledGameId}`);
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) throw new Error('Scheduled game not found');

        const current = snapshot.val() as ScheduledGame;
        const nextGame: ScheduledGame = {
            ...current,
            opponentName: updates.opponentName.trim(),
        };

        if (updates.location && updates.location.trim()) {
            nextGame.location = updates.location.trim();
        } else {
            delete nextGame.location;
        }

        if (typeof updates.scheduledAt === 'number') {
            nextGame.scheduledAt = updates.scheduledAt;
        } else {
            delete nextGame.scheduledAt;
        }

        if (updates.availability && Object.keys(updates.availability).length > 0) {
            nextGame.availability = updates.availability;
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
    }
};
