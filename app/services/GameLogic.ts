import { GameEvent, GameState } from './types';

// Pure logic for game state transitions
export const GameLogic = {
    // Helper to init stats if they don't exist
    initPlayerStats: (state: GameState, playerId: string) => {
        if (!state.playerStats) state.playerStats = {};
        if (!state.playerStats[playerId]) {
            state.playerStats[playerId] = { goals: 0, assists: 0, blocks: 0, turns: 0 };
        }
    },

    applyEvent: (currentState: GameState, event: GameEvent): GameState => {
        // Deep copy state to ensure immutability
        const newState = JSON.parse(JSON.stringify(currentState)) as GameState;

        // Always add to history
        if (!newState.history) newState.history = [];
        newState.history.push(event);

        // Ensure players have stat objects initialized
        if (event.playerId) GameLogic.initPlayerStats(newState, event.playerId);

        switch (event.type) {
            case 'Goal':
            case 'G':
                if (newState.possession === newState.team1Id) {
                    newState.score1 += 1;
                } else if (newState.possession === newState.team2Id) {
                    newState.score2 += 1;
                }

                // Update Stats
                if (event.playerId) Object.assign(newState.playerStats[event.playerId], { goals: newState.playerStats[event.playerId].goals + 1 });

                // Possession flips for pull
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Opponent Score':
                // The opponent team was on offense and scored
                if (newState.possession === newState.team1Id) {
                    newState.score1 += 1; // Technically this shouldn't happen via this button, but for safety
                } else {
                    newState.score2 += 1; // Them scoring
                }
                
                // Possession flips for pull
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Throwaway':
            case 'T':
            case 'Drop':
                // Update Stats
                if (event.playerId) Object.assign(newState.playerStats[event.playerId], { turns: newState.playerStats[event.playerId].turns + 1 });

                // Possession flips
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Opponent Turnover':
                // Opponent made a mistake, possession flips to us
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'D-Block':
            case 'D':
                if (event.playerId) Object.assign(newState.playerStats[event.playerId], { blocks: newState.playerStats[event.playerId].blocks + 1 });

                // Defense flips possession
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Halftime':
                newState.isHalftime = true;
                // Give possession to whoever DID NOT receive the very first pull
                newState.possession = newState.firstHalfPossession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'End Halftime':
                newState.isHalftime = false;
                break;

            case 'Timeout':
                break;
        }

        return newState;
    },

    // Rebuild state from history (for Undo)
    reconfgureStateFromHistory: (initialState: GameState, history: GameEvent[]): GameState => {
        let state: GameState = JSON.parse(JSON.stringify({ ...initialState, history: [] })); // Start fresh
        for (const event of history) {
            state = GameLogic.applyEvent(state, event);
        }
        return state;
    }
};
