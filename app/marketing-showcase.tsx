import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, ImageBackground, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SceneShell from './components/SceneShell';
import { getTypography, Layout } from './theme/DesignSystem';
import { ThemeColors, useTheme } from './theme/ThemeContext';

export type Mode = 'recorder' | 'spectate' | 'team' | 'tournament';
type TeamKey = 'iowa' | 'isu';
type EventType = 'Pass' | 'Goal' | 'Throwaway' | 'Drop' | 'D-Block' | 'Opponent Turnover' | 'Opponent Score' | 'Timeout' | 'Halftime';

type Player = {
  id: string;
  name: string;
  number: string;
  line: 'O' | 'D' | 'flex';
  goals: number;
  assists: number;
  blocks: number;
  turns: number;
  passes: number;
};

type GameEvent = {
  id: string;
  type: EventType;
  label: string;
  team: TeamKey;
};

const initialRoster: Player[] = [
  { id: 'jordan', name: 'Jordan Kaczor', number: '4', line: 'O', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
  { id: 'morgan', name: 'Morgan Ellis', number: '7', line: 'O', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
  { id: 'sam', name: 'Sam Rivera', number: '11', line: 'O', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
  { id: 'taylor', name: 'Taylor Quinn', number: '14', line: 'O', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
  { id: 'riley', name: 'Riley Chen', number: '2', line: 'D', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
  { id: 'casey', name: 'Casey Brooks', number: '9', line: 'D', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
  { id: 'jamie', name: 'Jamie Ortiz', number: '16', line: 'D', goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 },
];

const initialEvents: GameEvent[] = [
  { id: 'seed-1', type: 'Goal', label: 'GOAL by Taylor from Sam', team: 'iowa' },
  { id: 'seed-2', type: 'Pass', label: 'PASS Morgan to Sam', team: 'iowa' },
  { id: 'seed-3', type: 'D-Block', label: 'D-BLOCK by Riley', team: 'iowa' },
  { id: 'seed-4', type: 'Opponent Score', label: 'OPP SCORE by Iowa State', team: 'isu' },
];

const spectateScript: Array<{ type: EventType; player: string; label: string; team: TeamKey; score?: TeamKey; x: number; y: number }> = [
  { type: 'Pass', player: 'jordan', label: 'Jordan to Morgan', team: 'iowa', x: 31, y: 52 },
  { type: 'Pass', player: 'morgan', label: 'Morgan to Sam', team: 'iowa', x: 49, y: 45 },
  { type: 'Goal', player: 'taylor', label: 'Taylor scores from Sam', team: 'iowa', score: 'iowa', x: 84, y: 48 },
  { type: 'Pass', player: 'isu', label: 'Iowa State working upfield', team: 'isu', x: 38, y: 58 },
  { type: 'Throwaway', player: 'isu', label: 'Iowa State throwaway', team: 'isu', x: 52, y: 36 },
  { type: 'D-Block', player: 'riley', label: 'Riley Chen layout block', team: 'iowa', x: 62, y: 42 },
  { type: 'Goal', player: 'sam', label: 'Sam Rivera break goal', team: 'iowa', score: 'iowa', x: 86, y: 50 },
  { type: 'Opponent Score', player: 'isu', label: 'Iowa State answers', team: 'isu', score: 'isu', x: 82, y: 54 },
];

const completedGames = [
  ['Iowa State', '15 - 13', 'Apr 12'],
  ['Volt', '15 - 12', 'Apr 19'],
  ['Aurora', '15 - 7', 'Apr 26'],
];

const standings = [
  ['1. University of Iowa', '7-0', '+51'],
  ['2. Iowa State', '5-2', '+28'],
  ['3. Volt', '5-2', '+22'],
  ['4. Nimbus', '4-3', '+10'],
  ['5. Aurora', '4-3', '+6'],
  ['6. Drift', '3-4', '-3'],
];

const poolMatches = [
  ['A', 'University of Iowa', 'Drift', '15 - 7'],
  ['A', 'Volt', 'Rift', '13 - 10'],
  ['B', 'Iowa State', 'Aurora', '14 - 11'],
  ['B', 'Nimbus', 'Pulse', '15 - 9'],
  ['C', 'Horizon', 'Summit', '12 - 10'],
  ['C', 'Forge', 'Lumen', '11 - 9'],
  ['D', 'Prairie Fire', 'River City', '13 - 8'],
  ['D', 'Skyline', 'Metro', '10 - 8'],
];

const tournamentTeams = [
  'University of Iowa',
  'Iowa State',
  'Volt',
  'Nimbus',
  'Aurora',
  'Drift',
  'Rift',
  'Pulse',
  'Horizon',
  'Summit',
  'Forge',
  'Lumen',
  'Prairie Fire',
  'River City',
  'Skyline',
  'Metro',
];

const bracketRounds = [
  {
    title: 'Round of 16',
    matches: [
      ['University of Iowa', 'Metro', '15 - 5'],
      ['Iowa State', 'Skyline', '15 - 8'],
      ['Volt', 'River City', '15 - 9'],
      ['Nimbus', 'Prairie Fire', '14 - 11'],
      ['Aurora', 'Lumen', '13 - 10'],
      ['Drift', 'Forge', '12 - 11'],
      ['Rift', 'Summit', '13 - 12'],
      ['Pulse', 'Horizon', '11 - 10'],
    ],
  },
  {
    title: 'Quarterfinals',
    matches: [
      ['University of Iowa', 'Pulse', '15 - 8'],
      ['Iowa State', 'Rift', '14 - 11'],
      ['Volt', 'Drift', '15 - 10'],
      ['Nimbus', 'Aurora', '13 - 11'],
    ],
  },
  {
    title: 'Semifinals',
    matches: [
      ['University of Iowa', 'Nimbus', '15 - 9'],
      ['Iowa State', 'Volt', '15 - 13'],
    ],
  },
  {
    title: 'Final',
    matches: [
      ['University of Iowa', 'Iowa State', '15 - 12'],
    ],
  },
];

const getModeFromLocation = (): Mode => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'recorder';
  const search = new URLSearchParams(window.location.search);
  const fromQuery = search.get('mode');
  const fromHash = window.location.hash.replace('#', '');
  const value = fromQuery || fromHash;
  return value === 'spectate' || value === 'team' || value === 'tournament' ? value : 'recorder';
};

const shortName = (name: string) => name.split(' ')[0];

export default function MarketingShowcaseScreen() {
  const mode = useMemo(getModeFromLocation, []);
  return <MarketingShowcasePage mode={mode} />;
}

export function MarketingShowcasePage({ mode }: { mode: Mode }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <SceneShell>
      <View style={styles.root}>
        {mode === 'spectate' ? <SpectateShowcase colors={colors} /> : null}
        {mode === 'team' ? <TeamShowcase colors={colors} /> : null}
        {mode === 'tournament' ? <TournamentShowcase colors={colors} /> : null}
        {mode === 'recorder' ? <RecorderShowcase colors={colors} /> : null}
      </View>
    </SceneShell>
  );
}

export function RecorderShowcase({ colors }: { colors: ThemeColors }) {
  const styles = getStyles(colors);
  const [score, setScore] = useState({ iowa: 12, isu: 10 });
  const [possession, setPossession] = useState<TeamKey>('iowa');
  const [players, setPlayers] = useState<Player[]>(() => initialRoster);
  const [selectedId, setSelectedId] = useState('morgan');
  const [events, setEvents] = useState<GameEvent[]>(initialEvents);
  const [point, setPoint] = useState(23);
  const [halftime, setHalftime] = useState(false);

  const selectedPlayer = players.find((player) => player.id === selectedId) || players[0];
  const leaders = [...players]
    .sort((a, b) => ((b.goals * 2) + b.assists + b.blocks - b.turns) - ((a.goals * 2) + a.assists + a.blocks - a.turns))
    .slice(0, 4);
  const offenseActive = possession === 'iowa';

  const updatePlayer = (id: string, update: Partial<Player>) => {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...update } : player));
  };

  const pushEvent = (type: EventType, label: string, team: TeamKey = 'iowa') => {
    setEvents((current) => [{ id: `${Date.now()}-${type}`, type, label, team }, ...current].slice(0, 8));
  };

  const record = (type: EventType) => {
    if (type === 'Pass') {
      updatePlayer(selectedPlayer.id, { passes: selectedPlayer.passes + 1 });
      pushEvent(type, `PASS by ${shortName(selectedPlayer.name)}`);
      return;
    }
    if (type === 'Goal') {
      updatePlayer(selectedPlayer.id, { goals: selectedPlayer.goals + 1 });
      setScore((current) => ({ ...current, iowa: current.iowa + 1 }));
      setPossession('isu');
      setPoint((current) => current + 1);
      pushEvent(type, `GOAL by ${shortName(selectedPlayer.name)}`);
      return;
    }
    if (type === 'Throwaway' || type === 'Drop') {
      updatePlayer(selectedPlayer.id, { turns: selectedPlayer.turns + 1 });
      setPossession('isu');
      pushEvent(type, `${type.toUpperCase()} by ${shortName(selectedPlayer.name)}`);
      return;
    }
    if (type === 'D-Block' || type === 'Opponent Turnover') {
      updatePlayer(selectedPlayer.id, { blocks: selectedPlayer.blocks + (type === 'D-Block' ? 1 : 0) });
      setPossession('iowa');
      pushEvent(type, type === 'D-Block' ? `D-BLOCK by ${shortName(selectedPlayer.name)}` : 'OPPONENT TURNOVER');
      return;
    }
    if (type === 'Opponent Score') {
      setScore((current) => ({ ...current, isu: current.isu + 1 }));
      setPossession('iowa');
      setPoint((current) => current + 1);
      pushEvent(type, 'OPP SCORE by Iowa State', 'isu');
      return;
    }
    if (type === 'Halftime') {
      setHalftime((value) => !value);
      pushEvent(type, halftime ? 'END HALFTIME' : 'HALFTIME');
      return;
    }
    pushEvent(type, 'TIMEOUT: University of Iowa');
  };

  const undo = () => setEvents((current) => current.slice(1));

  return (
    <View style={styles.screen}>
      <TopBar title="Game Recorder" colors={colors} />
      <Scoreboard left="UNIVERSITY OF IOWA" right="IOWA STATE" leftScore={score.iowa} rightScore={score.isu} disc={`${possession === 'iowa' ? 'IOWA' : 'ISU'} Disc`} colors={colors} />
      <View style={styles.clockCard}>
        <View>
          <Text style={styles.clockTime}>42:18</Text>
          <Text style={styles.muted}>{halftime ? 'Halftime paused' : 'Soft cap 75m'}</Text>
        </View>
        <View style={styles.clockMeta}>
          <Text style={styles.muted}>Hard 90m</Text>
          <Text style={styles.muted}>Timeout 1:10</Text>
          <Text style={styles.muted}>7v7</Text>
        </View>
      </View>
      <HeaderLine title="Active lineup" chip={`P${point} · ${point % 2 ? 'O' : 'D'}-LINE`} styles={styles} />
      <Text style={styles.contextText}>
        {offenseActive
          ? `${shortName(selectedPlayer.name)} has the disc. Log a pass, goal, throwaway, or drop.`
          : `Iowa is defending. Select the defender and log the block, turnover, or opponent score.`}
      </Text>
      <View style={styles.playerGrid}>
        {players.map((player) => (
          <TouchableOpacity key={player.id} style={[styles.playerButton, selectedId === player.id && styles.playerSelected]} onPress={() => setSelectedId(player.id)}>
            <Text style={[styles.playerName, selectedId === player.id && { color: colors.primary }]}>{shortName(player.name)}</Text>
            <Text style={styles.muted}>#{player.number}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.actionPanel}>
        <Text style={styles.label}>TACTICAL ACTIONS</Text>
        <View style={styles.actionGrid}>
          {offenseActive ? (
            <>
              <ActionButton title="Goal" color={colors.primary} onPress={() => record('Goal')} styles={styles} />
              <ActionButton title="Throwaway" color={colors.error} onPress={() => record('Throwaway')} styles={styles} />
              <ActionButton title="Pass" color={colors.success} onPress={() => record('Pass')} styles={styles} />
              <ActionButton title="Drop" color={colors.warning} onPress={() => record('Drop')} styles={styles} />
            </>
          ) : (
            <>
              <ActionButton title="D-Block" color="#2563EB" onPress={() => record('D-Block')} styles={styles} />
              <ActionButton title="Opp. Turnover" color={colors.success} onPress={() => record('Opponent Turnover')} styles={styles} />
              <ActionButton title="Opp. Score" color={colors.error} onPress={() => record('Opponent Score')} styles={styles} />
              <ActionButton title="Timeout" color={colors.warning} onPress={() => record('Timeout')} styles={styles} />
            </>
          )}
        </View>
        <View style={styles.utilityRow}>
          <TouchableOpacity style={styles.utilityBtn} onPress={undo}><Text style={styles.utilityText}>Undo</Text></TouchableOpacity>
          <TouchableOpacity style={styles.utilityBtn} onPress={() => record('Timeout')}><Text style={styles.utilityText}>Timeout</Text></TouchableOpacity>
          <TouchableOpacity style={styles.utilityBtn} onPress={() => record('Halftime')}><Text style={styles.utilityText}>{halftime ? 'Resume' : 'Halftime'}</Text></TouchableOpacity>
        </View>
      </View>
      <View style={styles.twoColumn}>
        <View style={styles.card}>
          <Text style={styles.label}>LIVE STAT LEADERS</Text>
          {leaders.map((player) => <Text key={player.id} style={styles.feedText}>{shortName(player.name)} · G {player.goals} A {player.assists} D {player.blocks}</Text>)}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>EVENT LOG</Text>
          {events.slice(0, 4).map((event) => <Text key={event.id} style={styles.feedText}>{event.label}</Text>)}
        </View>
      </View>
    </View>
  );
}

export function SpectateShowcase({ colors }: { colors: ThemeColors }) {
  const styles = getStyles(colors);
  const [score, setScore] = useState({ iowa: 8, isu: 8 });
  const [events, setEvents] = useState(spectateScript.slice(0, 2));
  const [index, setIndex] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [prediction, setPrediction] = useState<TeamKey | null>(null);
  const [reactions, setReactions] = useState<Record<string, number>>({ '🔥': 23, '👏': 18, '😱': 9 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return undefined;
    intervalRef.current = setInterval(() => {
      setIndex((current) => {
        const next = spectateScript[current % spectateScript.length];
        setEvents((items) => [next, ...items].slice(0, 8));
        if (next.score) setScore((currentScore) => ({ ...currentScore, [next.score as TeamKey]: currentScore[next.score as TeamKey] + 1 }));
        return current + 1;
      });
    }, 1600);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing]);

  const latest = events[0];
  const addReaction = (emoji: string) => {
    setReactions((current) => ({ ...current, [emoji]: (current[emoji] || 0) + 1 }));
    setEvents((items) => [{ type: 'Timeout', player: 'fan', label: `Fan reaction ${emoji}`, team: latest.team, x: latest.x, y: latest.y }, ...items].slice(0, 8));
  };

  return (
    <View style={styles.screen}>
      <TopBar title="Spectate Live" colors={colors} />
      <Scoreboard left="IOWA" right="ISU" leftScore={score.iowa} rightScore={score.isu} disc={`${latest.team === 'iowa' ? 'IOWA' : 'ISU'} Disc`} colors={colors} />
      <View style={styles.controlRow}>
        <TouchableOpacity style={styles.pillButton} onPress={() => setPlaying((value) => !value)}><Text style={styles.utilityText}>{playing ? 'Pause' : 'Play'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.pillButton} onPress={() => { setScore({ iowa: 8, isu: 8 }); setEvents(spectateScript.slice(0, 2)); setIndex(2); setPlaying(true); }}><Text style={styles.utilityText}>Reset</Text></TouchableOpacity>
        <Text style={styles.clockSmall}>10:22</Text>
      </View>
      <View style={styles.predictionCard}>
        <Text style={styles.label}>PREDICT NEXT POINT</Text>
        <View style={styles.predictionRow}>
          <TouchableOpacity style={[styles.predictionButton, prediction === 'iowa' && styles.predictionActive]} onPress={() => setPrediction('iowa')}>
            <Text style={styles.playerName}>Iowa scores</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.predictionButton, prediction === 'isu' && styles.predictionActive]} onPress={() => setPrediction('isu')}>
            <Text style={styles.playerName}>ISU answers</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.muted}>{prediction ? `${prediction === 'iowa' ? 'Iowa' : 'Iowa State'} prediction locked for this demo.` : 'Tap a prediction to join the live crowd.'}</Text>
      </View>
      <View style={styles.fieldCard}>
        <Text style={styles.label}>LIVE FIELD TRACKER</Text>
        <View style={styles.field}>
          <View style={[styles.fieldLine, { left: '18%' }]} />
          <View style={[styles.fieldLine, { left: '50%', opacity: 0.45 }]} />
          <View style={[styles.fieldLine, { left: '82%' }]} />
          {events.slice(0, 5).map((event, eventIndex) => (
            <View key={`${event.label}-${eventIndex}`} style={[styles.fieldDot, { left: `${event.x}%`, top: `${event.y}%`, opacity: 1 - (eventIndex * 0.13), backgroundColor: event.team === 'iowa' ? colors.primary : colors.error }]} />
          ))}
        </View>
      </View>
      <View style={styles.intelGrid}>
        <Intel label="Momentum" value={latest.team === 'iowa' ? 'Iowa pressure' : 'Iowa State answers'} styles={styles} />
        <Intel label="Pressure" value={String(Math.max(1, 6 - Math.abs(score.iowa - score.isu)))} styles={styles} />
        <Intel label="Territory" value={latest.x > 75 ? 'Red zone' : 'Midfield control'} styles={styles} />
        <Intel label="Live events" value={String(events.length)} styles={styles} />
      </View>
      <View style={styles.reactionRow}>
        {Object.entries(reactions).map(([emoji, count]) => (
          <TouchableOpacity key={emoji} style={styles.reactionButton} onPress={() => addReaction(emoji)}>
            <Text style={styles.reactionEmoji}>{emoji}</Text>
            <Text style={styles.muted}>{count}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>PLAY BY PLAY</Text>
        {events.slice(0, 5).map((event, eventIndex) => <Text key={`${event.label}-${eventIndex}`} style={styles.feedText}>{event.label}</Text>)}
      </View>
    </View>
  );
}

export function TeamShowcase({ colors }: { colors: ThemeColors }) {
  const styles = getStyles(colors);
  return (
    <View style={styles.screen}>
      <TopBar title="University of Iowa" colors={colors} />
      <View style={styles.teamCard}>
        <ImageBackground source={require('../assets/images/iowabanner.webp')} style={styles.banner} imageStyle={styles.bannerImage}>
          <View style={styles.bannerScrim} />
        </ImageBackground>
        <Image source={require('../assets/images/uiowaicon.jpg')} style={styles.avatar} />
        <View style={styles.teamBody}>
          <Text style={styles.teamTitle}>University of Iowa</Text>
          <Text style={styles.muted}>2,487 Followers · Public Team Page</Text>
          <Text style={styles.teamBio}>Demo presentation team with Iowa branding, completed games, roster stats, and fan-facing history.</Text>
        </View>
      </View>
      <View style={styles.statsTape}>
        <Stat label="Win rate" value="100%" styles={styles} />
        <Stat label="PF/G" value="15.0" styles={styles} />
        <Stat label="PA/G" value="10.7" styles={styles} />
      </View>
      <HeaderLine title="Active Roster" chip="12 players" styles={styles} />
      <View style={styles.rosterList}>
        {initialRoster.slice(0, 5).map((player) => (
          <View key={player.id} style={styles.rosterRow}>
            <Text style={styles.playerName}>{player.name}</Text>
            <Text style={styles.muted}>#{player.number} · {player.line}-Line</Text>
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>MATCH HISTORY & STATS</Text>
        {completedGames.map(([opponent, score, date]) => (
          <View key={opponent} style={styles.historyRow}>
            <Text style={styles.playerName}>vs {opponent}</Text>
            <Text style={styles.muted}>{date}</Text>
            <Text style={styles.playerName}>{score}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function TournamentShowcase({ colors }: { colors: ThemeColors }) {
  const styles = getStyles(colors);
  const [tab, setTab] = useState<'Overview' | 'Pools' | 'Bracket' | 'Teams'>('Overview');
  const [roundIndex, setRoundIndex] = useState(3);
  const activeRound = bracketRounds[roundIndex];
  return (
    <View style={styles.screen}>
      <View style={styles.tournamentHero}>
        <View style={styles.heroTop}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
          <Text style={styles.livePill}>COMPLETED</Text>
        </View>
        <Text style={styles.tournamentTitle}>RealUltimate Showcase</Text>
        <Text style={styles.tournamentSub}>Hosted by University of Iowa</Text>
      </View>
      <View style={styles.tabBar}>
        {(['Overview', 'Pools', 'Bracket', 'Teams'] as const).map((item) => (
          <TouchableOpacity key={item} style={[styles.tabButton, tab === item && styles.tabActive]} onPress={() => setTab(item)}>
            <Text style={[styles.tabText, tab === item && { color: colors.primary }]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'Overview' ? (
        <>
          <View style={styles.championCard}>
            <Text style={styles.labelLight}>CHAMPION</Text>
            <Text style={styles.championText}>University of Iowa</Text>
          </View>
          <View style={styles.tableCard}>
            <Text style={styles.label}>FINAL STANDINGS</Text>
            {standings.map(([team, record, pd]) => <TableRow key={team} team={team} record={record} pd={pd} styles={styles} />)}
          </View>
        </>
      ) : null}
      {tab === 'Pools' ? (
        <View style={styles.tableCard}>
          <Text style={styles.label}>POOL PLAY</Text>
          {poolMatches.map(([pool, a, b, score]) => (
            <View key={`${a}-${b}`} style={styles.poolRow}>
              <Text style={styles.chip}>Pool {pool}</Text>
              <Text style={styles.playerName}>{a}</Text>
              <Text style={styles.muted}>{score}</Text>
              <Text style={styles.playerName}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {tab === 'Bracket' ? (
        <View style={styles.tableCard}>
          <Text style={styles.label}>COMPLETED BRACKET</Text>
          <View style={styles.roundSelector}>
            {bracketRounds.map((round, index) => (
              <TouchableOpacity key={round.title} style={[styles.roundButton, roundIndex === index && styles.tabActive]} onPress={() => setRoundIndex(index)}>
                <Text style={[styles.tabText, roundIndex === index && { color: colors.primary }]}>{round.title.replace('Round of ', 'R')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.bracketStack}>
            {activeRound.matches.map(([a, b, score]) => (
              <Match key={`${activeRound.title}-${a}-${b}`} title={activeRound.title} a={a} b={b} score={score} styles={styles} />
            ))}
          </View>
        </View>
      ) : null}
      {tab === 'Teams' ? (
        <View style={styles.teamGrid}>
          {tournamentTeams.map((team, index) => (
            <View key={team} style={styles.teamTile}>
              <Text style={styles.playerName}>{team}</Text>
              <Text style={styles.muted}>Seed {index + 1}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TopBar({ title, colors }: { title: string; colors: ThemeColors }) {
  const styles = getStyles(colors);
  return (
    <View style={styles.topbar}>
      <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
      <Text style={styles.topbarTitle}>{title}</Text>
      <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
    </View>
  );
}

function Scoreboard({ left, right, leftScore, rightScore, disc, colors }: { left: string; right: string; leftScore: number; rightScore: number; disc: string; colors: ThemeColors }) {
  const styles = getStyles(colors);
  return (
    <View style={styles.scoreboard}>
      <View style={[styles.scoreBox, disc.startsWith('IOWA') && styles.scoreBoxActive]}>
        <Text style={styles.scoreLabel}>{left}</Text>
        <Text style={styles.scoreNumber}>{leftScore}</Text>
      </View>
      <View style={styles.discCol}>
        <Ionicons name="radio-button-on" size={32} color={colors.primary} />
        <Text style={styles.muted}>{disc}</Text>
      </View>
      <View style={[styles.scoreBox, disc.startsWith('ISU') && styles.scoreBoxOpp]}>
        <Text style={styles.scoreLabel}>{right}</Text>
        <Text style={styles.scoreNumber}>{rightScore}</Text>
      </View>
    </View>
  );
}

function HeaderLine({ title, chip, styles }: { title: string; chip: string; styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.label}>{title.toUpperCase()}</Text>
      <Text style={styles.chip}>{chip}</Text>
    </View>
  );
}

function ActionButton({ title, color, onPress, styles }: { title: string; color: string; onPress: () => void; styles: ReturnType<typeof getStyles> }) {
  return (
    <TouchableOpacity style={[styles.actionButton, { backgroundColor: color }]} onPress={onPress} activeOpacity={0.78}>
      <Text style={styles.actionText}>{title}</Text>
    </TouchableOpacity>
  );
}

function Intel({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.intelPill}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.intelValue}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Match({ title, a, b, score, styles }: { title: string; a: string; b: string; score: string; styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.matchCard}>
      <Text style={styles.label}>{title.toUpperCase()}</Text>
      <Text style={styles.playerName}>{a}</Text>
      <Text style={styles.muted}>{score}</Text>
      <Text style={styles.playerName}>{b}</Text>
    </View>
  );
}

function TableRow({ team, record, pd, styles }: { team: string; record: string; pd: string; styles: ReturnType<typeof getStyles> }) {
  return (
    <View style={styles.tableRow}>
      <Text style={styles.tableTeam}>{team}</Text>
      <Text style={styles.tableStat}>{record}</Text>
      <Text style={styles.tableStat}>{pd}</Text>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const Typography = getTypography(colors);
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background || '#F8FAFC' },
    screen: { flex: 1, padding: 14, gap: 9, overflow: 'hidden' },
    topbar: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusLg, paddingHorizontal: 14 },
    topbarTitle: { ...Typography.title, fontSize: 16, fontWeight: '800' },
    scoreboard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusLg, padding: 8 },
    scoreBox: { flex: 1, alignItems: 'center', borderRadius: Layout.radiusMd, paddingVertical: 8, backgroundColor: colors.surface },
    scoreBoxActive: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryLight },
    scoreBoxOpp: { borderWidth: 2, borderColor: colors.error, backgroundColor: colors.errorBg },
    scoreLabel: { ...Typography.label, fontSize: 9, textAlign: 'center' },
    scoreNumber: { ...Typography.title, fontSize: 34, fontWeight: '900' },
    discCol: { width: 80, alignItems: 'center', gap: 3 },
    muted: { ...Typography.caption, color: colors.textSecondary, fontSize: 11 },
    clockCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 11 },
    clockTime: { ...Typography.title, fontSize: 23, fontWeight: '900' },
    clockMeta: { alignItems: 'flex-end' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { ...Typography.label, color: colors.textSecondary, fontSize: 10 },
    labelLight: { ...Typography.label, color: 'rgba(255,255,255,0.72)', fontSize: 10 },
    chip: { ...Typography.caption, color: colors.primary, fontWeight: '800', backgroundColor: colors.primaryLight, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
    contextText: { ...Typography.caption, color: colors.success, fontSize: 11, fontWeight: '800' },
    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    playerButton: { width: '31.7%', borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 9 },
    playerSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    playerName: { ...Typography.bodySmall, color: colors.text, fontWeight: '800' },
    actionPanel: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 8 },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    actionButton: { width: '48%', minHeight: 44, borderRadius: Layout.radiusMd, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: '#fff', fontWeight: '900', fontSize: 11, textTransform: 'uppercase' },
    utilityRow: { flexDirection: 'row', gap: 8 },
    utilityBtn: { flex: 1, alignItems: 'center', borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingVertical: 8 },
    utilityText: { ...Typography.caption, color: colors.textSecondary, fontWeight: '800', fontSize: 11 },
    twoColumn: { flexDirection: 'row', gap: 8 },
    card: { flex: 1, backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 6 },
    feedText: { ...Typography.bodySmall, color: colors.textSecondary, fontSize: 11 },
    controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pillButton: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 7 },
    clockSmall: { ...Typography.bodySmall, marginLeft: 'auto', color: colors.text, fontWeight: '900' },
    predictionCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 8 },
    predictionRow: { flexDirection: 'row', gap: 8 },
    predictionButton: { flex: 1, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: 10, alignItems: 'center' },
    predictionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    fieldCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 8 },
    field: { height: 142, borderRadius: Layout.radiusMd, backgroundColor: '#15803D', borderWidth: 2, borderColor: '#166534', overflow: 'hidden' },
    fieldLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.38)' },
    fieldDot: { position: 'absolute', width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff' },
    intelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    intelPill: { width: '48%', backgroundColor: colors.surface, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, padding: 9 },
    intelValue: { ...Typography.bodySmall, color: colors.text, fontWeight: '900', marginTop: 3 },
    reactionRow: { flexDirection: 'row', gap: 8 },
    reactionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingVertical: 8 },
    reactionEmoji: { fontSize: 17 },
    teamCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusXl, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    banner: { height: 122 },
    bannerImage: { resizeMode: 'cover' },
    bannerScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.14)' },
    avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.primary, marginLeft: 16, marginTop: -37, backgroundColor: colors.surface },
    teamBody: { padding: 16, paddingTop: 8 },
    teamTitle: { ...Typography.title, fontSize: 22, fontWeight: '900' },
    teamBio: { ...Typography.bodySmall, color: colors.textSecondary, marginTop: 7, lineHeight: 18 },
    statsTape: { flexDirection: 'row', gap: 8 },
    statBox: { flex: 1, backgroundColor: colors.surface, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, padding: 9 },
    statValue: { ...Typography.title, color: colors.primary, fontSize: 21, fontWeight: '900' },
    rosterList: { gap: 7 },
    rosterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, padding: 9 },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    tournamentHero: { backgroundColor: '#1B2838', borderRadius: Layout.radiusXl, padding: 18 },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    livePill: { color: '#fff', fontSize: 10, fontWeight: '900', backgroundColor: colors.success, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
    tournamentTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginTop: 16 },
    tournamentSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
    tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center' },
    tabText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
    tabActive: { backgroundColor: colors.primaryLight },
    championCard: { backgroundColor: colors.primary, borderRadius: Layout.radiusLg, padding: 14 },
    championText: { color: '#fff', fontSize: 22, fontWeight: '900' },
    bracketRow: { flexDirection: 'row', gap: 9 },
    bracketStack: { gap: 8 },
    roundSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    roundButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: colors.surfaceSecondary },
    matchCard: { flex: 1, backgroundColor: colors.surface, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 4 },
    tableCard: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
    tableRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 7 },
    tableTeam: { ...Typography.bodySmall, flex: 1, color: colors.text, fontWeight: '700' },
    tableStat: { ...Typography.bodySmall, width: 46, textAlign: 'right', color: colors.textSecondary },
    poolRow: { gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
    teamGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    teamTile: { width: '48%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, padding: 10 },
  });
};
