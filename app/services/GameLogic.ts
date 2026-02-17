import { GameEvent, GameState } from './types';

// Pure logic for game state transitions
export const GameLogic = {
    applyEvent: (currentState: GameState, event: GameEvent): GameState => {
        const newState = { ...currentState };

        // Always add to history
        newState.history = [...newState.history, event];

        switch (event.type) {
            case 'G': // Goal
                if (newState.possession === newState.team1Id) {
                    newState.score1 += 1;
                } else if (newState.possession === newState.team2Id) {
                    newState.score2 += 1;
                }
                // Possession changes after a goal (pull) or end of point?
                // Usually, the scoring team pulls, so possession effectively neutral untill pull?
                // For simplicity, let's just flip possession implies the other team will receive.
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'T': // Throwaway (Turnover)
            case 'D': // Defense Block (Turnover)
            case 'Drop':
                // Possession flips
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Callahan':
                // Defense catches goal.
                // If team1 has possession (offense) and gets Callahan'd, team2 scores.
                if (newState.possession === newState.team1Id) {
                    newState.score2 += 1; // Team 2 scores
                } else {
                    newState.score1 += 1; // Team 1 scores
                }
                // Possession stays with scoring team? No, they pull. 
                // So possession effectively flips to receiving team eventually.
                // Let's standardise: Possession variable represents "Who has the disc OR who is about to receive".
                // After a goal, the scoring team pulls. The receiving team will get the disc.
                // So possession should point to the receiving team?
                // Let's say Possession = "Team with Disc". 
                // After Goal: Possession = null (dead ball).
                // But for MVP simplicity, let's just flip it to the other team who will receive.
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
        let state: GameState = { ...initialState, history: [] }; // Start fresh
        for (const event of history) {
            state = GameLogic.applyEvent(state, event);
        }
        return state;
    }
};
