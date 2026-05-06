import { get, push, ref, set, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { GameLogic } from './GameLogic';
import { GameService, rosterSnapshotFromPlayerList } from './GameService';
import { TeamService, sanitizeForFirebase } from './TeamService';
import { GameEvent, GameState, INITIAL_GAME_STATE, Player, PlayerPosition, PlayerPrimaryLine, Team, isRealTeamId } from './types';

const DEMO_PACK_KEY = 'demoSamplePackV1';

export type DemoSeedResult = {
    universityIowaTeamId: string;
    iowaStateTeamId: string;
};

type RosterDef = { name: string; number: string; line: PlayerPrimaryLine; position: PlayerPosition };

const HAWKEYE_ROSTER: RosterDef[] = [
    { name: 'Jordan Kaczor', number: '4', line: 'O', position: 'handler' },
    { name: 'Morgan Ellis', number: '7', line: 'O', position: 'cutter' },
    { name: 'Sam Rivera', number: '11', line: 'O', position: 'hybrid' },
    { name: 'Taylor Quinn', number: '14', line: 'O', position: 'cutter' },
    { name: 'Riley Chen', number: '2', line: 'D', position: 'handler' },
    { name: 'Casey Brooks', number: '9', line: 'D', position: 'cutter' },
    { name: 'Jamie Ortiz', number: '16', line: 'D', position: 'cutter' },
    { name: 'Alex Novak', number: '21', line: 'flex', position: 'hybrid' },
    { name: 'Drew Patel', number: '3', line: 'flex', position: 'handler' },
    { name: 'Skyler Watts', number: '8', line: 'flex', position: 'cutter' },
    { name: 'Reese Mahoney', number: '19', line: 'flex', position: 'cutter' },
    { name: 'Blake Foster', number: '6', line: 'flex', position: 'hybrid' },
];

const CYCLONE_ROSTER: RosterDef[] = [
    { name: 'Avery Cole', number: '2', line: 'O', position: 'handler' },
    { name: 'Quinn Marsh', number: '6', line: 'O', position: 'cutter' },
    { name: 'Rory Banks', number: '9', line: 'O', position: 'hybrid' },
    { name: 'Devon Hayes', number: '14', line: 'O', position: 'cutter' },
    { name: 'Micah Stone', number: '3', line: 'D', position: 'handler' },
    { name: 'Noah Pierce', number: '18', line: 'D', position: 'cutter' },
    { name: 'Caleb Frost', number: '21', line: 'D', position: 'cutter' },
    { name: 'Elliot Shaw', number: '7', line: 'flex', position: 'hybrid' },
    { name: 'Finn Doyle', number: '11', line: 'flex', position: 'handler' },
    { name: 'Gray Lennon', number: '23', line: 'flex', position: 'cutter' },
    { name: 'Harper Knox', number: '5', line: 'flex', position: 'cutter' },
    { name: 'Indigo Reyes', number: '16', line: 'flex', position: 'hybrid' },
];

function lineupSeven(players: Player[]): string[] {
    return players.slice(0, 7).map((p) => p.id);
}

function buildBaseState(
    gameId: string,
    team1Id: string,
    team2Id: string,
    team2Name: string,
    coachUid: string,
    gameStartTimestamp: number
): GameState {
    return {
        ...INITIAL_GAME_STATE,
        gameId,
        team1Id,
        team2Id,
        team2Name,
        team2LinkedTeamId: team2Id,
        gameLocation: 'Eastern Iowa Ultimate Complex',
        gameTarget: 15,
        gameFormat: '7v7',
        score1: 0,
        score2: 0,
        possession: team1Id,
        firstHalfPossession: team1Id,
        isGameActive: false,
        isHalftime: false,
        advancedTracking: true,
        fieldMapEnabled: false,
        sotgEnabled: false,
        streamUrl: '',
        gameStartTimestamp,
        currentRecorderId: coachUid,
        recorderPin: String(1000 + Math.floor(Math.random() * 9000)),
        history: [],
        playerStats: {},
        currentLineupPlayerIds: [],
        currentPointNumber: 1,
        pointLineups: {},
        recordingMode: 'team',
        trackedTeamIds: [team1Id],
        softCapMinutes: 75,
        hardCapMinutes: 90,
        timeoutDurationSec: 70,
    };
}

function synthesizeCompletedGame(params: {
    gameId: string;
    team1Id: string;
    team2Id: string;
    team2DisplayName: string;
    coachUid: string;
    gameStartTimestamp: number;
    playersT1: Player[];
    playersT2: Player[];
    pointWinners: ('t1' | 't2')[];
    halftimeAfterGoals?: number;
}): GameState {
    const { gameId, team1Id, team2Id, team2DisplayName, coachUid, gameStartTimestamp, playersT1, playersT2, pointWinners, halftimeAfterGoals } =
        params;

    let state: GameState = buildBaseState(gameId, team1Id, team2Id, team2DisplayName, coachUid, gameStartTimestamp);

    /** team2 roster — history UI loads team1 from DB and merges this for opponent names. */
    state.opponentRosterSnapshot = rosterSnapshotFromPlayerList(playersT2);

    const lu = (side: 't1' | 't2') => (side === 't1' ? lineupSeven(playersT1) : lineupSeven(playersT2));

    let seq = 0;
    const ts = () => gameStartTimestamp + (++seq) * 420;
    const gsec = () => Math.max(0, Math.floor((ts() - gameStartTimestamp) / 1000));

    const apply = (ev: Partial<GameEvent> & Pick<GameEvent, 'type'>) => {
        const timestamp = typeof ev.timestamp === 'number' ? ev.timestamp : ts();
        const gameElapsedSec = typeof ev.gameElapsedSec === 'number' ? ev.gameElapsedSec : gsec();
        const full: GameEvent = {
            ...ev,
            id: `${gameId}_e_${seq}`,
            gameId,
            timestamp,
            gameElapsedSec,
            teamId: ev.teamId ?? state.possession,
            type: ev.type,
        };
        state = GameLogic.applyEvent(state, full);
    };

    const ensureOffense = (want: 't1' | 't2') => {
        const wantId = want === 't1' ? team1Id : team2Id;
        if (state.possession === wantId) return;
        apply({
            type: 'Opponent Turnover',
            teamId: state.possession,
        });
    };

    const playOffensivePoint = (winner: 't1' | 't2', pointNumber: number) => {
        const offenseId = winner === 't1' ? team1Id : team2Id;
        const line = lu(winner);
        const lineLen = line.length;
        if (lineLen < 4) return;

        const rot = (pointNumber - 1) % lineLen;
        const li = (j: number) => line[(rot + j) % lineLen];

        ensureOffense(winner);

        const quickHold = pointNumber % 5 === 0;
        if (quickHold && lineLen >= 4) {
            const thrower = li(0);
            const receiver = li(1);
            apply({
                type: 'Pass',
                teamId: offenseId,
                fromPlayerId: thrower,
                toPlayerId: receiver,
                timeElapsedMs: 2200,
            });
            apply({
                type: 'Goal',
                teamId: offenseId,
                playerId: receiver,
                assistPlayerId: thrower,
                lineupPlayerIds: line,
                lineType: 'O',
                pointNumber,
                timeElapsedMs: 900,
            });
            return;
        }

        const a = li(0);
        const b = li(1);
        const c = li(2);
        const scorer = li(3);

        apply({
            type: 'Pass',
            teamId: offenseId,
            fromPlayerId: a,
            toPlayerId: b,
            timeElapsedMs: 1400,
        });
        apply({
            type: 'Pass',
            teamId: offenseId,
            fromPlayerId: b,
            toPlayerId: c,
            timeElapsedMs: 1200,
        });
        apply({
            type: 'Pass',
            teamId: offenseId,
            fromPlayerId: c,
            toPlayerId: scorer,
            timeElapsedMs: 900,
        });
        apply({
            type: 'Goal',
            teamId: offenseId,
            playerId: scorer,
            assistPlayerId: c,
            lineupPlayerIds: line,
            lineType: 'O',
            pointNumber,
            timeElapsedMs: 700,
        });
    };

    let goals = 0;
    pointWinners.forEach((winner, idx) => {
        if (halftimeAfterGoals !== undefined && goals === halftimeAfterGoals) {
            apply({ type: 'Halftime', teamId: state.possession });
            apply({ type: 'End Halftime', teamId: state.possession });
        }
        playOffensivePoint(winner, idx + 1);
        goals += 1;
    });

    state.isGameActive = false;
    state.isHalftime = false;
    return state;
}

/** 15–13 for team1 */
function pointScript15_13(): ('t1' | 't2')[] {
    const out: ('t1' | 't2')[] = [];
    for (let i = 0; i < 13; i += 1) {
        out.push('t1', 't2');
    }
    out.push('t1', 't1');
    return out;
}

/** team1 wins 15–12 */
function pointScript15_12_t1(): ('t1' | 't2')[] {
    const out: ('t1' | 't2')[] = [];
    for (let i = 0; i < 12; i += 1) {
        out.push('t1', 't2');
    }
    out.push('t1', 't1', 't1');
    return out;
}

/** team1 wins 15–7 */
function pointScript15_7(): ('t1' | 't2')[] {
    const out: ('t1' | 't2')[] = [];
    for (let i = 0; i < 7; i += 1) {
        out.push('t1', 't2');
    }
    for (let i = 0; i < 8; i += 1) {
        out.push('t1');
    }
    return out;
}

async function addRoster(teamId: string, uid: string, defs: RosterDef[]): Promise<Player[]> {
    const players: Player[] = [];
    for (const d of defs) {
        const pid = await TeamService.addPlayer(teamId, d.name, uid, d.number, d.line, d.position);
        players.push({
            id: pid,
            name: d.name,
            number: d.number,
            teamId,
            primaryLine: d.line,
            position: d.position,
        });
    }
    return players;
}

async function persistFinishedGame(state: GameState, startedAt: number): Promise<void> {
    const gameId = state.gameId;
    const { team1Id, team2Id } = state;
    const completedAt = (state.history?.[state.history.length - 1]?.timestamp as number) || Date.now();

    await set(ref(db, `games/${gameId}`), sanitizeForFirebase(state));

    await set(ref(db, `teamGameLinks/${team1Id}/${gameId}`), {
        gameId,
        teamId: team1Id,
        opponentTeamId: team2Id,
        status: 'final',
        createdAt: startedAt,
        completedAt,
        source: 'primary',
    });
    await set(ref(db, `teamGameLinks/${team2Id}/${gameId}`), {
        gameId,
        teamId: team2Id,
        opponentTeamId: team1Id,
        status: 'final',
        createdAt: startedAt,
        completedAt,
        source: 'opponent',
    });

    await set(ref(db, `teams/${team1Id}/pastGames/${gameId}`), true);
    await set(ref(db, `teams/${team2Id}/pastGames/${gameId}`), true);
}

async function purgeTeamJoinArtifacts(teamId: string): Promise<void> {
    const codesSnap = await get(ref(db, `teamJoinCodes/${teamId}`));
    if (codesSnap.exists()) {
        const c = codesSnap.val() as { coach?: string; spectator?: string; observer?: string };
        for (const key of ['coach', 'spectator', 'observer'] as const) {
            const code = c[key];
            if (typeof code === 'string' && code.length > 0) {
                await set(ref(db, `accessCodes/${code}`), null);
            }
        }
    }
    await set(ref(db, `teamJoinCodes/${teamId}`), null);
}

async function removeDemoGameArtifacts(gameId: string): Promise<void> {
    const gameSnap = await get(ref(db, `games/${gameId}`));
    if (!gameSnap.exists()) return;
    const game = gameSnap.val() as GameState;
    const t1 = game.team1Id;
    const t2 = game.team2Id;
    await set(ref(db, `games/${gameId}`), null);
    await set(ref(db, `teamGameLinks/${t1}/${gameId}`), null);
    if (isRealTeamId(t2)) {
        await set(ref(db, `teamGameLinks/${t2}/${gameId}`), null);
    }
    await set(ref(db, `teams/${t1}/pastGames/${gameId}`), null);
    if (isRealTeamId(t2)) {
        await set(ref(db, `teams/${t2}/pastGames/${gameId}`), null);
    }
}

async function clearScheduledGamesForTeam(teamId: string): Promise<void> {
    const snap = await get(ref(db, `teams/${teamId}/scheduledGames`));
    if (!snap.exists()) return;
    const data = snap.val() as Record<string, unknown>;
    for (const id of Object.keys(data || {})) {
        await set(ref(db, `teams/${teamId}/scheduledGames/${id}`), null);
    }
}

export const DemoModeService = {
    DEMO_PACK_KEY,

    isPackInstalled: async (uid: string): Promise<boolean> => {
        const snap = await get(ref(db, `users/${uid}/profile/${DEMO_PACK_KEY}`));
        return snap.exists() && !!snap.val();
    },

    /**
     * University of Iowa (your coached team) + Iowa State (on Following for fan-style pages).
     * Three finished Hawkeyes–Cyclone games with varied scripts; opponent roster snapshots for history.
     */
    seedDemoWorld: async (
        uid: string,
        email: string,
        displayName: string,
        options?: { force?: boolean }
    ): Promise<DemoSeedResult> => {
        const installed = await DemoModeService.isPackInstalled(uid);
        if (installed && !options?.force) {
            throw new Error('Demo sample pack is already installed for this account.');
        }

        const universityIowaTeamId = await TeamService.createTeam('University of Iowa', uid, email, displayName);
        const iowaStateTeamId = await TeamService.createTeam('Iowa State', uid, email, displayName);

        await set(ref(db, `users/${uid}/coached_teams/${iowaStateTeamId}`), null);
        await set(ref(db, `users/${uid}/spectated_teams/${iowaStateTeamId}`), true);

        const [hawkeyePlayers, cyclonePlayers] = await Promise.all([
            addRoster(universityIowaTeamId, uid, HAWKEYE_ROSTER),
            addRoster(iowaStateTeamId, uid, CYCLONE_ROSTER),
        ]);

        const futureAt = Date.now() + 10 * 24 * 60 * 60 * 1000;
        await TeamService.createScheduledGame(universityIowaTeamId, {
            teamName: 'University of Iowa',
            opponentName: 'Iowa State',
            opponentTeamId: iowaStateTeamId,
            location: 'Bloomington, IL • Tournament site 4',
            scheduledAt: futureAt,
            createdBy: uid,
        });

        await TeamService.createScheduledGame(iowaStateTeamId, {
            teamName: 'Iowa State',
            opponentName: 'Wisconsin',
            opponentTeamId: '',
            location: 'Madison, WI • Crossover scrimmage',
            scheduledAt: futureAt + 4 * 24 * 60 * 60 * 1000,
            createdBy: uid,
        });

        const now = Date.now();
        const offsets = [-5 * 24 * 60 * 60 * 1000, -12 * 24 * 60 * 60 * 1000, -19 * 24 * 60 * 60 * 1000];

        const games: { state: GameState; startedAt: number }[] = [];

        const g1Ref = push(ref(db, 'games'));
        const g1Id = g1Ref.key;
        if (!g1Id) throw new Error('Game id');
        games.push({
            state: synthesizeCompletedGame({
                gameId: g1Id,
                team1Id: universityIowaTeamId,
                team2Id: iowaStateTeamId,
                team2DisplayName: 'Iowa State',
                coachUid: uid,
                gameStartTimestamp: now + offsets[0],
                playersT1: hawkeyePlayers,
                playersT2: cyclonePlayers,
                pointWinners: pointScript15_13(),
                halftimeAfterGoals: 8,
            }),
            startedAt: now + offsets[0],
        });

        const g2Ref = push(ref(db, 'games'));
        const g2Id = g2Ref.key;
        if (!g2Id) throw new Error('Game id');
        games.push({
            state: synthesizeCompletedGame({
                gameId: g2Id,
                team1Id: iowaStateTeamId,
                team2Id: universityIowaTeamId,
                team2DisplayName: 'University of Iowa',
                coachUid: uid,
                gameStartTimestamp: now + offsets[1],
                playersT1: cyclonePlayers,
                playersT2: hawkeyePlayers,
                pointWinners: pointScript15_12_t1(),
                halftimeAfterGoals: 8,
            }),
            startedAt: now + offsets[1],
        });

        const g3Ref = push(ref(db, 'games'));
        const g3Id = g3Ref.key;
        if (!g3Id) throw new Error('Game id');
        games.push({
            state: synthesizeCompletedGame({
                gameId: g3Id,
                team1Id: universityIowaTeamId,
                team2Id: iowaStateTeamId,
                team2DisplayName: 'Iowa State',
                coachUid: uid,
                gameStartTimestamp: now + offsets[2],
                playersT1: hawkeyePlayers,
                playersT2: cyclonePlayers,
                pointWinners: pointScript15_7(),
                halftimeAfterGoals: 9,
            }),
            startedAt: now + offsets[2],
        });

        for (const g of games) {
            await persistFinishedGame(g.state, g.startedAt);
        }

        GameService.clearPastGamesCacheForTeam(universityIowaTeamId);
        GameService.clearPastGamesCacheForTeam(iowaStateTeamId);

        await update(ref(db, `users/${uid}/profile`), {
            [DEMO_PACK_KEY]: true,
            demoUniversityIowaTeamId: universityIowaTeamId,
            demoIowaStateTeamId: iowaStateTeamId,
            demoIowaTeamId: null,
        });

        return { universityIowaTeamId, iowaStateTeamId };
    },

    /**
     * Removes Iowa demo teams, linked games, schedules, join-code maps, and profile demo flags.
     * Safe to call if teams were partially deleted; clears user list entries regardless.
     */
    removeDemoPack: async (uid: string): Promise<void> => {
        const profSnap = await get(ref(db, `users/${uid}/profile`));
        if (!profSnap.exists()) {
            throw new Error('Profile not found.');
        }
        const p = profSnap.val() as Record<string, unknown>;
        if (!p[DEMO_PACK_KEY]) {
            throw new Error('Demo sample is not installed.');
        }
        const uIowa = typeof p.demoUniversityIowaTeamId === 'string' ? p.demoUniversityIowaTeamId : null;
        const isu = typeof p.demoIowaStateTeamId === 'string' ? p.demoIowaStateTeamId : null;
        const teamIds = [uIowa, isu].filter(Boolean) as string[];

        const gameIds = new Set<string>();
        for (const tid of teamIds) {
            const ts = await get(ref(db, `teams/${tid}`));
            if (ts.exists()) {
                const tm = ts.val() as Team;
                if (typeof tm.activeGameId === 'string' && tm.activeGameId.length > 0) {
                    gameIds.add(tm.activeGameId);
                }
            }
            const pg = await get(ref(db, `teams/${tid}/pastGames`));
            if (pg.exists()) {
                Object.keys((pg.val() as Record<string, unknown>) || {}).forEach((id) => gameIds.add(id));
            }
        }

        for (const gid of gameIds) {
            await removeDemoGameArtifacts(gid);
        }

        for (const tid of teamIds) {
            await clearScheduledGamesForTeam(tid);
            await purgeTeamJoinArtifacts(tid);
        }

        const activeTeamId = typeof p.activeTeamId === 'string' ? p.activeTeamId : null;
        const clearActive = activeTeamId ? teamIds.includes(activeTeamId) : false;

        for (const tid of teamIds) {
            const tSnap = await get(ref(db, `teams/${tid}`));
            if (tSnap.exists()) {
                const team = tSnap.val() as Team;
                if (team.coachId === uid) {
                    await TeamService.deleteTeam(tid, uid);
                }
            }
            await set(ref(db, `users/${uid}/spectated_teams/${tid}`), null);
            await set(ref(db, `users/${uid}/coached_teams/${tid}`), null);
        }

        await update(ref(db, `users/${uid}/profile`), {
            [DEMO_PACK_KEY]: null,
            demoUniversityIowaTeamId: null,
            demoIowaStateTeamId: null,
            demoIowaTeamId: null,
            ...(clearActive ? { activeTeamId: null, activeRole: null } : {}),
        });

        for (const tid of teamIds) {
            GameService.clearPastGamesCacheForTeam(tid);
        }
    },
};
