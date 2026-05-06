import { Team } from './types';

/** Prefer stored demo ids; otherwise match coached Hawkeyes + spectated Iowa State. */
export function resolveDemoTourTeamIds(
    stored: { u: string; follow: string } | null | undefined,
    teams: Team[]
): { u: string; follow: string } {
    if (stored?.u && stored?.follow) {
        return { u: stored.u, follow: stored.follow };
    }
    const coached = teams.filter((t) => t.role === 'coach');
    const spectated = teams.filter((t) => t.role === 'spectator');
    const universityIowa = coached.find((t) => t.name === 'University of Iowa');
    const iowaState = spectated.find((t) => t.name === 'Iowa State');
    if (universityIowa && iowaState) {
        return { u: universityIowa.id, follow: iowaState.id };
    }
    return { u: '', follow: '' };
}
