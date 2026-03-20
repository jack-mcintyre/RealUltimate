import { get, onValue, push, ref, set } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { Player, Team } from './types';

// Helper to generate a random 6-character access code
const generateAccessCode = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

export const TeamService = {
    createTeam: async (teamName: string, coachId: string, coachEmail: string): Promise<string> => {
        try {
            // Push new team to get ID
            const teamsRef = ref(db, 'teams');
            const newTeamRef = push(teamsRef);
            const teamId = newTeamRef.key;

            if (!teamId) throw new Error("Failed to generate team ID");

            const accessCode = generateAccessCode();
            const spectatorCode = generateAccessCode(); // Brand new Spectator code

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

    addPlayer: async (teamId: string, playerName: string, playerNumber?: string): Promise<string> => {
        try {
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

    updateManagerRole: async (teamId: string, managerId: string, role: string): Promise<void> => {
        try {
            await set(ref(db, `teams/${teamId}/managers/${managerId}/role`), role);
        } catch (error) {
            console.error("Error updating manager role:", error);
            throw error;
        }
    },

    removeManager: async (teamId: string, managerId: string): Promise<void> => {
        try {
            await set(ref(db, `teams/${teamId}/managers/${managerId}`), null);
            await set(ref(db, `users/${managerId}/coached_teams/${teamId}`), null);
        } catch (error) {
            console.error("Error removing manager:", error);
            throw error;
        }
    },

    deleteTeam: async (teamId: string, coachId: string): Promise<void> => {
        try {
            // Delete from global teams node
            await set(ref(db, `teams/${teamId}`), null);
            // Delete from coach's coached_teams list
            await set(ref(db, `users/${coachId}/coached_teams/${teamId}`), null);
        } catch (error) {
            console.error("Error deleting team:", error);
            throw error;
        }
    }
};
