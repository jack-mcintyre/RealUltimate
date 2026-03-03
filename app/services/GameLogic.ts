import { GameEvent, GameState } from './types';

// Pure logic for game state transitions
export const GameLogic = {
    // Helper to init stats if they don't exist
    initPlayerStats: (state: GameState, playerId: string) => {
        if (!state.playerStats[playerId]) {
            state.playerStats[playerId] = { goals: 0, assists: 0, blocks: 0, turns: 0 };
        }
    },

    applyEvent: (currentState: GameState, event: GameEvent): GameState => {
        // Deep copy state to ensure immutability
        const newState: GameState = JSON.parse(JSON.stringify(currentState));

        // Always add to history
        newState.history = [...newState.history, event];

        // Ensure players have stat objects initialized
        if (event.playerId) GameLogic.initPlayerStats(newState, event.playerId);
        if (event.assistantId) GameLogic.initPlayerStats(newState, event.assistantId);

        switch (event.type) {
            case 'G': // Goal
                if (newState.possession === newState.team1Id) {
                    newState.score1 += 1;
                } else if (newState.possession === newState.team2Id) {
                    newState.score2 += 1;
                }

                // Update Stats
                if (event.playerId) newState.playerStats[event.playerId].goals += 1;
                if (event.assistantId) newState.playerStats[event.assistantId].assists += 1;

                // Possession flips for pull
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'T': // Throwaway (Turnover)
            case 'Drop':
                // Update Stats
                if (event.playerId) newState.playerStats[event.playerId].turns += 1;

                // Possession flips
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'D': // Defense Block
                if (event.playerId) newState.playerStats[event.playerId].blocks += 1;

                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Callahan': // Goal for defense
                if (newState.possession === newState.team1Id) {
                    newState.score2 += 1; // Team 2 scores
                } else {
                    newState.score1 += 1; // Team 1 scores
                }

                // Callahan implies a block AND a goal by the same person
                if (event.playerId) {
                    newState.playerStats[event.playerId].blocks += 1;
                    newState.playerStats[event.playerId].goals += 1;
                }

                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Pull':
                // Starts the point.
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
    },

    // Set the initial line for a point
    startPoint: (currentState: GameState, activePlayerIds: string[]): GameState => {
        const newState = { ...currentState };
        newState.currentLine = activePlayerIds;
        return newState;
    }
};
