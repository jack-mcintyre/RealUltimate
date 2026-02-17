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
    createTeam: async (teamName: string, coachId: string): Promise<string> => {
        try {
            // Push new team to get ID
            const teamsRef = ref(db, 'teams');
            const newTeamRef = push(teamsRef);
            const teamId = newTeamRef.key;

            if (!teamId) throw new Error("Failed to generate team ID");

            const accessCode = generateAccessCode();

            const newTeam: Team = {
                id: teamId,
                coachId,
                name: teamName,
                accessCode,
                players: {},
            };

            await set(newTeamRef, newTeam);

            // Also map access code to team ID for easy lookup later (optional optimization)
            const accessCodeRef = ref(db, `accessCodes/${accessCode}`);
            await set(accessCodeRef, teamId);

            return teamId;
        } catch (error) {
            console.error("Error creating team:", error);
            throw error;
        }
    },

    joinTeamByCode: async (accessCode: string): Promise<string | null> => {
        // This would require querying teams by accessCode or using the mapping above
        const accessCodeRef = ref(db, `accessCodes/${accessCode}`);
        const snapshot = await get(accessCodeRef);
        if (snapshot.exists()) {
            return snapshot.val();
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
    }
};
