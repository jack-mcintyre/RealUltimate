import { GameEvent, GameState } from './types';

// Pure logic for game state transitions
export const GameLogic = {
    // Helper to init stats if they don't exist
    initPlayerStats: (state: GameState, playerId: string) => {
        if (!state.playerStats) state.playerStats = {};
        if (!state.playerStats[playerId]) {
            state.playerStats[playerId] = {
                goals: 0,
                assists: 0,
                blocks: 0,
                turns: 0,
                passes: 0,
                callahans: 0,
                timeWithDisc: 0,
                passAttempts: 0,
                passCompletions: 0,
                passTurnovers: 0,
                receptions: 0,
                pointsPlayed: 0,
                oPointsPlayed: 0,
                dPointsPlayed: 0,
                pointDiff: 0,
            };
        }
    },

    updateLineupForPointResult: (state: GameState, event: GameEvent, scoredByTeamId: string) => {
        const lineupLimit = state.gameFormat === '5v5' ? 5 : 7;
        const lineupPlayerIds = (event.lineupPlayerIds || state.currentLineupPlayerIds || [])
            .filter(Boolean)
            .slice(0, lineupLimit);
        if (!lineupPlayerIds.length) return;

        const lineType = event.lineType || (event.teamId === state.team1Id ? 'O' : 'D');
        const pointNumber = event.pointNumber || state.currentPointNumber || 1;
        const scoredByUs = scoredByTeamId === state.team1Id;
        const pointDiffDelta = scoredByUs ? 1 : -1;

        lineupPlayerIds.forEach((playerId) => {
            GameLogic.initPlayerStats(state, playerId);
            const playerStats = state.playerStats[playerId];
            Object.assign(playerStats, {
                pointsPlayed: (playerStats.pointsPlayed || 0) + 1,
                oPointsPlayed: (playerStats.oPointsPlayed || 0) + (lineType === 'O' ? 1 : 0),
                dPointsPlayed: (playerStats.dPointsPlayed || 0) + (lineType === 'D' ? 1 : 0),
                pointDiff: (playerStats.pointDiff || 0) + pointDiffDelta,
            });
        });

        if (!state.pointLineups) state.pointLineups = {};
        state.pointLineups[String(pointNumber)] = {
            pointNumber,
            lineType,
            playerIds: lineupPlayerIds,
            startedAt: state.pointLineups[String(pointNumber)]?.startedAt || event.timestamp,
            completedAt: event.timestamp,
            scoredByTeamId,
            scoreAfter: {
                team1: state.score1,
                team2: state.score2,
            },
        };
        state.currentPointNumber = pointNumber + 1;
        state.currentLineupPlayerIds = lineupPlayerIds;
    },

    applyEvent: (currentState: GameState, event: GameEvent): GameState => {
        // Deep copy state to ensure immutability
        const newState = JSON.parse(JSON.stringify(currentState)) as GameState;

        // Always add to history
        if (!newState.history) newState.history = [];
        newState.history.push(event);

        // Ensure players have stat objects initialized
        if (event.playerId) GameLogic.initPlayerStats(newState, event.playerId);
        if (event.lineupPlayerIds?.length) {
            const lineupLimit = newState.gameFormat === '5v5' ? 5 : 7;
            newState.currentLineupPlayerIds = event.lineupPlayerIds.filter(Boolean).slice(0, lineupLimit);
        }

        switch (event.type) {
            case 'Goal':
            case 'G':
                if (newState.possession === newState.team1Id) {
                    newState.score1 += 1;
                } else if (newState.possession === newState.team2Id) {
                    newState.score2 += 1;
                }

                // Update Stats
                if (event.playerId) {
                    Object.assign(newState.playerStats[event.playerId], { 
                        goals: newState.playerStats[event.playerId].goals + 1,
                        timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0)
                    });
                }
                const assisterId = event.assistPlayerId || event.fromPlayerId;
                if (assisterId) {
                    GameLogic.initPlayerStats(newState, assisterId);
                    const assisterStats = newState.playerStats[assisterId];
                    Object.assign(assisterStats, {
                        assists: assisterStats.assists + 1,
                        passes: assisterStats.passes + 1,
                        passAttempts: (assisterStats.passAttempts || 0) + 1,
                        passCompletions: (assisterStats.passCompletions || 0) + 1,
                    });
                }
                if (event.playerId && assisterId && event.playerId !== assisterId) {
                    const receiverStats = newState.playerStats[event.playerId];
                    Object.assign(receiverStats, {
                        receptions: (receiverStats.receptions || 0) + 1,
                    });
                }

                // Possession flips for pull
                GameLogic.updateLineupForPointResult(newState, event, newState.possession);
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Opponent Score':
                // The opponent team was on offense and scored
                if (newState.possession === newState.team1Id) {
                    newState.score1 += 1; // Technically this shouldn't happen via this button, but for safety
                } else {
                    newState.score2 += 1; // Them scoring
                }
                if (event.playerId) {
                    Object.assign(newState.playerStats[event.playerId], {
                        goals: newState.playerStats[event.playerId].goals + 1,
                        timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0),
                    });
                }
                
                // Possession flips for pull
                GameLogic.updateLineupForPointResult(newState, event, newState.possession);
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Throwaway':
            case 'T':
            case 'Drop':
                // Update Stats
                if (event.playerId) {
                    Object.assign(newState.playerStats[event.playerId], { 
                        turns: newState.playerStats[event.playerId].turns + 1,
                        timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0)
                    });
                }

                // Advanced passing turnover attribution
                {
                    const throwerId = event.fromPlayerId || event.assistPlayerId || event.playerId;
                    if (throwerId) {
                        GameLogic.initPlayerStats(newState, throwerId);
                        const throwerStats = newState.playerStats[throwerId];
                        Object.assign(throwerStats, {
                            passAttempts: (throwerStats.passAttempts || 0) + 1,
                            passTurnovers: (throwerStats.passTurnovers || 0) + 1,
                        });
                    }
                }

                // Possession flips
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Opponent Turnover':
                // Opponent made a mistake, possession flips to us
                if (event.playerId) {
                    Object.assign(newState.playerStats[event.playerId], {
                        turns: newState.playerStats[event.playerId].turns + 1,
                        timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0),
                    });
                }
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'D-Block':
            case 'D':
                if (event.playerId) Object.assign(newState.playerStats[event.playerId], { blocks: newState.playerStats[event.playerId].blocks + 1 });

                // Defense flips possession
                newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Callahan_US':
                if (event.playerId) {
                    Object.assign(newState.playerStats[event.playerId], { 
                        goals: newState.playerStats[event.playerId].goals + 1,
                        blocks: newState.playerStats[event.playerId].blocks + 1,
                        callahans: newState.playerStats[event.playerId].callahans + 1
                    });
                }
                newState.score1 += 1;
                // US scores, so US pulls to THEM
                GameLogic.updateLineupForPointResult(newState, event, newState.team1Id);
                newState.possession = newState.team2Id;
                break;

            case 'Callahan_THEM':
                if (event.playerId) {
                    Object.assign(newState.playerStats[event.playerId], { turns: newState.playerStats[event.playerId].turns + 1 });
                }
                newState.score2 += 1;
                // THEM scores, so THEM pulls to US
                GameLogic.updateLineupForPointResult(newState, event, newState.team2Id);
                newState.possession = newState.team1Id;
                break;

            case 'Halftime':
                newState.isHalftime = true;
                newState.possession = newState.firstHalfPossession === newState.team1Id ? newState.team2Id : newState.team1Id;
                break;

            case 'Pass':
                {
                    const throwerId = event.fromPlayerId || event.assistPlayerId || event.playerId;
                    const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined);

                    if (throwerId) {
                        GameLogic.initPlayerStats(newState, throwerId);
                        const throwerStats = newState.playerStats[throwerId];
                        Object.assign(throwerStats, {
                            passes: throwerStats.passes + 1,
                            passAttempts: (throwerStats.passAttempts || 0) + 1,
                            passCompletions: (throwerStats.passCompletions || 0) + 1,
                            timeWithDisc: throwerStats.timeWithDisc + (event.timeElapsedMs || 0),
                        });
                    }

                    if (receiverId) {
                        GameLogic.initPlayerStats(newState, receiverId);
                        const receiverStats = newState.playerStats[receiverId];
                        Object.assign(receiverStats, {
                            receptions: (receiverStats.receptions || 0) + 1,
                        });
                    }
                }
                break;

            case 'Pickup':
                // Informational possession marker for replay/logs.
                if (event.playerId) {
                    GameLogic.initPlayerStats(newState, event.playerId);
                }
                break;

            case 'End Halftime':
                newState.isHalftime = false;
                break;

            case 'Timeout':
                if (newState.activeTimeoutStartedAt) {
                    newState.activeTimeoutStartedAt = undefined;
                } else {
                    newState.activeTimeoutStartedAt = event.timestamp;
                    newState.timeoutDurationSec = event.timeoutDurationSec || newState.timeoutDurationSec || 70;
                }
                break;

            case 'Blue Card':
            case 'Yellow Card':
            case 'Red Card':
                // Misconduct cards are accountability events. They stay in history
                // but do not change score or possession.
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
