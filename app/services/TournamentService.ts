import { get, onValue, push, ref, set, update } from 'firebase/database';
import { db } from '../../firebaseConfig';
import {
    Tournament,
    TournamentActivityEntry,
    TournamentEngine,
    TournamentEnrollmentMode,
    TournamentMisconductReport,
    TournamentMatch,
    TournamentMatchStatus,
    TournamentParticipant,
    TournamentPrivacy,
    TournamentRoomMessage,
    TournamentSeeding,
    TournamentScoreSubmission,
    TournamentSpiritScore,
    TournamentSpiritSubmission,
    TournamentStage,
    TournamentStanding,
    TournamentStatus,
} from './types';

type ParticipantDraft = {
    name: string;
    rating?: number;
    linkedTeamId?: string;
};

type CreateTournamentDraft = {
    name: string;
    privacy: TournamentPrivacy;
    enrollmentMode: TournamentEnrollmentMode;
    engine: TournamentEngine;
    seeding: TournamentSeeding;
    includeConsolation: boolean;
    participants: ParticipantDraft[];
};

export type TournamentDirectoryItem = {
    tournamentId: string;
    teamId?: string;
    teamName?: string;
    name: string;
    status: TournamentStatus;
    engine: TournamentEngine;
    enrollmentMode: TournamentEnrollmentMode;
    participantCount: number;
    createdAt: number;
    createdBy?: string;
};

const codeChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');
const clampScore = (value: number) => Math.max(0, Math.min(50, Math.floor(value)));

const sanitizeForFirebase = (value: unknown): unknown => {
    if (value === undefined) return null;
    if (value === null) return null;

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForFirebase(item));
    }

    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
            if (nested === undefined) return;
            out[key] = sanitizeForFirebase(nested);
        });
        return out;
    }

    return value;
};

const nextPowerOfTwo = (value: number) => {
    let power = 1;
    while (power < value) power *= 2;
    return power;
};

const generateCode = () => {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
        code += codeChars[Math.floor(Math.random() * codeChars.length)];
    }
    return code;
};

const generateUniqueTournamentCode = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = generateCode();
        const exists = await get(ref(db, `tournamentCodes/${candidate}`));
        if (!exists.exists()) {
            return candidate;
        }
    }

    throw new Error('Unable to generate a unique tournament code. Please try again.');
};

const shuffled = <T,>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

const makeParticipantId = (index: number) => `p_${index + 1}`;

const poolMatchPairKey = (teamAId: string, teamBId: string) => {
    return [teamAId, teamBId].sort().join('__vs__');
};

const hasMatchProgress = (match: TournamentMatch) => {
    return typeof match.teamAScore === 'number'
        || typeof match.teamBScore === 'number'
        || !!match.winnerId
        || !!match.linkedGameId
        || !!match.linkedGameIdB
        || match.matchStatus === 'final'
        || match.matchStatus === 'in_progress'
        || !!match.scoreSubmittedBy;
};

const restoreArchivedPoolMatch = (
    archived: TournamentMatch | undefined,
    nextMatch: TournamentMatch
): TournamentMatch => {
    if (!archived) return nextMatch;

    const sameOrder = archived.teamAId === nextMatch.teamAId && archived.teamBId === nextMatch.teamBId;
    const reversedOrder = archived.teamAId === nextMatch.teamBId && archived.teamBId === nextMatch.teamAId;
    if (!sameOrder && !reversedOrder) return nextMatch;

    const restored: TournamentMatch = {
        ...archived,
        ...nextMatch,
        id: nextMatch.id,
        teamAId: nextMatch.teamAId,
        teamBId: nextMatch.teamBId,
        stage: nextMatch.stage,
        round: nextMatch.round,
        group: nextMatch.group,
    };

    if (reversedOrder) {
        restored.teamAScore = archived.teamBScore;
        restored.teamBScore = archived.teamAScore;
        restored.linkedGameId = archived.linkedGameIdB;
        restored.linkedGameIdB = archived.linkedGameId;
        restored.captainCheckIn = {
            teamA: archived.captainCheckIn?.teamB,
            teamB: archived.captainCheckIn?.teamA,
        };
        if (archived.winnerId === archived.teamAId) restored.winnerId = nextMatch.teamBId;
        if (archived.winnerId === archived.teamBId) restored.winnerId = nextMatch.teamAId;
        if (archived.loserId === archived.teamAId) restored.loserId = nextMatch.teamBId;
        if (archived.loserId === archived.teamBId) restored.loserId = nextMatch.teamAId;
    }

    return restored;
};

const buildParticipants = (drafts: ParticipantDraft[], seeding: TournamentSeeding) => {
    const cleaned = drafts
        .map((item) => ({
            name: normalizeName(item.name),
            rating: typeof item.rating === 'number' ? item.rating : undefined,
            linkedTeamId: item.linkedTeamId,
        }))
        .filter((item) => item.name.length > 0);

    const uniqueByName = new Map<string, ParticipantDraft>();
    cleaned.forEach((item) => {
        const key = item.name.toLowerCase();
        if (!uniqueByName.has(key)) {
            uniqueByName.set(key, item);
        }
    });

    let ordered = Array.from(uniqueByName.values());
    if (seeding === 'random') {
        ordered = shuffled(ordered);
    } else if (seeding === 'rating') {
        ordered = ordered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const record: Record<string, TournamentParticipant> = {};
    ordered.forEach((item, index) => {
        const id = makeParticipantId(index);
        record[id] = {
            id,
            name: item.name,
            seed: index + 1,
            ...(typeof item.rating === 'number' ? { rating: item.rating } : {}),
            ...(item.linkedTeamId ? { linkedTeamId: item.linkedTeamId } : {}),
        };
    });

    return record;
};

const sortedParticipants = (participants: Record<string, TournamentParticipant>) => {
    return Object.values(participants)
        .sort((a, b) => a.seed - b.seed)
        .map((participant) => participant.id);
};

const buildEliminationTree = (
    stage: TournamentStage,
    roundOnePairs: [string, string][],
    idPrefix: string
): Record<string, TournamentMatch> => {
    const matches: Record<string, TournamentMatch> = {};
    const rounds: string[][] = [];

    rounds[0] = roundOnePairs.map((_, index) => `${idPrefix}_r1_m${index + 1}`);

    roundOnePairs.forEach((pair, index) => {
        const id = rounds[0][index];
        matches[id] = {
            id,
            stage,
            round: 1,
            teamAId: pair[0],
            teamBId: pair[1],
        };
    });

    let currentCount = rounds[0].length;
    let round = 2;
    while (currentCount > 1) {
        const nextCount = Math.ceil(currentCount / 2);
        rounds[round - 1] = Array.from({ length: nextCount }, (_, index) => `${idPrefix}_r${round}_m${index + 1}`);

        rounds[round - 1].forEach((id) => {
            matches[id] = {
                id,
                stage,
                round,
                teamAId: '',
                teamBId: '',
            };
        });

        currentCount = nextCount;
        round += 1;
    }

    rounds.forEach((ids, roundIndex) => {
        if (roundIndex === rounds.length - 1) return;
        ids.forEach((matchId, index) => {
            const nextMatchId = rounds[roundIndex + 1][Math.floor(index / 2)];
            matches[matchId].nextMatchId = nextMatchId;
            matches[matchId].nextSlot = index % 2 === 0 ? 'A' : 'B';
        });
    });

    return matches;
};

const buildSingleElim = (
    participantIds: string[],
    includeConsolation: boolean
): { matches: Record<string, TournamentMatch> } => {
    const teamCount = Math.max(2, participantIds.length);
    const bracketSize = nextPowerOfTwo(teamCount);
    const padded = [...participantIds];
    while (padded.length < bracketSize) padded.push('BYE');

    const roundOnePairs: [string, string][] = [];
    const half = bracketSize / 2;
    for (let i = 0; i < half; i += 1) {
        roundOnePairs.push([padded[i], padded[bracketSize - 1 - i]]);
    }

    const championshipMatches = buildEliminationTree('championship', roundOnePairs, 'champ');

    if (!includeConsolation) {
        return { matches: championshipMatches };
    }

    const firstRoundCount = roundOnePairs.length;
    const consolationEntrants = Math.max(2, firstRoundCount);
    const consolationRoundOnePairs = Array.from({ length: Math.ceil(consolationEntrants / 2) }, () => ['', ''] as [string, string]);
    const consolationMatches = buildEliminationTree('consolation', consolationRoundOnePairs, 'cons');

    const champRoundOne = Object.values(championshipMatches)
        .filter((match) => match.round === 1)
        .sort((a, b) => a.id.localeCompare(b.id));
    const consRoundOne = Object.values(consolationMatches)
        .filter((match) => match.round === 1)
        .sort((a, b) => a.id.localeCompare(b.id));

    champRoundOne.forEach((match, index) => {
        const target = consRoundOne[Math.floor(index / 2)];
        if (!target) return;
        match.consolationNextMatchId = target.id;
        match.consolationNextSlot = index % 2 === 0 ? 'A' : 'B';
    });

    return { matches: { ...championshipMatches, ...consolationMatches } };
};

const distributePools = (participantIds: string[], manualPoolAssignments?: Record<string, string>) => {
    const poolCount = participantIds.length >= 8 ? 2 : 1;
    const groups = poolCount === 2 ? ['A', 'B'] : ['A'];
    const pools: Record<string, string[]> = {};
    groups.forEach((group) => {
        pools[group] = [];
    });

    if (poolCount === 1) {
        pools.A = [...participantIds];
        return pools;
    }

    participantIds.forEach((id, index) => {
        if (manualPoolAssignments && manualPoolAssignments[id]) {
            const assignedGroup = manualPoolAssignments[id];
            if (!pools[assignedGroup]) pools[assignedGroup] = [];
            pools[assignedGroup].push(id);
        } else {
            const bucket = index % 4;
            const group = bucket === 0 || bucket === 3 ? 'A' : 'B';
            pools[group].push(id);
        }
    });

    return pools;
};

const buildPoolToBracket = (
    participantIds: string[],
    includeConsolation: boolean,
    manualPoolAssignments?: Record<string, string>
): { pools: Record<string, string[]>; qualifierCount: number; matches: Record<string, TournamentMatch> } => {
    const pools = distributePools(participantIds, manualPoolAssignments);
    const matches: Record<string, TournamentMatch> = {};

    Object.entries(pools).forEach(([group, ids]) => {
        const teams = [...ids];
        if (teams.length % 2 !== 0) teams.push('BYE');
        const numRounds = teams.length - 1;
        const half = teams.length / 2;

        for (let r = 0; r < numRounds; r += 1) {
            for (let i = 0; i < half; i += 1) {
                const teamA = teams[i];
                const teamB = teams[teams.length - 1 - i];
                if (teamA !== 'BYE' && teamB !== 'BYE') {
                    const id = `pool_${group}_r${r+1}_m${i+1}`;
                    matches[id] = {
                        id,
                        stage: 'pool',
                        round: r + 1,
                        group,
                        teamAId: teamA,
                        teamBId: teamB,
                    };
                }
            }
            teams.splice(1, 0, teams.pop() as string);
        }
    });

    let qualifierCount = 2;
    if (participantIds.length >= 10) qualifierCount = 8;
    else if (participantIds.length >= 6) qualifierCount = 4;
    else if (participantIds.length >= 4) qualifierCount = 2;

    qualifierCount = Math.min(qualifierCount, participantIds.length);

    const bracketSize = nextPowerOfTwo(Math.max(2, qualifierCount));
    const roundOnePairs = Array.from({ length: bracketSize / 2 }, () => ['', ''] as [string, string]);
    const championship = buildEliminationTree('championship', roundOnePairs, 'champ');

    let consolation: Record<string, TournamentMatch> = {};
    const nonQualifierCount = Math.max(0, participantIds.length - qualifierCount);
    if (includeConsolation && nonQualifierCount >= 2) {
        const consolationSize = nextPowerOfTwo(nonQualifierCount);
        const consolationRoundOne = Array.from({ length: consolationSize / 2 }, () => ['', ''] as [string, string]);
        consolation = buildEliminationTree('consolation', consolationRoundOne, 'cons');
    }

    return {
        pools,
        qualifierCount,
        matches: {
            ...matches,
            ...championship,
            ...consolation,
        },
    };
};

const getStageMatchesByRound = (matches: Record<string, TournamentMatch>, stage: TournamentStage) => {
    const map = new Map<number, TournamentMatch[]>();
    Object.values(matches)
        .filter((match) => match.stage === stage)
        .forEach((match) => {
            const list = map.get(match.round) || [];
            list.push(match);
            map.set(match.round, list);
        });

    return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map((entry) => ({
            round: entry[0],
            matches: entry[1].sort((a, b) => a.id.localeCompare(b.id)),
        }));
};

const assignSlot = (
    targetMatch: TournamentMatch,
    slot: 'A' | 'B',
    participantId: string
) => {
    if (slot === 'A') {
        if (targetMatch.teamAId !== participantId) {
            targetMatch.teamAId = participantId;
            targetMatch.teamAScore = undefined;
            targetMatch.teamBScore = undefined;
            targetMatch.winnerId = undefined;
            targetMatch.loserId = undefined;
        }
        return;
    }

    if (targetMatch.teamBId !== participantId) {
        targetMatch.teamBId = participantId;
        targetMatch.teamAScore = undefined;
        targetMatch.teamBScore = undefined;
        targetMatch.winnerId = undefined;
        targetMatch.loserId = undefined;
    }
};

const resolveMatchWinner = (match: TournamentMatch) => {
    const teamA = match.teamAId;
    const teamB = match.teamBId;

    if (teamA && teamA !== 'BYE' && (!teamB || teamB === 'BYE')) {
        return { winnerId: teamA, loserId: teamB || '' };
    }
    if (teamB && teamB !== 'BYE' && (!teamA || teamA === 'BYE')) {
        return { winnerId: teamB, loserId: teamA || '' };
    }

    if (!teamA || !teamB || teamA === 'BYE' || teamB === 'BYE') {
        return { winnerId: '', loserId: '' };
    }

    if (typeof match.teamAScore !== 'number' || typeof match.teamBScore !== 'number') {
        return { winnerId: '', loserId: '' };
    }

    if (match.teamAScore === match.teamBScore) {
        return { winnerId: '', loserId: '' };
    }

    if (match.teamAScore > match.teamBScore) {
        return { winnerId: teamA, loserId: teamB };
    }

    return { winnerId: teamB, loserId: teamA };
};

const recomputePoolStandings = (tournament: Tournament) => {
    const pools = tournament.pools || {};
    const participantMap = tournament.participants || {};
    const poolMatches = Object.values(tournament.matches).filter((match) => match.stage === 'pool');

    const standingsByPool: Record<string, TournamentStanding[]> = {};

    Object.entries(pools).forEach(([group, participantIds]) => {
        const stats = new Map<string, Omit<TournamentStanding, 'rank'>>();
        participantIds.forEach((participantId) => {
            stats.set(participantId, {
                participantId,
                wins: 0,
                losses: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                pointDiff: 0,
            });
        });

        const groupMatches = poolMatches.filter((match) => match.group === group);
        groupMatches.forEach((match) => {
            const a = stats.get(match.teamAId);
            const b = stats.get(match.teamBId);
            if (!a || !b) return;
            if (typeof match.teamAScore !== 'number' || typeof match.teamBScore !== 'number') return;

            a.pointsFor += match.teamAScore;
            a.pointsAgainst += match.teamBScore;
            a.pointDiff = a.pointsFor - a.pointsAgainst;

            b.pointsFor += match.teamBScore;
            b.pointsAgainst += match.teamAScore;
            b.pointDiff = b.pointsFor - b.pointsAgainst;

            if (match.teamAScore > match.teamBScore) {
                a.wins += 1;
                b.losses += 1;
            } else if (match.teamBScore > match.teamAScore) {
                b.wins += 1;
                a.losses += 1;
            }
        });

        standingsByPool[group] = Array.from(stats.values())
            .sort((left, right) => {
                if (right.wins !== left.wins) return right.wins - left.wins;
                if (right.pointDiff !== left.pointDiff) return right.pointDiff - left.pointDiff;
                if (right.pointsFor !== left.pointsFor) return right.pointsFor - left.pointsFor;
                const leftSeed = participantMap[left.participantId]?.seed || 999;
                const rightSeed = participantMap[right.participantId]?.seed || 999;
                return leftSeed - rightSeed;
            })
            .map((item, index) => ({ ...item, rank: index + 1 }));
    });

    const standingsRecord: Record<string, TournamentStanding> = {};
    let globalRank = 1;

    Object.keys(standingsByPool)
        .sort()
        .forEach((group) => {
            standingsByPool[group].forEach((row) => {
                standingsRecord[row.participantId] = {
                    ...row,
                    rank: globalRank,
                };
                globalRank += 1;
            });
        });

    return {
        standingsRecord,
        standingsByPool,
    };
};




const pickQualifiers = (
    standingsByPool: Record<string, TournamentStanding[]>,
    qualifierCount: number,
    poolMatchesFinished: boolean
): string[] => {
    if (!poolMatchesFinished) return [];

    const groups = Object.keys(standingsByPool).sort();
    if (groups.length === 0) return [];

    if (groups.length === 1) {
        return standingsByPool[groups[0]].slice(0, qualifierCount).map((row) => row.participantId);
    }

    const qualifiers: string[] = [];
    let place = 0;
    while (qualifiers.length < qualifierCount) {
        for (let i = 0; i < groups.length; i += 1) {
            const row = standingsByPool[groups[i]][place];
            if (!row) continue;
            qualifiers.push(row.participantId);
            if (qualifiers.length === qualifierCount) break;
        }
        place += 1;
        if (place > 10) break;
    }

    return qualifiers;
};

const assignRoundOne = (
    roundOneMatches: TournamentMatch[],
    participantIds: string[]
) => {
    if (roundOneMatches.length === 0) return;

    const bracketSize = roundOneMatches.length * 2;
    const seeded = [...participantIds];
    while (seeded.length < bracketSize) seeded.push('BYE');

    roundOneMatches.forEach((match, index) => {
        match.teamAId = seeded[index] || '';
        match.teamBId = seeded[bracketSize - 1 - index] || '';
        match.teamAScore = undefined;
        match.teamBScore = undefined;
        match.winnerId = undefined;
        match.loserId = undefined;
    });
};

const resetDownstreamMatches = (matches: Record<string, TournamentMatch>, stage: TournamentStage) => {
    Object.values(matches)
        .filter((match) => match.stage === stage && match.round > 1)
        .forEach((match) => {
            match.teamAId = '';
            match.teamBId = '';
            match.teamAScore = undefined;
            match.teamBScore = undefined;
            match.winnerId = undefined;
            match.loserId = undefined;
        });
};

const propagateStage = (matches: Record<string, TournamentMatch>, stage: TournamentStage) => {
    const rounds = getStageMatchesByRound(matches, stage);
    rounds.forEach(({ matches: roundMatches }) => {
        roundMatches.forEach((match) => {
            const { winnerId, loserId } = resolveMatchWinner(match);
            match.winnerId = winnerId || undefined;
            match.loserId = loserId || undefined;

            if (winnerId && match.nextMatchId && match.nextSlot) {
                const next = matches[match.nextMatchId];
                if (next) assignSlot(next, match.nextSlot, winnerId);
            }

            if (stage === 'championship' && loserId && match.consolationNextMatchId && match.consolationNextSlot) {
                const consolation = matches[match.consolationNextMatchId];
                if (consolation) assignSlot(consolation, match.consolationNextSlot, loserId);
            }
        });
    });
};

const recomputeTournament = (tournament: Tournament): Tournament => {
    const matches: Record<string, TournamentMatch> = JSON.parse(JSON.stringify(tournament.matches || {}));
    const nextTournament: Tournament = {
        ...tournament,
        matches,
    };

    
    if (nextTournament.engine === 'pool_to_bracket') {
        const { standingsRecord, standingsByPool } = recomputePoolStandings(nextTournament);
        nextTournament.standings = standingsRecord;

        const poolMatches = Object.values(matches).filter(m => m.stage === 'pool');
        const poolMatchesFinished = poolMatches.length > 0 && poolMatches.every(m => m.winnerId);

        const championshipRoundOne = Object.values(matches)
            .filter((match) => match.stage === 'championship' && match.round === 1)
            .sort((a, b) => a.id.localeCompare(b.id));

        const qualifiers = pickQualifiers(standingsByPool, nextTournament.qualifierCount || championshipRoundOne.length * 2, poolMatchesFinished);
        
        if (poolMatchesFinished) {
            assignRoundOne(championshipRoundOne, qualifiers);
        }

        const consolationRoundOne = Object.values(matches)
            .filter((match) => match.stage === 'consolation' && match.round === 1)
            .sort((a, b) => a.id.localeCompare(b.id));

        if (consolationRoundOne.length > 0 && poolMatchesFinished) {

            const qualifierSet = new Set(qualifiers);
            const nonQualifiers = Object.keys(nextTournament.participants)
                .filter((participantId) => !qualifierSet.has(participantId))
                .sort((left, right) => {
                    const leftSeed = nextTournament.participants[left]?.seed || 999;
                    const rightSeed = nextTournament.participants[right]?.seed || 999;
                    return leftSeed - rightSeed;
                });
            assignRoundOne(consolationRoundOne, nonQualifiers);
        }
    }

    resetDownstreamMatches(matches, 'championship');
    resetDownstreamMatches(matches, 'consolation');

    propagateStage(matches, 'championship');
    propagateStage(matches, 'consolation');

    const championshipFinal = Object.values(matches)
        .filter((match) => match.stage === 'championship')
        .sort((a, b) => b.round - a.round || a.id.localeCompare(b.id))[0];

    if (championshipFinal?.winnerId) {
        nextTournament.status = 'completed';
    }

    return nextTournament;
};

const createSpiritScores = (participants: Record<string, TournamentParticipant>) => {
    const spirit: Record<string, TournamentSpiritScore> = {};
    Object.values(participants).forEach((participant) => {
        spirit[participant.id] = {
            participantId: participant.id,
            rules: 0,
            fouls: 0,
            fairness: 0,
            attitude: 0,
            communication: 0,
            total: 0,
        };
    });
    return spirit;
};

const tournamentsPath = () => `tournaments`;
const tournamentPath = (tournamentId: string) => `${tournamentsPath()}/${tournamentId}`;
const publicTournamentsPath = 'publicTournaments';
const tournamentCodesPath = 'tournamentCodes';

const toDirectoryItem = (tournament: Tournament): TournamentDirectoryItem => {
    return {
        tournamentId: tournament.id,
        teamId: tournament.teamId,
        teamName: tournament.teamName,
        name: tournament.name,
        status: tournament.status,
        engine: tournament.engine,
        enrollmentMode: tournament.enrollmentMode,
        participantCount: Object.keys(tournament.participants || {}).length,
        createdAt: tournament.createdAt,
        createdBy: tournament.createdBy,
    };
};

const buildTournamentIndexUpdates = (
    tournament: Tournament,
    options?: { allowPublicDelete?: boolean }
) => {
    const updates: Record<string, unknown> = {};

    if (tournament.privacy === 'public') {
        updates[`${publicTournamentsPath}/${tournament.id}`] = toDirectoryItem(tournament);
    } else if (options?.allowPublicDelete) {
        updates[`${publicTournamentsPath}/${tournament.id}`] = null;
    }

    if (tournament.adminCode) {
        updates[`${tournamentCodesPath}/${tournament.adminCode}`] = {
            tournamentId: tournament.id,
            createdAt: tournament.createdAt,
            role: 'admin',
            createdBy: tournament.createdBy,
        };
    }

    if (tournament.joinCode) {
        updates[`${tournamentCodesPath}/${tournament.joinCode}`] = {
            tournamentId: tournament.id,
            createdAt: tournament.createdAt,
            privacy: tournament.privacy,
            role: 'spectator',
            createdBy: tournament.createdBy,
        };
    }

    return updates;
};

export const TournamentService = {
    subscribeToMyTournaments: (
        userId: string,
        callback: (tournaments: Tournament[]) => void
    ) => {
        const tournamentsRef = ref(db, tournamentsPath());
        return onValue(tournamentsRef, (snapshot) => {
            const data = snapshot.val() || {};
            const tournaments = Object.entries(data)
                .map(([id, value]) => ({ ...(value as Tournament), id }))
                .filter(t => t.createdBy === userId || t.admins?.[userId])
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(tournaments);
        });
    },

    subscribeToTournament: (
        tournamentId: string,
        callback: (tournament: Tournament | null) => void
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        return onValue(tournamentRef, (snapshot) => {
            if (!snapshot.exists()) {
                callback(null);
                return;
            }
            callback({ ...(snapshot.val() as Tournament), id: tournamentId });
        });
    },

    subscribeToPublicTournaments: (
        callback: (items: TournamentDirectoryItem[]) => void
    ) => {
        const directoryRef = ref(db, publicTournamentsPath);
        return onValue(directoryRef, (snapshot) => {
            const data = snapshot.val() || {};
            const items = Object.entries(data)
                .map(([id, value]) => ({
                    id: id,
                    ...(value as TournamentDirectoryItem),
                }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            callback(items);
        });
    },

    resolveTournamentByCode: async (rawCode: string) => {
        const code = (rawCode || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            throw new Error('Tournament code must be 6 letters or numbers.');
        }

        const mappingRef = ref(db, `${tournamentCodesPath}/${code}`);
        const mappingSnap = await get(mappingRef);
        if (!mappingSnap.exists()) {
            return null;
        }

        const mapping = mappingSnap.val() as { tournamentId: string; role?: string };
        if (!mapping?.tournamentId) {
            return null;
        }

        const tournamentSnap = await get(ref(db, tournamentPath(mapping.tournamentId)));
        if (!tournamentSnap.exists()) {
            return null;
        }

        return {
            tournamentId: mapping.tournamentId,
            role: mapping.role || 'spectator',
            tournament: { ...(tournamentSnap.val() as Tournament), id: mapping.tournamentId },
        };
    },

    joinTournamentAsAdmin: async (adminCode: string, userId: string) => {
        const resolved = await TournamentService.resolveTournamentByCode(adminCode);
        if (!resolved || resolved.role !== 'admin') {
            throw new Error('Invalid or expired admin code.');
        }
        
        const adminRef = ref(db, `${tournamentPath(resolved.tournamentId)}/admins/${userId}`);
        await set(adminRef, true);
        return resolved.tournamentId;
    },

    createTournament: async (
        draft: CreateTournamentDraft,
        creatorId: string
    ): Promise<string> => {
        const tournamentName = normalizeName(draft.name);
        if (tournamentName.length < 3 || tournamentName.length > 80) {
            throw new Error('Tournament name must be 3 to 80 characters.');
        }

        const participants = buildParticipants(draft.participants, draft.seeding);
        const participantIds = sortedParticipants(participants);

        if (participantIds.length < 2) {
            throw new Error('Add at least 2 unique teams for a tournament.');
        }

        let matches: Record<string, TournamentMatch> = {};
        let pools: Record<string, string[]> | undefined;
        let qualifierCount: number | undefined;

        if (draft.engine === 'single_elim') {
            matches = buildSingleElim(participantIds, draft.includeConsolation).matches;
        } else {
            const built = buildPoolToBracket(participantIds, draft.includeConsolation);
            pools = built.pools;
            qualifierCount = built.qualifierCount;
            matches = built.matches;
        }

        const tournamentsRef = ref(db, tournamentsPath());
        const newRef = push(tournamentsRef);
        if (!newRef.key) {
            throw new Error('Could not create tournament ID.');
        }

        const adminCode = await generateUniqueTournamentCode();
        const joinCode = draft.privacy === 'private' ? await generateUniqueTournamentCode() : undefined;

        const tournament: Tournament = {
            id: newRef.key,
            name: tournamentName,
            privacy: draft.privacy,
            adminCode,
            admins: { [creatorId]: true },
            ...(joinCode ? { joinCode } : {}),
            enrollmentMode: draft.enrollmentMode,
            engine: draft.engine,
            seeding: draft.seeding,
            includeConsolation: draft.includeConsolation,
            status: 'draft',
            createdAt: Date.now(),
            createdBy: creatorId,
            participants,
            ...(pools ? { pools } : {}),
            ...(typeof qualifierCount === 'number' ? { qualifierCount } : {}),
            matches,
            standings: {},
            spiritScores: createSpiritScores(participants),
            runMode: draft.enrollmentMode === 'open' ? 'team_self_serve' : 'manual',
            teamSelfServeEnabled: draft.enrollmentMode === 'open',
            coachChatEnabled: draft.enrollmentMode === 'open',
            teamScoreSubmissionEnabled: draft.enrollmentMode === 'open',
            requireScoreVerification: draft.enrollmentMode === 'open',
            scoreChallengeWindowMinutes: 15,
            mandatorySpiritEnabled: false,
            spiritLeaderboardEnabled: true,
            misconductTrackingEnabled: true,
            observerOnlyCards: false,
            playerClaimingEnabled: false,
            tradingCardsEnabled: true,
            statPrivacyDefault: 'team',
            lineCallAssistantEnabled: true,
            practiceKpiEnabled: false,
            recapCardsEnabled: true,
            teamSpecificNotificationsEnabled: true,
            predictionEnabled: true,
            publicBracketEnabled: true,
            publicRosterStatsEnabled: true,
            fieldAssignmentPublic: true,
            matchRoomMediaEnabled: false,
            bracketPredictionEnabled: true,
            spiritChampionBadgeEnabled: true,
            tournamentPageDensity: 'comfortable',
            recapCardStyle: 'classic',
            coachChatVisibility: 'coaches_only',
        };

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(newRef.key)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };
        await update(ref(db), updates);
        return newRef.key;
    },

    updateMatchScore: async (
        tournamentId: string,
        matchId: string,
        teamAScore: number,
        teamBScore: number
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId };
        const target = tournament.matches?.[matchId];
        if (!target) throw new Error('Match not found.');

        target.teamAScore = clampScore(teamAScore);
        target.teamBScore = clampScore(teamBScore);

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };
        await update(ref(db), updates);
    },

    submitMatchScoreFromGame: async (
        tournamentId: string,
        matchId: string,
        gameId: string,
        participantId: string
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const [tournamentSnap, gameSnap] = await Promise.all([
            get(tournamentRef),
            get(ref(db, `games/${gameId}`)),
        ]);
        if (!tournamentSnap.exists()) throw new Error('Tournament not found.');
        if (!gameSnap.exists()) throw new Error('Linked game not found.');

        const tournament = { ...(tournamentSnap.val() as Tournament), id: tournamentId };
        const match = tournament.matches?.[matchId];
        if (!match) throw new Error('Match not found.');

        const game = gameSnap.val() as { score1?: number; score2?: number; currentRecorderId?: string };
        const submittedAsTeamB = participantId === match.teamBId;
        const teamAScore = submittedAsTeamB ? clampScore(Number(game.score2 || 0)) : clampScore(Number(game.score1 || 0));
        const teamBScore = submittedAsTeamB ? clampScore(Number(game.score1 || 0)) : clampScore(Number(game.score2 || 0));

        const submission: TournamentScoreSubmission = {
            participantId,
            submittedByUid: game.currentRecorderId || '',
            teamAScore,
            teamBScore,
            linkedGameId: gameId,
            createdAt: Date.now(),
        };

        match.scoreSubmittedBy = {
            ...(match.scoreSubmittedBy || {}),
            [participantId]: submission,
        };
        match.matchStatus = tournament.requireScoreVerification ? 'in_progress' : 'final';
        match.verificationStatus = tournament.requireScoreVerification ? 'pending' : 'verified';
        if (participantId === match.teamAId) match.linkedGameId = gameId;
        if (participantId === match.teamBId) match.linkedGameIdB = gameId;

        const submissions = Object.values(match.scoreSubmittedBy);
        const matchingSubmission = submissions.find((entry) => (
            entry.participantId !== participantId &&
            entry.teamAScore === teamAScore &&
            entry.teamBScore === teamBScore
        ));

        if (!tournament.requireScoreVerification || matchingSubmission || submissions.length >= 2) {
            match.teamAScore = teamAScore;
            match.teamBScore = teamBScore;
            match.matchStatus = matchingSubmission || !tournament.requireScoreVerification ? 'final' : 'in_progress';
            match.verificationStatus = matchingSubmission || !tournament.requireScoreVerification ? 'verified' : 'challenged';
            if (match.verificationStatus === 'verified') {
                match.verifiedAt = Date.now();
                match.challengeDeadlineAt = Date.now() + ((tournament.scoreChallengeWindowMinutes || 15) * 60 * 1000);
            }
        }

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };
        await update(ref(db), updates);

        const statusText = match.verificationStatus === 'challenged'
            ? 'Score submissions disagree and need TD review.'
            : `Score submitted from linked game: ${teamAScore}-${teamBScore}`;
        await TournamentService.logActivity(tournamentId, statusText, 'score');
    },

    verifyMatchScore: async (
        tournamentId: string,
        matchId: string,
        verifierUid: string,
        teamAScore?: number,
        teamBScore?: number
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId };
        const match = tournament.matches?.[matchId];
        if (!match) throw new Error('Match not found.');

        if (typeof teamAScore === 'number') match.teamAScore = clampScore(teamAScore);
        if (typeof teamBScore === 'number') match.teamBScore = clampScore(teamBScore);
        match.verificationStatus = 'verified';
        match.matchStatus = 'final';
        match.verifiedAt = Date.now();
        match.verifiedBy = verifierUid;
        match.challengeDeadlineAt = Date.now() + ((tournament.scoreChallengeWindowMinutes || 15) * 60 * 1000);

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        await update(ref(db), {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        });
    },

    challengeMatchScore: async (
        tournamentId: string,
        matchId: string,
        participantId: string,
        reason: string
    ) => {
        const cleanReason = reason.trim().slice(0, 500);
        await update(ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}`), {
            verificationStatus: 'challenged',
            challengedByParticipantId: participantId,
            challengeReason: cleanReason,
        });
        await TournamentService.logActivity(tournamentId, 'A score challenge was opened for TD review.', 'system');
    },

    updateStatus: async (
        tournamentId: string,
        status: TournamentStatus
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId, status };
        const sanitizedTournament = sanitizeForFirebase(tournament) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        };

        await update(ref(db), updates);
    },

    updateSpiritScore: async (
        tournamentId: string,
        participantId: string,
        scores: {
            rules: number;
            fouls: number;
            fairness: number;
            attitude: number;
            communication: number;
        }
    ) => {
        const clampSpirit = (value: number) => Math.max(0, Math.min(4, Math.floor(value)));
        const rules = clampSpirit(scores.rules);
        const fouls = clampSpirit(scores.fouls);
        const fairness = clampSpirit(scores.fairness);
        const attitude = clampSpirit(scores.attitude);
        const communication = clampSpirit(scores.communication);
        const total = rules + fouls + fairness + attitude + communication;

        const spiritRef = ref(db, `${tournamentPath(tournamentId)}/spiritScores/${participantId}`);
        await set(spiritRef, {
            participantId,
            rules,
            fouls,
            fairness,
            attitude,
            communication,
            total,
        } as TournamentSpiritScore);
    },

    submitMatchSpiritScore: async (
        tournamentId: string,
        matchId: string,
        fromParticipantId: string,
        forParticipantId: string,
        submittedByUid: string,
        scores: {
            rules: number;
            fouls: number;
            fairness: number;
            attitude: number;
            communication: number;
        }
    ) => {
        const clampSpirit = (value: number) => Math.max(0, Math.min(4, Math.floor(value)));
        const submission: TournamentSpiritSubmission = {
            matchId,
            fromParticipantId,
            forParticipantId,
            submittedByUid,
            rules: clampSpirit(scores.rules),
            fouls: clampSpirit(scores.fouls),
            fairness: clampSpirit(scores.fairness),
            attitude: clampSpirit(scores.attitude),
            communication: clampSpirit(scores.communication),
            total: 0,
            createdAt: Date.now(),
        };
        submission.total = submission.rules + submission.fouls + submission.fairness + submission.attitude + submission.communication;

        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId };
        const key = `${fromParticipantId}_${forParticipantId}`;
        const submissionsForMatch = {
            ...(tournament.spiritSubmissions?.[matchId] || {}),
            [key]: submission,
        };
        tournament.spiritSubmissions = {
            ...(tournament.spiritSubmissions || {}),
            [matchId]: submissionsForMatch,
        };

        const allForParticipant = Object.values(tournament.spiritSubmissions)
            .flatMap((matchSubmissions) => Object.values(matchSubmissions || {}))
            .filter((entry) => entry.forParticipantId === forParticipantId);

        if (allForParticipant.length > 0) {
            const avg = allForParticipant.reduce((acc, entry) => ({
                rules: acc.rules + entry.rules,
                fouls: acc.fouls + entry.fouls,
                fairness: acc.fairness + entry.fairness,
                attitude: acc.attitude + entry.attitude,
                communication: acc.communication + entry.communication,
            }), { rules: 0, fouls: 0, fairness: 0, attitude: 0, communication: 0 });

            const divisor = allForParticipant.length;
            const spiritScore: TournamentSpiritScore = {
                participantId: forParticipantId,
                rules: Math.round(avg.rules / divisor),
                fouls: Math.round(avg.fouls / divisor),
                fairness: Math.round(avg.fairness / divisor),
                attitude: Math.round(avg.attitude / divisor),
                communication: Math.round(avg.communication / divisor),
                total: Math.round(allForParticipant.reduce((sum, entry) => sum + entry.total, 0) / divisor),
            };
            tournament.spiritScores = {
                ...(tournament.spiritScores || {}),
                [forParticipantId]: spiritScore,
            };
        }

        const sanitizedTournament = sanitizeForFirebase(tournament) as Tournament;
        await update(ref(db), {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament),
        });
    },

    appendMatchRoomMessage: async (
        tournamentId: string,
        matchId: string,
        senderUid: string,
        message: string,
        participantId?: string
    ) => {
        const cleanMessage = message.trim().slice(0, 1000);
        if (!cleanMessage) throw new Error('Message is required.');

        const messageRef = push(ref(db, `${tournamentPath(tournamentId)}/roomMessages/${matchId}`));
        if (!messageRef.key) throw new Error('Could not create message.');

        const payload: TournamentRoomMessage = {
            id: messageRef.key,
            matchId,
            senderUid,
            ...(participantId ? { participantId } : {}),
            message: cleanMessage,
            createdAt: Date.now(),
        };

        await set(messageRef, payload);
        return payload.id;
    },

    reportMisconduct: async (
        tournamentId: string,
        report: Omit<TournamentMisconductReport, 'id' | 'createdAt' | 'status'>
    ) => {
        const reportRef = push(ref(db, `${tournamentPath(tournamentId)}/misconductReports`));
        if (!reportRef.key) throw new Error('Could not create report.');

        const payload: TournamentMisconductReport = {
            ...report,
            id: reportRef.key,
            reason: report.reason.trim().slice(0, 1000),
            createdAt: Date.now(),
            status: 'open',
        };

        await set(reportRef, payload);
        await TournamentService.logActivity(tournamentId, 'A misconduct report was submitted for TD review.', 'system');
        return payload.id;
    },

    updateTournamentSettings: async (
        tournamentId: string,
        settings: Partial<Tournament>
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snapshot.val() as Tournament), id: tournamentId, ...settings };
        const sanitizedTournament = sanitizeForFirebase(tournament) as Tournament;
        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament, { allowPublicDelete: true }),
        };
        await update(ref(db), updates);
    },

    updateMatchScheduledTime: async (
        tournamentId: string,
        matchId: string,
        scheduledTime: string
    ) => {
        const matchRef = ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/scheduledTime`);
        await set(matchRef, scheduledTime || null);
    },

    addParticipant: async (
        tournamentId: string,
        participant: { name: string; linkedTeamId?: string }
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        
        if (tournament.status !== 'draft') {
            throw new Error('Cannot add teams after the tournament has started generating matches.');
        }

        if (tournament.enrollmentDeadline && new Date().toISOString() > tournament.enrollmentDeadline) {
            throw new Error('The enrollment deadline has passed.');
        }

        const pId = `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const newParticipant = {
            id: pId,
            name: participant.name,
            seed: Object.keys(tournament.participants || {}).length + 1,
            ...(participant.linkedTeamId ? { linkedTeamId: participant.linkedTeamId } : {}),
        };

        const participantRef = ref(db, `${tournamentPath(tournamentId)}/participants/${pId}`);
        await set(participantRef, newParticipant);
    },

    updateParticipant: async (
        tournamentId: string,
        participantId: string,
        name: string
    ) => {
        const participantRef = ref(db, `${tournamentPath(tournamentId)}/participants/${participantId}/name`);
        await set(participantRef, name);
    },

    removeParticipant: async (
        tournamentId: string,
        participantId: string
    ) => {
        const updates: Record<string, unknown> = {
            [`${tournamentPath(tournamentId)}/participants/${participantId}`]: null,
            [`${tournamentPath(tournamentId)}/standings/${participantId}`]: null,
            [`${tournamentPath(tournamentId)}/spirit/${participantId}`]: null,
            [`${tournamentPath(tournamentId)}/manualPoolAssignments/${participantId}`]: null,
        };
        await update(ref(db), updates);
    },

    updateParticipantPool: async (
        tournamentId: string,
        participantId: string,
        poolKey: string | null
    ) => {
        const refPath = `${tournamentPath(tournamentId)}/manualPoolAssignments/${participantId}`;
        await set(ref(db, refPath), poolKey || null);
    },

    addCustomMatch: async (
        tournamentId: string,
        teamAId: string,
        teamBId: string
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        if (tournament.status === 'draft') {
            throw new Error('Start the tournament first to add pool matches.');
        }

        const matchId = `M_CUSTOM_${Date.now()}`;
        const newMatch: TournamentMatch = {
            id: matchId,
            stage: 'pool',
            round: 1, // Custom matches can just be grouped into Round 1 of pool play
            teamAId,
            teamBId,
        };

        const updates: Record<string, unknown> = {
            [`${tournamentPath(tournamentId)}/matches/${matchId}`]: newMatch,
        };
        
        // Let's also do a fresh recompute to ensure standings pick it up immediately
        const nextTournament = recomputeTournament({
            ...tournament,
            matches: {
                ...(tournament.matches || {}),
                [matchId]: newMatch
            }
        });

        const sanitized = sanitizeForFirebase(nextTournament);
        updates[`${tournamentPath(tournamentId)}`] = sanitized;
        await update(ref(db), updates);
    },

    overrideBracketMatch: async (
        tournamentId: string,
        matchId: string,
        slot: 'A' | 'B',
        participantId: string
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        const match = tournament.matches?.[matchId];
        if (!match) throw new Error('Match not found.');

        if (slot === 'A') match.teamAId = participantId;
        else match.teamBId = participantId;

        // Reset scores because teams changed
        match.teamAScore = undefined;
        match.teamBScore = undefined;
        match.winnerId = undefined;
        match.loserId = undefined;

        const nextTournament = recomputeTournament(tournament);
        const sanitized = sanitizeForFirebase(nextTournament);

        const updates: Record<string, unknown> = {
            [`${tournamentPath(tournamentId)}`]: sanitized,
        };
        await update(ref(db), updates);
    },

    postAnnouncement: async (
        tournamentId: string,
        message: string
    ) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        const feed = tournament.announcementFeed || [];
        feed.unshift({
            id: `ANN_${Date.now()}`,
            message,
            timestamp: Date.now()
        });

        await update(ref(db), {
            [`${tournamentPath(tournamentId)}/announcementFeed`]: feed
        });
    },

    startTournament: async (tournamentId: string) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');

        const tournament = snapshot.val() as Tournament;
        if (tournament.status !== 'draft') {
            throw new Error('Tournament already started.');
        }

        const participantIds = sortedParticipants(tournament.participants || {});
        if (participantIds.length < 2) {
            throw new Error('Need at least 2 participants to start.');
        }

        let matches: Record<string, TournamentMatch> = {};
        let pools: Record<string, string[]> | undefined;
        let qualifierCount: number | undefined;

        if (tournament.engine === 'single_elim') {
            matches = buildSingleElim(participantIds, tournament.includeConsolation).matches;
        } else {
            const built = buildPoolToBracket(participantIds, tournament.includeConsolation, tournament.manualPoolAssignments);
            pools = built.pools;
            qualifierCount = built.qualifierCount;
            matches = built.matches;
        }

        tournament.status = 'active';
        tournament.matches = matches;
        if (pools) tournament.pools = pools;
        if (qualifierCount !== undefined) tournament.qualifierCount = qualifierCount;

        const nextTournament = recomputeTournament(tournament);

        const updates = {
            [tournamentPath(tournamentId)]: nextTournament,
            ...buildTournamentIndexUpdates(nextTournament, { allowPublicDelete: true }),
        };
        await update(ref(db), updates);
    },

    // ─── Pool Configuration ─────────────────────────────────
    updatePoolConfig: async (
        tournamentId: string,
        config: { poolCount?: number; poolSize?: number; qualifiersPerPool?: number; poolFormat?: 'round_robin' | 'partial' }
    ) => {
        const snap = await get(ref(db, tournamentPath(tournamentId)));
        if (!snap.exists()) throw new Error('Tournament not found.');

        const tournament = { ...(snap.val() as Tournament), id: tournamentId };
        const shouldRebuildPools = config.poolCount !== undefined && config.poolCount >= 1;

        if (config.poolCount !== undefined) tournament.poolCount = config.poolCount;
        if (config.poolSize !== undefined) tournament.poolSize = config.poolSize;
        if (config.qualifiersPerPool !== undefined) tournament.qualifiersPerPool = config.qualifiersPerPool;
        if (config.poolFormat !== undefined) tournament.poolFormat = config.poolFormat;

        if (shouldRebuildPools) {
            const participants = tournament.participants || {};
            const participantIds = sortedParticipants(participants);
            const poolCount = config.poolCount!;

            const poolLabels = Array.from({ length: poolCount }, (_, i) => String.fromCharCode(65 + i));
            const newPools: Record<string, string[]> = {};
            poolLabels.forEach(l => { newPools[l] = []; });

            participantIds.forEach((id, idx) => {
                const cycle = Math.floor(idx / poolCount);
                const pos = idx % poolCount;
                const poolIndex = cycle % 2 === 0 ? pos : poolCount - 1 - pos;
                newPools[poolLabels[poolIndex]].push(id);
            });

            const oldMatches = tournament.matches || {};
            const hadPoolProgress = Object.values(oldMatches).some((match) => match.stage === 'pool' && hasMatchProgress(match));
            const archivedPoolMatches: Record<string, TournamentMatch> = {
                ...(tournament.archivedPoolMatches || {}),
            };

            Object.values(oldMatches).forEach((match) => {
                if (match.stage !== 'pool' || !match.teamAId || !match.teamBId) return;
                archivedPoolMatches[poolMatchPairKey(match.teamAId, match.teamBId)] = match;
            });

            const nextMatches: Record<string, TournamentMatch> = {};
            Object.entries(oldMatches).forEach(([id, match]) => {
                if (match.stage !== 'pool') {
                    nextMatches[id] = match;
                }
            });

            poolLabels.forEach(poolLabel => {
                const teamIds = newPools[poolLabel];
                let matchCounter = 1;
                for (let i = 0; i < teamIds.length; i++) {
                    for (let j = i + 1; j < teamIds.length; j++) {
                        const matchId = `pool_${poolLabel}_m${matchCounter}`;
                        const baseMatch: TournamentMatch = {
                            id: matchId,
                            stage: 'pool',
                            round: 1,
                            group: poolLabel,
                            teamAId: teamIds[i],
                            teamBId: teamIds[j],
                            matchStatus: 'upcoming',
                        };
                        const archived = archivedPoolMatches[poolMatchPairKey(teamIds[i], teamIds[j])];
                        nextMatches[matchId] = restoreArchivedPoolMatch(archived, baseMatch);
                        matchCounter++;
                    }
                }
            });

            tournament.pools = newPools;
            tournament.matches = nextMatches;
            tournament.archivedPoolMatches = archivedPoolMatches;
            if (hadPoolProgress) {
                const log = tournament.activityLog || [];
                log.unshift({
                    id: `LOG_${Date.now()}`,
                    message: 'Pool configuration changed after pool matches had progress. Matching games were archived and restored by team pairing when possible.',
                    timestamp: Date.now(),
                    type: 'schedule',
                });
                tournament.activityLog = log.slice(0, 100);
            }
        }

        const normalized = recomputeTournament(tournament);
        const sanitizedTournament = sanitizeForFirebase(normalized) as Tournament;
        await update(ref(db), {
            [tournamentPath(tournamentId)]: sanitizedTournament,
            ...buildTournamentIndexUpdates(sanitizedTournament, { allowPublicDelete: true }),
        });
    },

    // ─── Bracket Configuration ──────────────────────────────
    updateBracketConfig: async (
        tournamentId: string,
        config: { bracketFormat?: string; includeConsolation?: boolean; includeThirdPlace?: boolean; crossoverEnabled?: boolean; qualifiersPerPool?: number }
    ) => {
        const updates: Record<string, unknown> = {};
        if (config.bracketFormat !== undefined) updates[`${tournamentPath(tournamentId)}/bracketFormat`] = config.bracketFormat;
        if (config.includeConsolation !== undefined) updates[`${tournamentPath(tournamentId)}/includeConsolation`] = config.includeConsolation;
        if (config.includeThirdPlace !== undefined) updates[`${tournamentPath(tournamentId)}/includeThirdPlace`] = config.includeThirdPlace;
        if (config.crossoverEnabled !== undefined) updates[`${tournamentPath(tournamentId)}/crossoverEnabled`] = config.crossoverEnabled;
        if (config.qualifiersPerPool !== undefined) updates[`${tournamentPath(tournamentId)}/qualifiersPerPool`] = config.qualifiersPerPool;
        await update(ref(db), updates);
    },

    // ─── Match Status ───────────────────────────────────────
    updateMatchStatus: async (tournamentId: string, matchId: string, status: TournamentMatchStatus) => {
        await set(ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/matchStatus`), status);
    },

    // ─── Field Assignment ───────────────────────────────────
    updateMatchField: async (tournamentId: string, matchId: string, fieldName: string) => {
        await set(ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/fieldName`), fieldName || null);
    },

    // ─── Day Assignment ────────────────────────────────────
    updateMatchDay: async (tournamentId: string, matchId: string, day: number | null) => {
        await set(ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/day`), day);
    },

    // ─── Captain Check-In ──────────────────────────────────
    captainCheckIn: async (tournamentId: string, matchId: string, slot: 'teamA' | 'teamB') => {
        await set(ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/captainCheckIn/${slot}`), true);
    },

    // ─── Schedule Hold ─────────────────────────────────────
    setScheduleHold: async (tournamentId: string, active: boolean, reason?: string) => {
        const hold = active ? { active: true, reason: reason || 'Schedule suspended', since: Date.now() } : null;
        await set(ref(db, `${tournamentPath(tournamentId)}/scheduleHold`), hold);
    },

    // ─── Activity Log ──────────────────────────────────────
    logActivity: async (tournamentId: string, message: string, type: TournamentActivityEntry['type'] = 'system') => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) return;
        const tournament = snapshot.val() as Tournament;
        const log = tournament.activityLog || [];
        log.unshift({ id: `LOG_${Date.now()}`, message, timestamp: Date.now(), type });
        // Keep only last 100 entries
        if (log.length > 100) log.length = 100;
        await set(ref(db, `${tournamentPath(tournamentId)}/activityLog`), log);
    },

    // ─── Linked Game Integration ───────────────────────────
    linkGameToMatch: async (tournamentId: string, matchId: string, gameId: string, slot: 'A' | 'B') => {
        const field = slot === 'A' ? 'linkedGameId' : 'linkedGameIdB';
        await set(ref(db, `${tournamentPath(tournamentId)}/matches/${matchId}/${field}`), gameId);
    },

    syncLinkedGameScore: async (tournamentId: string, matchId: string) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) throw new Error('Tournament not found.');
        const tournament = snapshot.val() as Tournament;
        const match = tournament.matches?.[matchId];
        if (!match) throw new Error('Match not found.');

        // Try Team A's game first, then Team B's
        const gameId = match.linkedGameId || match.linkedGameIdB;
        if (!gameId) throw new Error('No linked game found.');

        const gameSnap = await get(ref(db, `games/${gameId}`));
        if (!gameSnap.exists()) throw new Error('Linked game not found.');
        const game = gameSnap.val();

        if (game.isGameActive) throw new Error('Game is still in progress.');

        // Determine which score maps to which team
        const scoreA = game.score1;
        const scoreB = game.score2;

        await TournamentService.updateMatchScore(tournamentId, matchId, scoreA, scoreB);
        await TournamentService.updateMatchStatus(tournamentId, matchId, 'final');
        await TournamentService.logActivity(tournamentId, `Score synced from live game: ${scoreA}-${scoreB}`, 'score');
    },

    // ─── Schedule Days Config ──────────────────────────────
    updateScheduleDays: async (tournamentId: string, days: number) => {
        await set(ref(db, `${tournamentPath(tournamentId)}/scheduleDays`), days);
    },

    deleteTournament: async (tournamentId: string) => {
        const tournamentRef = ref(db, tournamentPath(tournamentId));
        const snapshot = await get(tournamentRef);
        if (!snapshot.exists()) return;
        const tournament = snapshot.val() as Tournament;

        const updates: Record<string, unknown> = {
            [tournamentPath(tournamentId)]: null,
        };

        if (tournament.privacy === 'public') {
            updates[`${publicTournamentsPath}/${tournamentId}`] = null;
        }
        if (tournament.adminCode) {
            updates[`${tournamentCodesPath}/${tournament.adminCode}`] = null;
        }
        if (tournament.joinCode) {
            updates[`${tournamentCodesPath}/${tournament.joinCode}`] = null;
        }

        await update(ref(db), updates);
    },
};

