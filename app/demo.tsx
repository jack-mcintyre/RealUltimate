import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getTypography, Layout } from './theme/DesignSystem';
import { ThemeColors, useTheme } from './theme/ThemeContext';

type TeamKey = 'home' | 'away';
type GameFormat = '5v5' | '7v7';
type LocalPhase = 'setup' | 'record' | 'summary';
type LineTag = 'O' | 'D' | 'flex';

type LocalPlayer = {
  id: string;
  team: TeamKey;
  name: string;
  number: string;
  line: LineTag;
  goals: number;
  assists: number;
  blocks: number;
  turns: number;
  drops: number;
  callahans: number;
  passes: number;
};

type LocalEvent = {
  id: string;
  type: string;
  team: TeamKey;
  label: string;
  timestamp: number;
  offensePlayerId?: string;
  defensePlayerId?: string;
};

type LocalGame = {
  id: string;
  homeName: string;
  awayName: string;
  format: GameFormat;
  target: number;
  recordBothTeams: boolean;
  activeTeam: TeamKey;
  score: Record<TeamKey, number>;
  homePlayers: LocalPlayer[];
  awayPlayers: LocalPlayer[];
  events: LocalEvent[];
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
};

const LOCAL_GAMES_KEY = 'realultimate.localGames.v1';
const starterNames = ['Alex', 'Bri', 'Cam', 'Devin', 'Eli', 'Fran', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai', 'Lane', 'Micah', 'Noa'];

const makePlayers = (team: TeamKey, count = 10): LocalPlayer[] => (
  starterNames.slice(0, count).map((name, index) => ({
    id: `${team}-${Date.now()}-${index}`,
    team,
    name,
    number: String(index + 1),
    line: index < 7 ? (index < 4 ? 'O' : 'D') : 'flex',
    goals: 0,
    assists: 0,
    blocks: 0,
    turns: 0,
    drops: 0,
    callahans: 0,
    passes: 0,
  }))
);

const otherTeam = (team: TeamKey): TeamKey => team === 'home' ? 'away' : 'home';

const emptyGame = (): LocalGame => ({
  id: `local_${Date.now()}`,
  homeName: 'Night Owls',
  awayName: 'Skyline',
  format: '7v7',
  target: 13,
  recordBothTeams: true,
  activeTeam: 'home',
  score: { home: 0, away: 0 },
  homePlayers: makePlayers('home', 10),
  awayPlayers: makePlayers('away', 10),
  events: [],
  startedAt: Date.now(),
  updatedAt: Date.now(),
});

const playerShort = (player?: LocalPlayer) => player?.name?.trim().split(/\s+/)[0] || 'Player';

export default function DemoMatchScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [phase, setPhase] = useState<LocalPhase>('setup');
  const [game, setGame] = useState<LocalGame>(() => emptyGame());
  const [savedGames, setSavedGames] = useState<LocalGame[]>([]);
  const [selectedOffenseId, setSelectedOffenseId] = useState('');
  const [selectedDefenseId, setSelectedDefenseId] = useState('');
  const [viewTeam, setViewTeam] = useState<TeamKey>('home');
  const [lastPasserId, setLastPasserId] = useState<string | null>(null);

  const lineSize = game.format === '5v5' ? 5 : 7;
  const defenseTeam = otherTeam(game.activeTeam);
  const activeTeamName = game.activeTeam === 'home' ? game.homeName : game.awayName;
  const defenseTeamName = defenseTeam === 'home' ? game.homeName : game.awayName;
  const visiblePlayers = viewTeam === 'home' ? game.homePlayers : game.awayPlayers;
  const visibleTeamName = viewTeam === 'home' ? game.homeName : game.awayName;
  const isViewingOffense = viewTeam === game.activeTeam;
  const selectedVisibleId = isViewingOffense ? selectedOffenseId : selectedDefenseId;
  const showLineSetup = (players: LocalPlayer[]) => players.length > lineSize;
  const viewableTeams: TeamKey[] = game.recordBothTeams ? ['home', 'away'] : ['home'];
  const gameOver = game.score.home >= game.target || game.score.away >= game.target || !!game.finishedAt;

  const leaders = useMemo(() => {
    return [...game.homePlayers, ...game.awayPlayers]
      .map((player) => ({
        ...player,
        impact: (player.goals * 2) + player.assists + player.blocks + player.callahans - player.turns - player.drops,
      }))
      .sort((left, right) => right.impact - left.impact)
      .slice(0, 6);
  }, [game.homePlayers, game.awayPlayers]);

  useEffect(() => {
    AsyncStorage.getItem(LOCAL_GAMES_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as LocalGame[];
        setSavedGames(Array.isArray(parsed) ? parsed : []);
      })
      .catch(() => setSavedGames([]));
  }, []);

  useEffect(() => {
    if (!game.recordBothTeams && viewTeam !== 'home') {
      setViewTeam('home');
    }
    const offense = game.activeTeam === 'home' ? game.homePlayers : game.awayPlayers;
    const defense = defenseTeam === 'home' ? game.homePlayers : game.awayPlayers;
    if (!offense.some((player) => player.id === selectedOffenseId)) {
      setSelectedOffenseId(offense[0]?.id || '');
    }
    if (!defense.some((player) => player.id === selectedDefenseId)) {
      setSelectedDefenseId(defense[0]?.id || '');
    }
  }, [defenseTeam, game.activeTeam, game.awayPlayers, game.homePlayers, game.recordBothTeams, selectedDefenseId, selectedOffenseId, viewTeam]);

  const persistGames = async (nextGames: LocalGame[]) => {
    setSavedGames(nextGames);
    await AsyncStorage.setItem(LOCAL_GAMES_KEY, JSON.stringify(nextGames));
  };

  const saveGame = async (nextGame: LocalGame) => {
    const nextGames = [nextGame, ...savedGames.filter((entry) => entry.id !== nextGame.id)].slice(0, 25);
    await persistGames(nextGames);
  };

  const commitGame = (updater: (current: LocalGame) => LocalGame) => {
    setGame((current) => {
      const next = { ...updater(current), updatedAt: Date.now() };
      saveGame(next).catch(() => {});
      return next;
    });
  };

  const updatePlayers = (team: TeamKey, updater: (players: LocalPlayer[]) => LocalPlayer[]) => {
    commitGame((current) => ({
      ...current,
      [team === 'home' ? 'homePlayers' : 'awayPlayers']: updater(team === 'home' ? current.homePlayers : current.awayPlayers),
    }));
  };

  const applyPlayerUpdate = (current: LocalGame, playerId: string | undefined, updater: (player: LocalPlayer) => LocalPlayer): LocalGame => {
    if (!playerId) return current;
    const key = playerId.startsWith('home-') ? 'homePlayers' : 'awayPlayers';
    return {
      ...current,
      [key]: current[key].map((player) => player.id === playerId ? updater(player) : player),
    };
  };

  const addPlayer = (team: TeamKey) => {
    updatePlayers(team, (players) => [
      ...players,
      {
        ...makePlayers(team, 1)[0],
        id: `${team}-${Date.now()}-${players.length}`,
        name: `Player ${players.length + 1}`,
        number: String(players.length + 1),
        line: 'flex',
      },
    ]);
  };

  const chooseLine = (team: TeamKey, line: 'O' | 'D') => {
    const players = team === 'home' ? game.homePlayers : game.awayPlayers;
    if (!showLineSetup(players)) return;
    const linePlayers = players.filter((player) => player.line === line).concat(players.filter((player) => player.line === 'flex')).slice(0, lineSize);
    const first = linePlayers[0]?.id || players[0]?.id || '';
    if (team === game.activeTeam) setSelectedOffenseId(first);
    if (team === defenseTeam) setSelectedDefenseId(first);
  };

  const startMatch = () => {
    const resetPlayers = (players: LocalPlayer[]) => players.map((player) => ({
      ...player,
      goals: 0,
      assists: 0,
      blocks: 0,
      turns: 0,
      drops: 0,
      callahans: 0,
      passes: 0,
    }));
    const nextGame: LocalGame = {
      ...game,
      id: `local_${Date.now()}`,
      score: { home: 0, away: 0 },
      events: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: undefined,
      homePlayers: resetPlayers(game.homePlayers),
      awayPlayers: resetPlayers(game.awayPlayers),
    };
    setGame(nextGame);
    setSelectedOffenseId(nextGame.homePlayers[0]?.id || '');
    setSelectedDefenseId(nextGame.awayPlayers[0]?.id || '');
    setLastPasserId(null);
    setPhase('record');
    saveGame(nextGame).catch(() => {});
  };

  const appendEvent = (current: LocalGame, event: Omit<LocalEvent, 'id' | 'timestamp'>) => ({
    ...current,
    events: [{
      ...event,
      id: `${Date.now()}_${current.events.length}`,
      timestamp: Date.now(),
    }, ...current.events].slice(0, 120),
  });

  const recordAction = (type: 'pass' | 'goal' | 'throwaway' | 'drop' | 'block' | 'callahan' | 'timeout') => {
    if (gameOver) return;

    const selectedPlayer = visiblePlayers.find((player) => player.id === selectedVisibleId);
    const offensePlayer = isViewingOffense ? selectedPlayer : undefined;
    const defensePlayer = isViewingOffense ? undefined : selectedPlayer;
    const needsOffense = ['pass', 'goal', 'throwaway', 'drop'].includes(type);
    const needsDefense = ['block', 'callahan'].includes(type);

    if (needsOffense && (!isViewingOffense || !offensePlayer)) {
      Alert.alert('Switch to offense', `Open ${activeTeamName} and select the player with the disc.`);
      return;
    }
    if (needsDefense && (isViewingOffense || !defensePlayer)) {
      Alert.alert('Switch to defense', `Open ${defenseTeamName} and select the defender.`);
      return;
    }

    commitGame((current) => {
      let next = current;
      let label = '';
      const active = current.activeTeam;
      const defense = otherTeam(active);

      if (type === 'pass') {
        next = applyPlayerUpdate(next, offensePlayer?.id, (player) => ({ ...player, passes: player.passes + 1 }));
        setLastPasserId(offensePlayer?.id || null);
        label = `Pass by ${playerShort(offensePlayer)} for ${activeTeamName}`;
      }

      if (type === 'goal') {
        next = applyPlayerUpdate(next, offensePlayer?.id, (player) => ({ ...player, goals: player.goals + 1 }));
        if (lastPasserId && lastPasserId !== offensePlayer?.id) {
          next = applyPlayerUpdate(next, lastPasserId, (player) => ({ ...player, assists: player.assists + 1 }));
        }
        next = { ...next, score: { ...next.score, [active]: next.score[active] + 1 }, activeTeam: defense };
        label = `Goal by ${playerShort(offensePlayer)}${lastPasserId && lastPasserId !== offensePlayer?.id ? ' with assist' : ''}`;
        setLastPasserId(null);
      }

      if (type === 'throwaway' || type === 'drop') {
        next = applyPlayerUpdate(next, offensePlayer?.id, (player) => ({
          ...player,
          turns: player.turns + 1,
          drops: player.drops + (type === 'drop' ? 1 : 0),
        }));
        next = { ...next, activeTeam: defense };
        label = `${type === 'drop' ? 'Drop' : 'Throwaway'} by ${playerShort(offensePlayer)}`;
        setLastPasserId(null);
      }

      if (type === 'block') {
        next = applyPlayerUpdate(next, defensePlayer?.id, (player) => ({ ...player, blocks: player.blocks + 1 }));
        next = applyPlayerUpdate(next, offensePlayer?.id, (player) => ({ ...player, turns: player.turns + 1 }));
        next = { ...next, activeTeam: defense };
        label = `Block or interception by ${playerShort(defensePlayer)} against ${activeTeamName}`;
        setLastPasserId(null);
      }

      if (type === 'callahan') {
        next = applyPlayerUpdate(next, defensePlayer?.id, (player) => ({
          ...player,
          goals: player.goals + 1,
          blocks: player.blocks + 1,
          callahans: player.callahans + 1,
        }));
        next = applyPlayerUpdate(next, offensePlayer?.id, (player) => ({ ...player, turns: player.turns + 1 }));
        next = { ...next, score: { ...next.score, [defense]: next.score[defense] + 1 }, activeTeam: active };
        label = `Callahan by ${playerShort(defensePlayer)} for ${defenseTeamName}`;
        setLastPasserId(null);
      }

      if (type === 'timeout') {
        label = `Timeout: ${activeTeamName}`;
      }

      return appendEvent(next, {
        type,
        team: active,
        label,
        offensePlayerId: offensePlayer?.id,
        defensePlayerId: defensePlayer?.id,
      });
    });
  };

  const undoLast = () => {
    if (!game.events.length) return;
    Alert.alert('Undo last event?', 'This removes the latest local event from the feed. Player stat rollback is not available yet in offline mode.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: () => commitGame((current) => ({ ...current, events: current.events.slice(1) })),
      },
    ]);
  };

  const finishGame = () => {
    const finished = { ...game, finishedAt: Date.now(), updatedAt: Date.now() };
    setGame(finished);
    setPhase('summary');
    saveGame(finished).catch(() => {});
  };

  const loadSavedGame = (saved: LocalGame) => {
    setGame(saved);
    setSelectedOffenseId((saved.activeTeam === 'home' ? saved.homePlayers : saved.awayPlayers)[0]?.id || '');
    setSelectedDefenseId((saved.activeTeam === 'home' ? saved.awayPlayers : saved.homePlayers)[0]?.id || '');
    setPhase(saved.finishedAt ? 'summary' : 'record');
  };

  const renderSetup = () => (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>LOCAL MODE</Text>
        <Text style={styles.heroTitle}>Use RealUltimate without signing in.</Text>
        <Text style={styles.heroCopy}>Games stay on this device, work offline, and never touch Firebase until you make an account.</Text>
      </View>

      {!!savedGames.length && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Saved On This Device</Text>
          {savedGames.slice(0, 3).map((entry) => (
            <TouchableOpacity key={entry.id} style={styles.savedRow} onPress={() => loadSavedGame(entry)}>
              <View>
                <Text style={styles.savedTitle}>{entry.homeName} {entry.score.home}-{entry.score.away} {entry.awayName}</Text>
                <Text style={styles.savedMeta}>{entry.finishedAt ? 'Final' : 'In progress'} - {entry.format} - {entry.recordBothTeams ? 'both rosters' : 'one team focus'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Game Setup</Text>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={game.homeName} onChangeText={(homeName) => commitGame((current) => ({ ...current, homeName }))} placeholder="Home team" placeholderTextColor={colors.textSecondary} />
          <TextInput style={styles.input} value={game.awayName} onChangeText={(awayName) => commitGame((current) => ({ ...current, awayName }))} placeholder="Away team" placeholderTextColor={colors.textSecondary} />
        </View>
        <View style={styles.segmentRow}>
          {(['5v5', '7v7'] as const).map((format) => (
            <TouchableOpacity key={format} style={[styles.segmentBtn, game.format === format && styles.segmentBtnActive]} onPress={() => commitGame((current) => ({ ...current, format }))}>
              <Text style={[styles.segmentText, game.format === format && styles.segmentTextActive]}>{format}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} value={String(game.target)} onChangeText={(value) => commitGame((current) => ({ ...current, target: Math.max(1, Number(value) || 1) }))} keyboardType="numeric" placeholder="Game target" placeholderTextColor={colors.textSecondary} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Record both teams</Text>
            <Text style={styles.switchCopy}>Roster list follows possession and credits every player.</Text>
          </View>
          <Switch value={game.recordBothTeams} onValueChange={(recordBothTeams) => commitGame((current) => ({ ...current, recordBothTeams }))} />
        </View>
      </View>

      {(['home', 'away'] as const).map((team) => {
        const players = team === 'home' ? game.homePlayers : game.awayPlayers;
        return (
          <View key={`roster-${team}`} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionTitle}>{team === 'home' ? game.homeName : game.awayName} Roster</Text>
              <TouchableOpacity onPress={() => addPlayer(team)}>
                <Text style={styles.linkText}>+ Player</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              {showLineSetup(players)
                ? 'Name players, then tag O-line, D-line, or flex before starting.'
                : `With ${players.length} players in ${game.format}, everyone is treated as flex.`}
            </Text>
            {players.map((player) => (
              <View key={player.id} style={styles.rosterRow}>
                <TextInput style={styles.rosterNameInput} value={player.name} onChangeText={(name) => updatePlayers(team, (entries) => entries.map((entry) => entry.id === player.id ? { ...entry, name } : entry))} />
                {showLineSetup(players) && (['O', 'D', 'flex'] as const).map((line) => (
                  <TouchableOpacity key={`${player.id}-${line}`} style={[styles.lineChip, player.line === line && styles.lineChipActive]} onPress={() => updatePlayers(team, (entries) => entries.map((entry) => entry.id === player.id ? { ...entry, line } : entry))}>
                    <Text style={[styles.lineChipText, player.line === line && styles.lineChipTextActive]}>{line}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
        );
      })}

      <TouchableOpacity style={styles.primaryBtn} onPress={startMatch}>
        <Text style={styles.primaryBtnText}>Start Offline Match</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderRecord = () => (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.scoreCard}>
        <View style={styles.scoreTeam}>
          <Text style={styles.scoreName}>{game.homeName}</Text>
          <Text style={styles.scoreNumber}>{game.score.home}</Text>
        </View>
        <View style={styles.discBadge}>
          <Ionicons name="radio-button-on" size={20} color={colors.primary} />
          <Text style={styles.discText}>{activeTeamName} disc</Text>
        </View>
        <View style={styles.scoreTeam}>
          <Text style={styles.scoreName}>{game.awayName}</Text>
          <Text style={styles.scoreNumber}>{game.score.away}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>Players</Text>
          <Text style={styles.pill}>{game.recordBothTeams ? 'Both teams' : 'One team focus'}</Text>
        </View>
        <View style={styles.teamViewToggle}>
          {viewableTeams.map((team) => (
            <TouchableOpacity
              key={`view-${team}`}
              style={[styles.teamViewBtn, viewTeam === team && styles.teamViewBtnActive]}
              onPress={() => setViewTeam(team)}
            >
              <Text style={[styles.teamViewText, viewTeam === team && styles.teamViewTextActive]}>
                {team === 'home' ? game.homeName : game.awayName}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.contextCopy}>
          {isViewingOffense
            ? `${visibleTeamName} has the disc. Select the thrower, receiver, or scorer.`
            : `${visibleTeamName} is defending. Select the player who got the block or callahan.`}
        </Text>
        {showLineSetup(visiblePlayers) && (
          <View style={[styles.utilityRow, { marginBottom: 12 }]}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => chooseLine(viewTeam, 'O')}><Text style={styles.smallBtnText}>Load O-line</Text></TouchableOpacity>
            <TouchableOpacity style={styles.smallBtn} onPress={() => chooseLine(viewTeam, 'D')}><Text style={styles.smallBtnText}>Load D-line</Text></TouchableOpacity>
          </View>
        )}
        <View style={styles.playerGrid}>
          {visiblePlayers.slice(0, Math.max(lineSize, 14)).map((player) => {
            const selected = selectedVisibleId === player.id;
            return (
              <TouchableOpacity
                key={player.id}
                style={[styles.playerChip, selected && (isViewingOffense ? styles.playerChipActive : styles.defenderActive)]}
                onPress={() => isViewingOffense ? setSelectedOffenseId(player.id) : setSelectedDefenseId(player.id)}
              >
                <Text style={[styles.playerChipText, selected && (isViewingOffense ? styles.playerChipTextActive : styles.defenderTextActive)]}>{player.name}</Text>
                {showLineSetup(visiblePlayers) && <Text style={styles.playerMeta}>{player.line}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.actionGrid}>
        {isViewingOffense ? (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.text }]} onPress={() => recordAction('pass')}><Text style={styles.actionText}>Pass / Assist</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => recordAction('goal')}><Text style={styles.actionText}>Goal</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.error }]} onPress={() => recordAction('throwaway')}><Text style={styles.actionText}>Throwaway</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.warning }]} onPress={() => recordAction('drop')}><Text style={styles.actionText}>Drop</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#7C3AED' }]} onPress={() => recordAction('block')}><Text style={styles.actionText}>Block / INT</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.success }]} onPress={() => recordAction('callahan')}><Text style={styles.actionText}>Callahan</Text></TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.utilityRow}>
        <TouchableOpacity style={styles.utilityBtn} onPress={() => recordAction('timeout')}><Text style={styles.utilityText}>Timeout</Text></TouchableOpacity>
        <TouchableOpacity style={styles.utilityBtn} onPress={undoLast}><Text style={styles.utilityText}>Undo Feed Item</Text></TouchableOpacity>
        <TouchableOpacity style={styles.utilityBtn} onPress={finishGame}><Text style={styles.utilityText}>End Game</Text></TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live Feed</Text>
        {game.events.length ? game.events.slice(0, 12).map((event) => (
          <Text key={event.id} style={styles.feedText}>{event.label}</Text>
        )) : <Text style={styles.feedText}>Select a team, choose a player, then record the first event.</Text>}
      </View>
    </ScrollView>
  );

  const renderSummary = () => (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>LOCAL FINAL</Text>
        <Text style={styles.heroTitle}>{game.homeName} {game.score.home}-{game.score.away} {game.awayName}</Text>
        <Text style={styles.heroCopy}>Saved on this device. Create an account when you want cloud sync, public teams, tournaments, and live followers.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Top Impact</Text>
        {leaders.map((player) => (
          <View key={`leader-${player.id}`} style={styles.leaderRow}>
            <Text style={styles.leaderName}>{player.name}</Text>
            <Text style={styles.leaderStats}>{player.goals}G {player.assists}A {player.blocks}D {player.callahans}C {player.turns}T</Text>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')}>
        <Text style={styles.primaryBtnText}>Create Account To Save Online</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
        setGame(emptyGame());
        setPhase('setup');
      }}>
        <Text style={styles.secondaryBtnText}>Start Another Offline Game</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>REALULTIMATE OFFLINE</Text>
          <Text style={styles.title}>{phase === 'setup' ? 'Set up a local game' : phase === 'record' ? 'Offline recorder' : 'Local box score'}</Text>
        </View>
      </View>
      {phase === 'setup' ? renderSetup() : phase === 'record' ? renderRecord() : renderSummary()}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const Typography = getTypography(colors);
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: Layout.padding, paddingTop: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSecondary },
    kicker: { ...Typography.label, color: colors.primary, letterSpacing: 1.8 },
    title: { ...Typography.title, fontSize: 20 },
    content: { padding: Layout.padding, gap: 16, paddingBottom: 48 },
    heroCard: { backgroundColor: '#0B1120', borderRadius: Layout.radiusXl, padding: 20, borderWidth: 1, borderColor: colors.primary },
    heroTitle: { ...Typography.title, color: '#FFFFFF', fontSize: 28, lineHeight: 32, marginTop: 8 },
    heroCopy: { ...Typography.bodySmall, color: 'rgba(255,255,255,0.72)', lineHeight: 21, marginTop: 8 },
    card: { backgroundColor: colors.surface, borderRadius: Layout.radiusLg, borderWidth: 1, borderColor: colors.border, padding: 16, ...Layout.shadow },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
    sectionTitle: { ...Typography.label, color: colors.text, marginBottom: 10 },
    helperText: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 10, lineHeight: 19 },
    inputRow: { flexDirection: 'row', gap: 10 },
    input: { ...Typography.body, flex: 1, color: colors.text, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10 },
    segmentRow: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, padding: 4, marginBottom: 10 },
    segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Layout.radiusSm },
    segmentBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
    segmentText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    segmentTextActive: { color: colors.primary },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    switchTitle: { ...Typography.bodySmall, color: colors.text, fontWeight: '900' },
    switchCopy: { ...Typography.caption, color: colors.textSecondary, marginTop: 2 },
    rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    rosterNameInput: { ...Typography.bodySmall, flex: 1, color: colors.text, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusSm, paddingHorizontal: 10, paddingVertical: 9 },
    lineChip: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
    lineChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
    lineChipText: { ...Typography.caption, fontWeight: '900', color: colors.textSecondary },
    lineChipTextActive: { color: colors.primary },
    linkText: { ...Typography.bodySmall, color: colors.primary, fontWeight: '900' },
    savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    savedTitle: { ...Typography.bodySmall, color: colors.text, fontWeight: '900' },
    savedMeta: { ...Typography.caption, color: colors.textSecondary, marginTop: 3 },
    scoreCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: Layout.radiusXl, borderWidth: 1, borderColor: colors.border, padding: 18, ...Layout.shadow },
    scoreTeam: { flex: 1, alignItems: 'center' },
    scoreName: { ...Typography.bodySmall, color: colors.text, fontWeight: '900', textAlign: 'center' },
    scoreNumber: { ...Typography.title, fontSize: 58, lineHeight: 64 },
    discBadge: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    discText: { ...Typography.caption, textAlign: 'center', maxWidth: 82 },
    pill: { ...Typography.caption, color: colors.primary, backgroundColor: colors.primaryLight, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
    utilityRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    smallBtn: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingVertical: 10, alignItems: 'center' },
    smallBtnText: { ...Typography.bodySmall, color: colors.text, fontWeight: '800' },
    teamViewToggle: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: Layout.radiusMd, padding: 4, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
    teamViewBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Layout.radiusSm },
    teamViewBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
    teamViewText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    teamViewTextActive: { color: colors.primary },
    contextCopy: { ...Typography.bodySmall, color: colors.textSecondary, lineHeight: 19, marginBottom: 12 },
    playerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    playerChip: { minWidth: '30%', flex: 1, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, borderRadius: Layout.radiusMd, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
    playerChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
    defenderActive: { borderColor: colors.warning, backgroundColor: colors.surface },
    playerChipText: { ...Typography.bodySmall, color: colors.text, fontWeight: '800' },
    playerChipTextActive: { color: colors.primary },
    defenderTextActive: { color: colors.warning },
    playerMeta: { ...Typography.caption, marginTop: 2 },
    actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionBtn: { width: '48%', minHeight: 58, borderRadius: Layout.radiusLg, alignItems: 'center', justifyContent: 'center', ...Layout.shadow },
    actionText: { ...Typography.button, color: colors.onPrimary, textAlign: 'center' },
    utilityBtn: { flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center' },
    utilityText: { ...Typography.bodySmall, color: colors.textSecondary, fontWeight: '800' },
    feedText: { ...Typography.bodySmall, color: colors.textSecondary, marginBottom: 7 },
    leaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    leaderName: { ...Typography.bodySmall, color: colors.text, fontWeight: '900' },
    leaderStats: { ...Typography.bodySmall, color: colors.textSecondary },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: Layout.radiusMd, paddingVertical: 15, alignItems: 'center', ...Layout.shadow },
    primaryBtnText: { ...Typography.button, color: colors.onPrimary },
    secondaryBtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: Layout.radiusMd, paddingVertical: 15, alignItems: 'center' },
    secondaryBtnText: { ...Typography.button, color: colors.primary },
  });
};
