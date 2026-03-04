import { onValue, ref } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameState } from './types';

export const LiveFeedService = {
    // Listen to the current active game for a team (Simplified: just grabs the first active one, or requires gameId)
    // For MVP spectator sync: Assume Spectator joins a team, we need to find that team's active game.
    // To keep it simple, let's just listen to a specific game ID if we have it, or query games where team1Id == teamId and isGameActive == true.

    subscribeToActiveGame: (teamId: string, callback: (gameState: GameState | null) => void) => {
        // In a real app we'd query: ref(db, 'games').orderByChild('team1Id').equalTo(teamId)
        // But Firebase requires indexes for that. For MVP, if we know the gameId (e.g. stored on the Team object), we use that.
        // Let's assume the team object stores 'activeGameId' when a game starts.

        // For right now, let's just listen to the whole 'games' node and filter client-side (bad practice but works for no-index MVP)
        const gamesRef = ref(db, 'games');
        return onValue(gamesRef, (snapshot) => {
            const games = snapshot.val();
            if (games) {
                // Find the active game for this team
                const activeGame = Object.values(games).find(
                    (g: any) => (g.team1Id === teamId || g.team2Id === teamId) && g.isGameActive
                ) as GameState | undefined;

                callback(activeGame || null);
            } else {
                callback(null);
            }
        });
    }
};
