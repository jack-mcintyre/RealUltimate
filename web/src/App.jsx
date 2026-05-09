import { useEffect, useMemo, useRef, useState } from 'react'
import iowaBannerUrl from '../../assets/images/iowabanner.webp'
import iowaIconUrl from '../../assets/images/uiowaicon.webp'
import { QRCodeSVG } from 'qrcode.react'
import brandIconUrl from '../../assets/images/icon256.png'

/** Direct APK on download subdomain (all download buttons + QR + print poster). */
const DOWNLOAD_APK_URL = 'https://download.realultimate.me/realultimate.apk'

const metrics = [
  {
    value: 'Instant',
    label: 'Real-Time Scoring',
    detail: 'Zero delay. Fans and coaches see the game state as it happens on the field.'
  },
  {
    value: 'Elite',
    label: 'Stat Engine',
    detail: 'Advanced analytics for every player, generated automatically mid-game.'
  },
  {
    value: 'Seamless',
    label: 'Tournament Ops',
    detail: 'Automated seeding and live brackets keep the schedule moving flawlessly.'
  }
]

const keywords = ['Precision', 'Instant', 'Native', 'Professional Grade', 'Fan Engagement']

const TEAM_A = { id: 'university-iowa', name: 'University of Iowa', short: 'IOWA' }
const TEAM_B = { id: 'iowa-state', name: 'Iowa State', short: 'ISU' }

const HAWKEYE_ROSTER = [
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
  { name: 'Blake Foster', number: '6', line: 'flex', position: 'hybrid' }
]

const CYCLONE_ROSTER = [
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
  { name: 'Indigo Reyes', number: '16', line: 'flex', position: 'hybrid' }
]

const buildRoster = (defs, prefix, teamId) =>
  defs.map((player, index) => ({
    id: `${prefix}-${index}`,
    teamId,
    ...player
  }))

const HAWKEYES = buildRoster(HAWKEYE_ROSTER, 'ui', TEAM_A.id)
const CYCLONES = buildRoster(CYCLONE_ROSTER, 'isu', TEAM_B.id)

const POSITION_LABEL = {
  handler: 'Handler',
  cutter: 'Cutter',
  hybrid: 'Hybrid'
}

const LINE_LABEL = {
  O: 'O-Line',
  D: 'D-Line',
  flex: 'Flex'
}

const createBaseState = ({ score1 = 0, score2 = 0, possession = TEAM_A.id } = {}) => ({
  team1Id: TEAM_A.id,
  team2Id: TEAM_B.id,
  score1,
  score2,
  possession,
  firstHalfPossession: possession,
  history: [],
  playerStats: {},
  currentPointNumber: 1,
  currentLineupPlayerIds: [],
  pointLineups: {},
  gameFormat: '7v7',
  isHalftime: false
})

// Demo logic adapted from app/services/GameLogic.ts
const initPlayerStats = (state, playerId) => {
  if (!state.playerStats) state.playerStats = {}
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
      pointDiff: 0
    }
  }
}

const updateLineupForPointResult = (state, event, scoredByTeamId) => {
  const lineupLimit = state.gameFormat === '5v5' ? 5 : 7
  const lineupPlayerIds = (event.lineupPlayerIds || state.currentLineupPlayerIds || [])
    .filter(Boolean)
    .slice(0, lineupLimit)
  if (!lineupPlayerIds.length) return

  const lineType = event.lineType || (event.teamId === state.team1Id ? 'O' : 'D')
  const pointNumber = event.pointNumber || state.currentPointNumber || 1
  const scoredByUs = scoredByTeamId === state.team1Id
  const pointDiffDelta = scoredByUs ? 1 : -1

  lineupPlayerIds.forEach((playerId) => {
    initPlayerStats(state, playerId)
    const playerStats = state.playerStats[playerId]
    Object.assign(playerStats, {
      pointsPlayed: (playerStats.pointsPlayed || 0) + 1,
      oPointsPlayed: (playerStats.oPointsPlayed || 0) + (lineType === 'O' ? 1 : 0),
      dPointsPlayed: (playerStats.dPointsPlayed || 0) + (lineType === 'D' ? 1 : 0),
      pointDiff: (playerStats.pointDiff || 0) + pointDiffDelta
    })
  })

  if (!state.pointLineups) state.pointLineups = {}
  state.pointLineups[String(pointNumber)] = {
    pointNumber,
    lineType,
    playerIds: lineupPlayerIds,
    startedAt: state.pointLineups[String(pointNumber)]?.startedAt || event.timestamp,
    completedAt: event.timestamp,
    scoredByTeamId,
    scoreAfter: {
      team1: state.score1,
      team2: state.score2
    }
  }
  state.currentPointNumber = pointNumber + 1
  state.currentLineupPlayerIds = lineupPlayerIds
}

const applyEvent = (currentState, event) => {
  const newState = JSON.parse(JSON.stringify(currentState))
  if (!newState.history) newState.history = []
      if (event.type !== 'Timeout') {
        newState.history.push(event)
      } else {
        newState.history.push(event)
        newState.activeTimeoutStartedAt = newState.activeTimeoutStartedAt ? undefined : event.timestamp
      }

  if (event.playerId) initPlayerStats(newState, event.playerId)
  if (event.lineupPlayerIds?.length) {
    const lineupLimit = newState.gameFormat === '5v5' ? 5 : 7
    newState.currentLineupPlayerIds = event.lineupPlayerIds.filter(Boolean).slice(0, lineupLimit)
  }

  switch (event.type) {
    case 'Goal':
    case 'G':
      {
        const scoringTeamId = event.teamId || newState.possession
        if (scoringTeamId === newState.team1Id) {
          newState.score1 += 1
        } else if (scoringTeamId === newState.team2Id) {
          newState.score2 += 1
        }

      if (event.playerId) {
        Object.assign(newState.playerStats[event.playerId], {
          goals: newState.playerStats[event.playerId].goals + 1,
          timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0)
        })
      }
      {
        const assisterId = event.assistPlayerId || event.fromPlayerId
        if (assisterId) {
          initPlayerStats(newState, assisterId)
          const assisterStats = newState.playerStats[assisterId]
          Object.assign(assisterStats, {
            assists: assisterStats.assists + 1,
            passes: assisterStats.passes + 1,
            passAttempts: (assisterStats.passAttempts || 0) + 1,
            passCompletions: (assisterStats.passCompletions || 0) + 1
          })
        }
        if (event.playerId && assisterId && event.playerId !== assisterId) {
          const receiverStats = newState.playerStats[event.playerId]
          Object.assign(receiverStats, {
            receptions: (receiverStats.receptions || 0) + 1
          })
        }
      }

        updateLineupForPointResult(newState, event, scoringTeamId)
        newState.possession = scoringTeamId === newState.team1Id ? newState.team2Id : newState.team1Id
      }
      break

    case 'Opponent Score':
      {
        const scoringTeamId = event.teamId || newState.possession
        if (scoringTeamId === newState.team1Id) {
          newState.score1 += 1
        } else if (scoringTeamId === newState.team2Id) {
          newState.score2 += 1
        }
        updateLineupForPointResult(newState, event, scoringTeamId)
        newState.possession = scoringTeamId === newState.team1Id ? newState.team2Id : newState.team1Id
      }
      break

    case 'Callahan_US':
      if (event.playerId) {
        Object.assign(newState.playerStats[event.playerId], {
          blocks: newState.playerStats[event.playerId].blocks + 1,
          callahans: newState.playerStats[event.playerId].callahans + 1
        })
      }
      newState.score1 += 1
      updateLineupForPointResult(newState, event, newState.team1Id)
      newState.possession = newState.team2Id
      break

    case 'Callahan_THEM':
      newState.score2 += 1
      updateLineupForPointResult(newState, event, newState.team2Id)
      newState.possession = newState.team1Id
      break

    case 'Throwaway':
    case 'T':
    case 'Drop':
      if (event.playerId) {
        Object.assign(newState.playerStats[event.playerId], {
          turns: newState.playerStats[event.playerId].turns + 1,
          timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0)
        })
      }
      {
        const throwerId = event.fromPlayerId || event.assistPlayerId || event.playerId
        if (throwerId) {
          initPlayerStats(newState, throwerId)
          const throwerStats = newState.playerStats[throwerId]
          Object.assign(throwerStats, {
            passAttempts: (throwerStats.passAttempts || 0) + 1,
            passTurnovers: (throwerStats.passTurnovers || 0) + 1
          })
        }
      }
      {
        const turnoverTeamId = event.teamId || newState.possession
        newState.possession = turnoverTeamId === newState.team1Id ? newState.team2Id : newState.team1Id
      }
      break

    case 'Opponent Turnover':
      if (event.playerId) {
        Object.assign(newState.playerStats[event.playerId], {
          turns: newState.playerStats[event.playerId].turns + 1,
          timeWithDisc: newState.playerStats[event.playerId].timeWithDisc + (event.timeElapsedMs || 0)
        })
      }
      {
        const turnoverTeamId = event.teamId || newState.possession
        newState.possession = turnoverTeamId === newState.team1Id ? newState.team2Id : newState.team1Id
      }
      break

    case 'D-Block':
    case 'D':
      if (event.playerId) {
        Object.assign(newState.playerStats[event.playerId], {
          blocks: newState.playerStats[event.playerId].blocks + 1
        })
      }
      if (event.teamId) {
        newState.possession = event.teamId
      } else {
        newState.possession = newState.possession === newState.team1Id ? newState.team2Id : newState.team1Id
      }
      break

    case 'Pass':
      {
        const throwerId = event.fromPlayerId || event.assistPlayerId || event.playerId
        const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined)

        if (throwerId) {
          initPlayerStats(newState, throwerId)
          const throwerStats = newState.playerStats[throwerId]
          Object.assign(throwerStats, {
            passes: throwerStats.passes + 1,
            passAttempts: (throwerStats.passAttempts || 0) + 1,
            passCompletions: (throwerStats.passCompletions || 0) + 1,
            timeWithDisc: throwerStats.timeWithDisc + (event.timeElapsedMs || 0)
          })
        }

        if (receiverId) {
          initPlayerStats(newState, receiverId)
          const receiverStats = newState.playerStats[receiverId]
          Object.assign(receiverStats, {
            receptions: (receiverStats.receptions || 0) + 1
          })
        }
      }
      break

    case 'Halftime':
      newState.isHalftime = true
      break

    case 'End Halftime':
      newState.isHalftime = false
      break

    default:
      break
  }

  return newState
}

const rebuildStateFromHistory = (initialState, history) => {
  let state = JSON.parse(JSON.stringify({ ...initialState, history: [] }))
  history.forEach((event) => {
    state = applyEvent(state, event)
  })
  return state
}

const getEventActors = (event) => {
  const throwerId = event.fromPlayerId || event.assistPlayerId || (event.type === 'Pass' ? event.playerId : undefined)
  const receiverId = event.toPlayerId || (event.assistPlayerId ? event.playerId : undefined)
  return { throwerId, receiverId }
}

const isValidCoord = (coord) => typeof coord?.x === 'number' && typeof coord?.y === 'number' && coord.x >= 0 && coord.y >= 0

const isDirectionalEvent = (event) => {
  const { throwerId, receiverId } = getEventActors(event)
  if (!throwerId || !receiverId) return false
  return ['Pass', 'Drop', 'Throwaway', 'T', 'Goal', 'G'].includes(event?.type)
}

const trajectoryColor = (event) => {
  switch (event?.type) {
    case 'Goal':
    case 'G':
      return '#facc15'
    case 'Drop':
      return '#f97316'
    case 'Throwaway':
    case 'T':
      return '#ef4444'
    default:
      return '#60a5fa'
  }
}

const getOnFirePlayers = (history) => {
  if (!history || history.length < 3) return []
  const recentScoring = history.filter((event) => event.type === 'G' || event.type === 'Goal').slice(-6)
  const playerCounts = {}
  recentScoring.forEach((event) => {
    if (event.playerId) {
      playerCounts[event.playerId] = (playerCounts[event.playerId] || 0) + 1
    }
  })
  return Object.entries(playerCounts)
    .filter(([, count]) => count >= 2)
    .map(([id]) => id)
}

const formatClock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatEndzoneLabel = (name) => {
  const trimmed = (name || '').trim().toUpperCase()
  if (!trimmed) return ''
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 1) {
    const word = words[0]
    if (word.length <= 10) return word
    const cut = Math.ceil(word.length / 2)
    return `${word.slice(0, cut)}\n${word.slice(cut)}`
  }
  const midpoint = Math.ceil(words.length / 2)
  return `${words.slice(0, midpoint).join(' ')}\n${words.slice(midpoint).join(' ')}`
}

const pointScript15_13 = () => {
  const out = []
  for (let i = 0; i < 13; i += 1) out.push('t1', 't2')
  out.push('t1', 't1')
  return out
}

const pointScript15_12 = () => {
  const out = []
  for (let i = 0; i < 12; i += 1) out.push('t1', 't2')
  out.push('t1', 't1', 't1')
  return out
}

const pointScript15_7 = () => {
  const out = []
  for (let i = 0; i < 7; i += 1) out.push('t1', 't2')
  for (let i = 0; i < 8; i += 1) out.push('t1')
  return out
}

const createCompletedDemoGame = ({ gameId, opponent, opponentId = TEAM_B.id, date, pointWinners }) => {
  let state = createBaseState({ possession: TEAM_A.id })
  state.gameId = gameId
  state.team2Id = opponentId
  state.team2Name = opponent
  state.team2LinkedTeamId = opponentId === TEAM_B.id ? TEAM_B.id : undefined
  state.gameLocation = 'Eastern Iowa Ultimate Complex'
  state.gameTarget = 15
  state.isGameActive = false
  state.advancedTracking = true

  const start = new Date(`${date}T18:30:00`).getTime()
  const hawkeyeLine = HAWKEYES.slice(0, 7).map((player) => player.id)
  let seq = 0

  const apply = (event) => {
    seq += 1
    state = applyEvent(state, {
      id: `${gameId}_e_${seq}`,
      gameId,
      timestamp: start + seq * 420000,
      gameElapsedSec: seq * 420,
      teamId: event.teamId ?? state.possession,
      ...event
    })
  }

  pointWinners.forEach((winner, pointIndex) => {
    const pointNumber = pointIndex + 1
    if (winner === 't2') {
      apply({
        type: 'Opponent Score',
        teamId: opponentId,
        lineupPlayerIds: hawkeyeLine,
        lineType: pointNumber % 2 === 0 ? 'D' : 'O',
        pointNumber
      })
      return
    }

    const rot = pointIndex % hawkeyeLine.length
    const thrower = hawkeyeLine[rot]
    const middle = hawkeyeLine[(rot + 1) % hawkeyeLine.length]
    const assister = hawkeyeLine[(rot + 2) % hawkeyeLine.length]
    const scorer = hawkeyeLine[(rot + 3) % hawkeyeLine.length]
    apply({ type: 'Pass', teamId: TEAM_A.id, fromPlayerId: thrower, toPlayerId: middle, playerId: middle, timeElapsedMs: 1400 })
    apply({ type: 'Pass', teamId: TEAM_A.id, fromPlayerId: middle, toPlayerId: assister, playerId: assister, timeElapsedMs: 1100 })
    apply({
      type: 'Goal',
      teamId: TEAM_A.id,
      playerId: scorer,
      assistPlayerId: assister,
      fromPlayerId: assister,
      toPlayerId: scorer,
      lineupPlayerIds: hawkeyeLine,
      lineType: pointNumber % 2 === 0 ? 'D' : 'O',
      pointNumber,
      timeElapsedMs: 900
    })
  })

  return {
    ...state,
    id: gameId,
    opponent,
    date,
    finalLabel: `${state.score1}-${state.score2}`
  }
}

const DEMO_COMPLETED_GAMES = [
  createCompletedDemoGame({ gameId: 'demo-uiowa-isu', opponent: 'Iowa State', opponentId: TEAM_B.id, date: '2026-04-12', pointWinners: pointScript15_13() }),
  createCompletedDemoGame({ gameId: 'demo-uiowa-volt', opponent: 'Volt', opponentId: 'volt', date: '2026-04-19', pointWinners: pointScript15_12() }),
  createCompletedDemoGame({ gameId: 'demo-uiowa-aurora', opponent: 'Aurora', opponentId: 'aurora', date: '2026-04-26', pointWinners: pointScript15_7() })
]

const DEMO_TEAM_PROFILE = {
  name: TEAM_A.name,
  division: 'Midwest Division',
  followers: 2487,
  fanCode: 'IOWA24',
  coach: 'Evan Parker',
  bio: 'A public demo team page seeded by RealUltimate presentation mode, updated with Iowa branding to show exactly how a polished team hub feels after a coach customizes it.'
}

const demoScheduledGames = [
  { id: 'sg1', date: 'May 24', opponent: 'Iowa State', time: '6:30 PM', location: 'Eastern Iowa Turf 1', available: 'Jordan, Morgan, Sam, Taylor' },
  { id: 'sg2', date: 'May 26', opponent: 'Drift', time: '2:00 PM', location: 'Hawkeye Rec Fields', available: 'Riley, Casey, Jamie' }
]

const demoTournamentStandings = [
  { id: 't1', team: 'University of Iowa', pool: 'A', record: '3-0', pointDiff: '+24', spirit: 23 },
  { id: 't3', team: 'Volt', pool: 'A', record: '2-1', pointDiff: '+8', spirit: 21 },
  { id: 't2', team: 'Iowa State', pool: 'B', record: '2-1', pointDiff: '+7', spirit: 20 },
  { id: 't4', team: 'Nimbus', pool: 'B', record: '2-1', pointDiff: '+2', spirit: 22 },
  { id: 't7', team: 'Rift', pool: 'A', record: '1-2', pointDiff: '-6', spirit: 24 },
  { id: 't8', team: 'Aurora', pool: 'B', record: '1-2', pointDiff: '-11', spirit: 19 },
  { id: 't5', team: 'Drift', pool: 'A', record: '0-3', pointDiff: '-12', spirit: 20 },
  { id: 't6', team: 'Pulse', pool: 'B', record: '0-3', pointDiff: '-12', spirit: 18 }
]

const demoTournamentMatches = [
  { id: 'm1', group: 'A', round: 1, field: 'Field 1', time: '9:00 AM', teamA: 'University of Iowa', teamB: 'Drift', scoreA: 15, scoreB: 7, status: 'final' },
  { id: 'm2', group: 'A', round: 1, field: 'Field 2', time: '9:00 AM', teamA: 'Volt', teamB: 'Rift', scoreA: 13, scoreB: 10, status: 'final' },
  { id: 'm3', group: 'B', round: 1, field: 'Field 3', time: '10:30 AM', teamA: 'Iowa State', teamB: 'Aurora', scoreA: 14, scoreB: 11, status: 'final' },
  { id: 'm4', group: 'B', round: 1, field: 'Field 4', time: '10:30 AM', teamA: 'Nimbus', teamB: 'Pulse', scoreA: 15, scoreB: 9, status: 'final' }
]

const demoTournamentActivity = [
  { id: 'a1', label: 'Final', stage: 'Championship', winner: 'University of Iowa', loser: 'Volt', winnerScore: 15, loserScore: 12, time: 'Sun · 4:30 PM', highlight: true, note: 'Iowa wins! Universe point' },
  { id: 'a2', label: 'Semifinal', stage: 'Bracket', winner: 'Volt', loser: 'Iowa State', winnerScore: 15, loserScore: 13, time: 'Sun · 2:00 PM', note: 'Volt punches ticket to final' },
  { id: 'a3', label: 'Semifinal', stage: 'Bracket', winner: 'University of Iowa', loser: 'Nimbus', winnerScore: 15, loserScore: 9, time: 'Sun · 2:00 PM', note: 'Iowa rolls behind 4 break-points' }
]

const demoBracketRounds = [
  {
    title: 'Quarterfinals',
    matches: [
      { id: 'qf1', teamA: 'University of Iowa', teamB: 'Aurora', scoreA: 15, scoreB: 6, winner: 'University of Iowa', time: '11:30 AM' },
      { id: 'qf2', teamA: 'Nimbus', teamB: 'Rift', scoreA: 15, scoreB: 11, winner: 'Nimbus', time: '11:30 AM' },
      { id: 'qf3', teamA: 'Volt', teamB: 'Pulse', scoreA: 15, scoreB: 8, winner: 'Volt', time: '12:30 PM' },
      { id: 'qf4', teamA: 'Iowa State', teamB: 'Drift', scoreA: 15, scoreB: 9, winner: 'Iowa State', time: '12:30 PM' }
    ]
  },
  {
    title: 'Semifinals',
    matches: [
      { id: 'sf1', teamA: 'University of Iowa', teamB: 'Nimbus', scoreA: 15, scoreB: 9, winner: 'University of Iowa', time: '2:00 PM' },
      { id: 'sf2', teamA: 'Volt', teamB: 'Iowa State', scoreA: 15, scoreB: 13, winner: 'Volt', time: '2:00 PM' }
    ]
  },
  {
    title: 'Final',
    matches: [
      { id: 'final', teamA: 'University of Iowa', teamB: 'Volt', scoreA: 15, scoreB: 12, winner: 'University of Iowa', time: '4:30 PM' }
    ]
  }
]

const H1 = HAWKEYES[0]
const H2 = HAWKEYES[1]
const H3 = HAWKEYES[2]
const H4 = HAWKEYES[3]
const H5 = HAWKEYES[4]
const C1 = CYCLONES[0]
const C2 = CYCLONES[1]
const C3 = CYCLONES[2]
const C4 = CYCLONES[3]
const C5 = CYCLONES[4]

const spectateSequence = [
  // Point 1 — Iowa hold (Iowa receives pull on RIGHT, attacks LEFT toward Iowa State endzone)
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H2.id, fromFieldPosition: { x: 88, y: 50 }, fieldPosition: { x: 76, y: 38 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H2.id, fromPlayerId: H2.id, toPlayerId: H3.id, fromFieldPosition: { x: 76, y: 38 }, fieldPosition: { x: 62, y: 46 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H3.id, fromPlayerId: H3.id, toPlayerId: H1.id, fromFieldPosition: { x: 62, y: 46 }, fieldPosition: { x: 52, y: 28 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H4.id, fromFieldPosition: { x: 52, y: 28 }, fieldPosition: { x: 34, y: 40 } },
  { type: 'Goal', teamId: TEAM_A.id, playerId: H5.id, assistPlayerId: H4.id, fromFieldPosition: { x: 34, y: 40 }, fieldPosition: { x: 8, y: 52 } },

  // Point 2 — Iowa State works it (LEFT to RIGHT), throwaway, Iowa break (LEFT)
  { type: 'Pass', teamId: TEAM_B.id, playerId: C1.id, fromPlayerId: C1.id, toPlayerId: C2.id, fromFieldPosition: { x: 12, y: 56 }, fieldPosition: { x: 26, y: 48 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C2.id, fromPlayerId: C2.id, toPlayerId: C3.id, fromFieldPosition: { x: 26, y: 48 }, fieldPosition: { x: 42, y: 64 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C3.id, fromPlayerId: C3.id, toPlayerId: C4.id, fromFieldPosition: { x: 42, y: 64 }, fieldPosition: { x: 58, y: 50 } },
  { type: 'Throwaway', teamId: TEAM_B.id, playerId: C4.id, fromFieldPosition: { x: 58, y: 50 }, fieldPosition: { x: 70, y: 18 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H2.id, fromPlayerId: H2.id, toPlayerId: H1.id, fromFieldPosition: { x: 70, y: 18 }, fieldPosition: { x: 52, y: 32 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H3.id, fromFieldPosition: { x: 52, y: 32 }, fieldPosition: { x: 32, y: 50 } },
  { type: 'Goal', teamId: TEAM_A.id, playerId: H4.id, assistPlayerId: H3.id, fromFieldPosition: { x: 32, y: 50 }, fieldPosition: { x: 8, y: 42 } },

  // Point 3 — Iowa State scores back (LEFT to RIGHT), deep look
  { type: 'Pass', teamId: TEAM_B.id, playerId: C1.id, fromPlayerId: C1.id, toPlayerId: C3.id, fromFieldPosition: { x: 14, y: 56 }, fieldPosition: { x: 30, y: 48 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C3.id, fromPlayerId: C3.id, toPlayerId: C2.id, fromFieldPosition: { x: 30, y: 48 }, fieldPosition: { x: 46, y: 60 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C2.id, fromPlayerId: C2.id, toPlayerId: C4.id, fromFieldPosition: { x: 46, y: 60 }, fieldPosition: { x: 70, y: 50 } },
  { type: 'G', teamId: TEAM_B.id, playerId: C4.id, assistPlayerId: C2.id, fromFieldPosition: { x: 70, y: 50 }, fieldPosition: { x: 92, y: 60 } },

  // Point 4 — Iowa D-block, transition goal LEFT
  { type: 'Pass', teamId: TEAM_B.id, playerId: C1.id, fromPlayerId: C1.id, toPlayerId: C2.id, fromFieldPosition: { x: 14, y: 52 }, fieldPosition: { x: 30, y: 62 } },
  { type: 'D', teamId: TEAM_A.id, playerId: H5.id, fieldPosition: { x: 38, y: 58 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H2.id, fromFieldPosition: { x: 38, y: 58 }, fieldPosition: { x: 26, y: 42 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H2.id, fromPlayerId: H2.id, toPlayerId: H3.id, fromFieldPosition: { x: 26, y: 42 }, fieldPosition: { x: 16, y: 50 } },
  { type: 'Goal', teamId: TEAM_A.id, playerId: H3.id, assistPlayerId: H2.id, fromFieldPosition: { x: 16, y: 50 }, fieldPosition: { x: 4, y: 48 } },

  // Point 5 — Iowa State holds (LEFT to RIGHT), deep huck
  { type: 'Pass', teamId: TEAM_B.id, playerId: C2.id, fromPlayerId: C2.id, toPlayerId: C1.id, fromFieldPosition: { x: 12, y: 50 }, fieldPosition: { x: 22, y: 36 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C1.id, fromPlayerId: C1.id, toPlayerId: C4.id, fromFieldPosition: { x: 22, y: 36 }, fieldPosition: { x: 36, y: 56 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C4.id, fromPlayerId: C4.id, toPlayerId: C3.id, fromFieldPosition: { x: 36, y: 56 }, fieldPosition: { x: 60, y: 30 } },
  { type: 'G', teamId: TEAM_B.id, playerId: C5.id, assistPlayerId: C3.id, fromFieldPosition: { x: 60, y: 30 }, fieldPosition: { x: 92, y: 22 } },

  // Point 6 — Iowa hold (RIGHT to LEFT), swilly cross-field
  { type: 'Pass', teamId: TEAM_A.id, playerId: H4.id, fromPlayerId: H4.id, toPlayerId: H1.id, fromFieldPosition: { x: 88, y: 50 }, fieldPosition: { x: 76, y: 64 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H2.id, fromFieldPosition: { x: 76, y: 64 }, fieldPosition: { x: 60, y: 32 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H2.id, fromPlayerId: H2.id, toPlayerId: H3.id, fromFieldPosition: { x: 60, y: 32 }, fieldPosition: { x: 44, y: 56 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H3.id, fromPlayerId: H3.id, toPlayerId: H5.id, fromFieldPosition: { x: 44, y: 56 }, fieldPosition: { x: 30, y: 36 } },
  { type: 'Goal', teamId: TEAM_A.id, playerId: H4.id, assistPlayerId: H5.id, fromFieldPosition: { x: 30, y: 36 }, fieldPosition: { x: 8, y: 56 } },

  // Point 7 — ISU break (Iowa drop, ISU goes LEFT to RIGHT)
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H2.id, fromFieldPosition: { x: 88, y: 50 }, fieldPosition: { x: 72, y: 42 } },
  { type: 'Drop', teamId: TEAM_A.id, playerId: H2.id, fromFieldPosition: { x: 72, y: 42 }, fieldPosition: { x: 68, y: 46 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C2.id, fromPlayerId: C2.id, toPlayerId: C1.id, fromFieldPosition: { x: 68, y: 46 }, fieldPosition: { x: 78, y: 32 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C1.id, fromPlayerId: C1.id, toPlayerId: C4.id, fromFieldPosition: { x: 78, y: 32 }, fieldPosition: { x: 86, y: 56 } },
  { type: 'G', teamId: TEAM_B.id, playerId: C3.id, assistPlayerId: C4.id, fromFieldPosition: { x: 86, y: 56 }, fieldPosition: { x: 96, y: 38 } },

  // Point 8 — Iowa hold (RIGHT to LEFT), hammer
  { type: 'Pass', teamId: TEAM_A.id, playerId: H2.id, fromPlayerId: H2.id, toPlayerId: H1.id, fromFieldPosition: { x: 88, y: 50 }, fieldPosition: { x: 78, y: 30 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H3.id, fromFieldPosition: { x: 78, y: 30 }, fieldPosition: { x: 60, y: 60 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H3.id, fromPlayerId: H3.id, toPlayerId: H5.id, fromFieldPosition: { x: 60, y: 60 }, fieldPosition: { x: 36, y: 30 } },
  { type: 'Goal', teamId: TEAM_A.id, playerId: H4.id, assistPlayerId: H5.id, fromFieldPosition: { x: 36, y: 30 }, fieldPosition: { x: 8, y: 64 } },

  // Point 9 — ISU hold quickly (LEFT to RIGHT)
  { type: 'Pass', teamId: TEAM_B.id, playerId: C2.id, fromPlayerId: C2.id, toPlayerId: C5.id, fromFieldPosition: { x: 14, y: 50 }, fieldPosition: { x: 32, y: 38 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C5.id, fromPlayerId: C5.id, toPlayerId: C3.id, fromFieldPosition: { x: 32, y: 38 }, fieldPosition: { x: 56, y: 60 } },
  { type: 'G', teamId: TEAM_B.id, playerId: C1.id, assistPlayerId: C3.id, fromFieldPosition: { x: 56, y: 60 }, fieldPosition: { x: 92, y: 36 } },

  // Point 10 — Universe point, Iowa wins it (RIGHT to LEFT)
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H2.id, fromFieldPosition: { x: 88, y: 50 }, fieldPosition: { x: 76, y: 36 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H2.id, fromPlayerId: H2.id, toPlayerId: H4.id, fromFieldPosition: { x: 76, y: 36 }, fieldPosition: { x: 58, y: 56 } },
  { type: 'D', teamId: TEAM_B.id, playerId: C5.id, fieldPosition: { x: 54, y: 54 } },
  { type: 'Pass', teamId: TEAM_B.id, playerId: C5.id, fromPlayerId: C5.id, toPlayerId: C2.id, fromFieldPosition: { x: 54, y: 54 }, fieldPosition: { x: 68, y: 38 } },
  { type: 'Throwaway', teamId: TEAM_B.id, playerId: C2.id, fromFieldPosition: { x: 68, y: 38 }, fieldPosition: { x: 86, y: 14 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H1.id, fromPlayerId: H1.id, toPlayerId: H3.id, fromFieldPosition: { x: 86, y: 14 }, fieldPosition: { x: 60, y: 36 } },
  { type: 'Pass', teamId: TEAM_A.id, playerId: H3.id, fromPlayerId: H3.id, toPlayerId: H5.id, fromFieldPosition: { x: 60, y: 36 }, fieldPosition: { x: 22, y: 52 } },
  { type: 'Goal', teamId: TEAM_A.id, playerId: H2.id, assistPlayerId: H5.id, fromFieldPosition: { x: 22, y: 52 }, fieldPosition: { x: 4, y: 48 } }
]

const demoTournamentTeams = [
  { id: 't1', name: 'University of Iowa', seed: 1 },
  { id: 't2', name: 'Iowa State', seed: 2 },
  { id: 't3', name: 'Volt', seed: 3 },
  { id: 't4', name: 'Nimbus', seed: 4 },
  { id: 't5', name: 'Drift', seed: 5 },
  { id: 't6', name: 'Pulse', seed: 6 },
  { id: 't7', name: 'Rift', seed: 7 },
  { id: 't8', name: 'Aurora', seed: 8 }
]

const LiveFieldTracker = ({ events, ourTeamName, oppTeamName }) => {
  const fieldRef = useRef(null)
  const [dim, setDim] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const node = fieldRef.current
    if (!node) return undefined
    const update = () => {
      if (!node) return
      const rect = node.getBoundingClientRect()
      setDim({ w: rect.width, h: rect.height })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const trackedEvents = (events || [])
    .filter((event) => isValidCoord(event.fieldPosition) || isValidCoord(event.fromFieldPosition))
    .slice(-14)

  return (
    <div className="field-card">
      <div className="field-card-header">
        <div>
          <div className="field-title">Live field tracker</div>
          <div className="field-sub">Last {trackedEvents.length} mapped events</div>
        </div>
      </div>
      <div className="field-map" ref={fieldRef}>
        <span className="field-line endzone left"></span>
        <span className="field-line endzone right"></span>
        <span className="field-line midfield"></span>
        <span className="field-line sideline top"></span>
        <span className="field-line sideline bottom"></span>
        <div className="field-label left">{formatEndzoneLabel(oppTeamName)}</div>
        <div className="field-label right">{formatEndzoneLabel(ourTeamName)}</div>
        {trackedEvents.map((event, idx) => {
          if (dim.w <= 0 || dim.h <= 0 || !isDirectionalEvent(event)) return null
          if (!isValidCoord(event.fromFieldPosition) || !isValidCoord(event.fieldPosition)) return null

          const x1 = (event.fromFieldPosition.x / 100) * dim.w
          const y1 = (event.fromFieldPosition.y / 100) * dim.h
          const x2 = (event.fieldPosition.x / 100) * dim.w
          const y2 = (event.fieldPosition.y / 100) * dim.h
          const length = Math.sqrt(((x2 - x1) ** 2) + ((y2 - y1) ** 2))
          if (length < 2) return null

          const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)
          const cX = (x1 + x2) / 2
          const cY = (y1 + y2) / 2
          const alpha = Math.max(0.2, (idx + 1) / trackedEvents.length)

          return (
            <span
              key={`vector-${idx}`}
              className="field-vector"
              style={{
                left: `${cX - length / 2}px`,
                top: `${cY - 1}px`,
                width: `${length}px`,
                backgroundColor: trajectoryColor(event),
                opacity: alpha,
                transform: `rotate(${angle}deg)`
              }}
            ></span>
          )
        })}
        {trackedEvents.map((event, idx) => {
          const marker = isValidCoord(event.fieldPosition) ? event.fieldPosition : event.fromFieldPosition
          if (!marker) return null
          const isLatest = idx === trackedEvents.length - 1
          return (
            <span
              key={`marker-${idx}`}
              className={`field-dot ${isLatest ? 'active' : ''}`}
              style={{
                left: `${marker.x}%`,
                top: `${marker.y}%`,
                opacity: isLatest ? 1 : Math.max(0.35, (idx + 1) / trackedEvents.length),
                borderColor: isLatest ? trajectoryColor(event) : 'rgba(15,23,42,0.3)'
              }}
            ></span>
          )
        })}
      </div>
    </div>
  )
}


function App() {
  const allPlayers = useMemo(() => [...HAWKEYES, ...CYCLONES], [])
  const playerById = useMemo(() => {
    return allPlayers.reduce((acc, player) => {
      acc[player.id] = player
      return acc
    }, {})
  }, [allPlayers])

  const recorderBaseState = useMemo(() => createBaseState({ score1: 0, score2: 0, possession: TEAM_A.id }), [])
  const [recorderState, setRecorderState] = useState(() => recorderBaseState)
  const [selectedPlayerId, setSelectedPlayerId] = useState(HAWKEYES[0].id)
  const [discHolderId, setDiscHolderId] = useState(HAWKEYES[0].id)
  const [recorderPulse, setRecorderPulse] = useState(false)

  const [heroScore, setHeroScore] = useState(14)
  const [heroGoalFlash, setHeroGoalFlash] = useState(false)
  const [devicePlatform, setDevicePlatform] = useState('unknown')

  const handlePrintQrPoster = () => {
    const win = window.open('', '_blank', 'width=820,height=1100')
    if (!win) return
    const escaped = DOWNLOAD_APK_URL.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    win.document.write(`<!doctype html><html><head><title>RealUltimate · Scan to install</title><meta charset="utf-8"/><style>
      :root { color-scheme: light; }
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
      .poster { width: 720px; max-width: 100%; margin: 40px auto; padding: 56px 48px; background: #ffffff; border-radius: 32px; box-shadow: 0 24px 60px rgba(15,23,42,0.18); text-align: center; border: 1px solid #e2e8f0; }
      .brand { display: inline-flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 800; letter-spacing: 0.2px; }
      .brand img { width: 44px; height: 44px; }
      h1 { font-size: 44px; line-height: 1.05; font-weight: 900; margin: 22px 0 10px; letter-spacing: -0.02em; }
      .sub { color: #475569; font-size: 17px; line-height: 1.5; max-width: 520px; margin: 0 auto; }
      .qr-wrap { margin: 36px auto 12px; display: inline-block; padding: 18px; border-radius: 22px; background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 12px 28px rgba(15,23,42,0.08); }
      .url { display: inline-block; margin-top: 8px; padding: 8px 14px; border-radius: 999px; background: #0f172a; color: #ffffff; font-size: 14px; font-weight: 700; letter-spacing: 0.2px; word-break: break-all; }
      .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 36px; text-align: left; }
      .step { padding: 16px 18px; border-radius: 16px; background: #f1f5f9; border: 1px solid #e2e8f0; }
      .step strong { display: block; font-size: 13px; letter-spacing: 0.6px; color: #1d4ed8; text-transform: uppercase; margin-bottom: 4px; }
      .step span { font-size: 14px; color: #0f172a; }
      .footer { margin-top: 36px; font-size: 12px; color: #64748b; letter-spacing: 0.4px; text-transform: uppercase; }
      @media print {
        body { background: #ffffff; }
        .poster { box-shadow: none; border: 0; margin: 0; width: 100%; padding: 32px; border-radius: 0; }
      }
    </style></head><body>
      <div class="poster">
        <div class="brand"><img src="${brandIconUrl}" alt=""/>RealUltimate</div>
        <h1>Scan to install on Android.</h1>
        <p class="sub">RealUltimate is the most advanced scoring and tournament platform built for Ultimate Frisbee. Point your phone camera at the code below to install in seconds.</p>
        <div class="qr-wrap" id="qr-target"></div>
        <div><span class="url">${escaped}</span></div>
        <div class="steps">
          <div class="step"><strong>1 · Scan</strong><span>Open your Android camera and aim it at the QR.</span></div>
          <div class="step"><strong>2 · Tap link</strong><span>Open the link your camera surfaces.</span></div>
          <div class="step"><strong>3 · Install</strong><span>Tap Download and accept the install prompt.</span></div>
        </div>
        <div class="footer">Android-only · Free · realultimate</div>
      </div>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-svg@1.1.0/dist/qrcode.min.js"></script>
      <script>
        var qr = new QRCode({ content: ${JSON.stringify(DOWNLOAD_APK_URL)}, padding: 0, width: 360, height: 360, color: '#0f172a', background: '#ffffff', ecl: 'H', join: true, container: 'svg-viewbox' });
        document.getElementById('qr-target').innerHTML = qr.svg();
        window.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print(); }, 250); });
      <\u002fscript>
    </body></html>`)
    win.document.close()
  }

  const [spectateState, setSpectateState] = useState(createBaseState({ score1: 8, score2: 8, possession: TEAM_A.id }))
  const spectateIndexRef = useRef(0)
  const [spectateIndex, setSpectateIndex] = useState(0)
  const [isSpectatePlaying, setIsSpectatePlaying] = useState(false)
  const [hasSpectateStarted, setHasSpectateStarted] = useState(false)
  const [spectateClock, setSpectateClock] = useState(10 * 60 + 22)

  const [tournamentTab, setTournamentTab] = useState('overview')
  const [tournamentTabTouched, setTournamentTabTouched] = useState(false)

  const [prediction, setPrediction] = useState(null)
  const [reactions, setReactions] = useState({ '🔥': 23, '👏': 18, '😱': 9, '🎉': 14 })
  const [reactionBurst, setReactionBurst] = useState(null)

  const handlePrediction = (teamId) => setPrediction(teamId)
  const reactionKeyRef = useRef(0)
  const handleReaction = (emoji) => {
    setReactions((current) => ({ ...current, [emoji]: (current[emoji] || 0) + 1 }))
    reactionKeyRef.current += 1
    setReactionBurst({ emoji, key: reactionKeyRef.current })
  }

  useEffect(() => {
    if (!reactionBurst) return
    const timeout = setTimeout(() => setReactionBurst(null), 900)
    return () => clearTimeout(timeout)
  }, [reactionBurst])

  const demoGames = useMemo(() => DEMO_COMPLETED_GAMES, [])

  const recorderLeaders = useMemo(() => {
    const stats = recorderState.playerStats || {}
    return Object.entries(stats)
      .map(([id, stat]) => {
        const player = playerById[id]
        if (!player) return null
        const impact = (stat.goals || 0) * 2 + (stat.assists || 0) * 1.5 + (stat.blocks || 0) * 1.2 - (stat.turns || 0)
        return { id, name: player.name, ...stat, impact }
      })
      .filter(Boolean)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 4)
  }, [recorderState, playerById])

  const spectateLeaders = useMemo(() => {
    const stats = spectateState.playerStats || {}
    return Object.entries(stats)
      .map(([id, stat]) => {
        const player = playerById[id]
        if (!player) return null
        return { id, name: player.name, ...stat }
      })
      .filter(Boolean)
      .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))
      .slice(0, 3)
  }, [spectateState, playerById])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const revealTargets = document.querySelectorAll('[data-reveal]')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.2 }
    )

    revealTargets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const parallaxTargets = document.querySelectorAll('[data-parallax]')
    let frame = null

    const updateParallax = () => {
      const offset = window.scrollY
      parallaxTargets.forEach((el) => {
        const speed = Number(el.getAttribute('data-parallax')) || 0
        el.style.setProperty('--parallax', `${offset * speed}px`)
      })
      frame = null
    }

    const handleScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateParallax)
    }

    updateParallax()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const detect = () => {
      const ua = (window.navigator.userAgent || '').toLowerCase()
      const isAndroid = /android/.test(ua)
      const isIOS = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      if (isAndroid) setDevicePlatform('android')
      else if (isIOS) setDevicePlatform('ios')
      else setDevicePlatform('desktop')
    }
    const id = window.setTimeout(detect, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      const settle = window.setTimeout(() => setHeroScore(15), 0)
      return () => window.clearTimeout(settle)
    }
    const flashTimer = window.setTimeout(() => setHeroGoalFlash(true), 1100)
    const scoreTimer = window.setTimeout(() => setHeroScore(15), 1400)
    const cleanFlashTimer = window.setTimeout(() => setHeroGoalFlash(false), 3200)
    return () => {
      window.clearTimeout(flashTimer)
      window.clearTimeout(scoreTimer)
      window.clearTimeout(cleanFlashTimer)
    }
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const phone = document.querySelector('[data-hero-phone]')
    if (!phone) return undefined
    let frame = null

    const update = () => {
      const factor = Math.min(1.4, Math.max(0, window.scrollY / Math.max(1, window.innerHeight)))
      phone.style.setProperty('--hero-scroll', factor.toFixed(3))
      frame = null
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return
    const targets = Array.from(document.querySelectorAll('[data-scroll-progress]'))
    if (!targets.length) return
    let frame = null

    const update = () => {
      const viewport = window.innerHeight
      targets.forEach((section) => {
        const rect = section.getBoundingClientRect()
        const start = viewport * 0.85
        const end = -rect.height * 0.15
        const raw = (start - rect.top) / (start - end)
        const progress = Math.min(1, Math.max(0, raw))
        section.style.setProperty('--scroll-progress', progress.toFixed(3))
      })
      frame = null
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  useEffect(() => {
    if (!isSpectatePlaying) return
    const interval = setInterval(() => {
      const next = spectateSequence[spectateIndexRef.current]
      if (!next) {
        setIsSpectatePlaying(false)
        return
      }
      const event = { ...next, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() }
      setSpectateState((current) => applyEvent(current, event))
      spectateIndexRef.current += 1
      setSpectateIndex(spectateIndexRef.current)
      setSpectateClock((clock) => Math.max(0, clock - 12))
    }, 1800)

    return () => clearInterval(interval)
  }, [isSpectatePlaying])

  useEffect(() => {
    if (hasSpectateStarted) return
    const target = document.getElementById('spectate-demo')
    if (!target) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setHasSpectateStarted(true)
            setIsSpectatePlaying(true)
            observer.disconnect()
          }
        })
      },
      { rootMargin: '0px 0px -25% 0px', threshold: 0.18 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasSpectateStarted])

  useEffect(() => {
    if (!recorderPulse) return
    const timeout = setTimeout(() => setRecorderPulse(false), 650)
    return () => clearTimeout(timeout)
  }, [recorderPulse])

  const handleRecorderAction = (type) => {
    const selected = selectedPlayerId
    const selectedTeamId = playerById[selected]?.teamId || TEAM_A.id
    const currentHolder = discHolderId || selected
    const lineupPlayerIds = HAWKEYES.slice(0, 7).map((player) => player.id)
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      timestamp: Date.now(),
      playerId: selected,
      assistPlayerId: undefined,
      teamId: selectedTeamId,
      lineupPlayerIds,
      lineType: recorderState.currentPointNumber % 2 === 0 ? 'D' : 'O',
      pointNumber: recorderState.currentPointNumber || 1,
      timeElapsedMs: 12000
    }

    if (type === 'Pass') {
      const fallbackReceiver = HAWKEYES.find((player) => player.id !== currentHolder)?.id || selected
      event.playerId = selected === currentHolder ? fallbackReceiver : selected
      event.fromPlayerId = currentHolder
      event.toPlayerId = event.playerId
      event.assistPlayerId = currentHolder
      event.teamId = TEAM_A.id
      setDiscHolderId(event.playerId)
    } else if (type === 'Goal' || type === 'G') {
      event.type = 'Goal'
      event.playerId = selected
      event.assistPlayerId = currentHolder !== selected ? currentHolder : HAWKEYES.find((player) => player.id !== selected)?.id
      event.fromPlayerId = event.assistPlayerId
      event.toPlayerId = selected
      event.teamId = TEAM_A.id
      setDiscHolderId(HAWKEYES[0].id)
    } else if (type === 'Throwaway' || type === 'T' || type === 'Drop') {
      event.playerId = currentHolder
      event.fromPlayerId = currentHolder
      event.teamId = TEAM_A.id
      setDiscHolderId(null)
    } else if (type === 'D' || type === 'D-Block' || type === 'Opponent Turnover' || type === 'Callahan_US') {
      event.playerId = selected
      event.teamId = type === 'Opponent Turnover' ? TEAM_B.id : TEAM_A.id
      setDiscHolderId(type === 'Callahan_US' ? null : selected)
    }

    if (type === 'Opponent Score' || type === 'Callahan_THEM') {
      event.playerId = undefined
      event.teamId = TEAM_B.id
      setDiscHolderId(HAWKEYES[0].id)
    }

    if (type === 'Halftime' || type === 'End Halftime' || type === 'Timeout' || type.includes('Card')) {
      event.teamId = TEAM_A.id
    }

    setRecorderState((current) => applyEvent(current, event))
    setRecorderPulse(true)
  }

  const handleRecorderUndo = () => {
    setRecorderState((current) => {
      const trimmed = current.history.slice(0, -1)
      return rebuildStateFromHistory(recorderBaseState, trimmed)
    })
    setDiscHolderId(null)
  }

  const handleSpectateReset = () => {
    spectateIndexRef.current = 0
    setSpectateIndex(0)
    setSpectateState(createBaseState({ score1: 8, score2: 8, possession: TEAM_A.id }))
    setSpectateClock(10 * 60 + 22)
    setIsSpectatePlaying(true)
  }

  const eventLabel = (event) => {
    const player = playerById[event.playerId]
    const assist = playerById[event.assistPlayerId]
    const name = player?.name || 'Player'
    const assistName = assist?.name || ''
    switch (event.type) {
      case 'G':
      case 'Goal':
        return assistName ? `${name} scores from ${assistName}` : `${name} scores`
      case 'Pass':
        return assistName ? `${assistName} to ${name}` : `${name} completion`
      case 'D':
      case 'D-Block':
        return `${name} block`
      case 'Drop':
        return `${name} drop`
      case 'Throwaway':
      case 'T':
        return `${name} throwaway`
      case 'Opponent Turnover':
        return 'Opponent turnover, Iowa disc'
      case 'Opponent Score':
        return 'Iowa State scores'
      case 'Callahan_US':
        return `${name} Callahan for Iowa`
      case 'Callahan_THEM':
        return 'Iowa State Callahan'
      case 'Timeout':
        return 'Timeout logged'
      case 'Halftime':
      case 'End Halftime':
        return event.type
      case 'Blue Card':
      case 'Yellow Card':
      case 'Red Card':
        return `${event.type} for ${name}`
      default:
        return event.type
    }
  }

  const onFirePlayers = getOnFirePlayers(spectateState.history)
  const scoreDiff = Math.abs(spectateState.score1 - spectateState.score2)
  const pressureIndex = Math.max(1, 6 - scoreDiff)

  const fanPredictions = useMemo(() => {
    const diff = spectateState.score1 - spectateState.score2
    const totalGoals = spectateState.score1 + spectateState.score2
    const totalPredictions = 1840 + spectateIndex * 18 + totalGoals * 36
    const iowaPct = Math.min(86, Math.max(14, 50 + diff * 6))
    const isuPct = 100 - iowaPct
    return {
      iowaPct,
      isuPct,
      iowaCount: Math.round((iowaPct / 100) * totalPredictions),
      isuCount: Math.round((isuPct / 100) * totalPredictions),
      totalPredictions
    }
  }, [spectateState.score1, spectateState.score2, spectateIndex])
  const momentumText = useMemo(() => {
    const recentGoals = spectateState.history.filter((event) => event.type === 'G' || event.type === 'Goal').slice(-3)
    if (!recentGoals.length) return 'Possession battle'
    const last = recentGoals[recentGoals.length - 1]
    const scoringTeamId = last.teamId || playerById[last.playerId]?.teamId
    const streak = recentGoals.filter((goal) => (goal.teamId || playerById[goal.playerId]?.teamId) === scoringTeamId).length
    const teamName = scoringTeamId === TEAM_A.id ? TEAM_A.name : TEAM_B.name
    return `${teamName} on a ${streak}-point push`
  }, [spectateState.history, playerById])

  const territoryAlert = useMemo(() => {
    const lastEvent = [...spectateState.history].reverse().find((event) => isValidCoord(event.fieldPosition))
    const coord = lastEvent?.fieldPosition
    if (!coord) return 'Tracking possessions'
    if (coord.x >= 82) return 'Red zone pressure'
    if (coord.x <= 18) return 'Pinned in own end'
    return 'Midfield control'
  }, [spectateState.history])

  const wins = demoGames.filter((g) => g.score1 > g.score2).length
  const losses = demoGames.filter((g) => g.score1 < g.score2).length
  const winrate = Math.round((wins / demoGames.length) * 100)
  const totalPointDiff = demoGames.reduce((sum, game) => sum + game.score1 - game.score2, 0)
  const pointsForAvg = (demoGames.reduce((sum, game) => sum + game.score1, 0) / demoGames.length).toFixed(1)
  const pointsAgainstAvg = (demoGames.reduce((sum, game) => sum + game.score2, 0) / demoGames.length).toFixed(1)
  const teamRating = Math.round(winrate * 0.7 + Math.max(0, totalPointDiff) * 1.8)
  const teamStatLeaders = useMemo(() => {
    const stats = {}
    demoGames.forEach((game) => {
      Object.entries(game.playerStats || {}).forEach(([id, stat]) => {
        stats[id] = stats[id] || { goals: 0, assists: 0, blocks: 0, turns: 0, passes: 0 }
        stats[id].goals += stat.goals || 0
        stats[id].assists += stat.assists || 0
        stats[id].blocks += stat.blocks || 0
        stats[id].turns += stat.turns || 0
        stats[id].passes += stat.passes || 0
      })
    })
    return Object.entries(stats)
      .map(([id, stat]) => ({ id, name: playerById[id]?.name || 'Player', ...stat }))
      .sort((a, b) => ((b.goals * 2) + b.assists + b.blocks) - ((a.goals * 2) + a.assists + a.blocks))
      .slice(0, 4)
  }, [demoGames, playerById])

  return (
    <div className="site">
      <div className="background-effects" aria-hidden="true">
        <span className="glow glow-primary" data-parallax="0.08"></span>
        <span className="glow glow-success" data-parallax="0.05"></span>
      </div>

      <header className="nav">
        <div className="nav-inner">
          <a className="logo" href="#hero" aria-label="RealUltimate home">
            <img src={brandIconUrl} alt="" className="logo-icon" />
            <span>RealUltimate</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#features">Why</a>
            <a href="#recorder-demo">Recorder</a>
            <a href="#spectate-demo">Spectate</a>
            <a href="#team-demo">Profile</a>
            <a href="#tournament-demo">Tournament</a>
            <a href="#vision">Vision</a>
          </nav>
          <a className="nav-cta" href="#download">
            Download
          </a>
        </div>
      </header>

      <main>
        <section id="hero" className="hero section">
          <div className="hero-grid">
            <div className="hero-copy reveal" data-reveal>
              <div className="eyebrow">Professional Grade Ultimate Platform</div>
              <h1>Ultimate Frisbee, Evolved. Real Stats. Real-Time. RealUltimate.</h1>
              <p className="lead">
                The most advanced scoring and tournament platform ever built for the Ultimate community.
                From pool play to championship point, keep every coach, player, and fan in the loop.
              </p>
              <div className="cta-row">
                <a className="btn btn-primary" href={DOWNLOAD_APK_URL} download rel="noopener noreferrer">
                  Download the APK
                </a>
                <a className="btn btn-secondary" href="#recorder-demo">
                  Explore Features
                </a>
              </div>
              <div className="chip-row">
                {keywords.map((keyword) => (
                  <span key={keyword} className="chip">{keyword}</span>
                ))}
              </div>
            </div>
            <div className="hero-visual reveal" data-reveal>
              <div className="hero-stage" data-parallax="0.04" data-hero-phone>
                <div className="hero-stage-glow" aria-hidden="true"></div>

                <div className="hero-flair hero-flair--notify" aria-hidden="true">
                  <div className="hero-flair-inner">
                    <div className="hero-notify-time">9:41 — Lock screen</div>
                    <div className="hero-notify-card">
                      <span className="hero-notify-icon">
                        <img src={brandIconUrl} alt="" />
                      </span>
                      <div className="hero-notify-body">
                        <div className="hero-notify-head">
                          <strong>RealUltimate</strong>
                          <small>now</small>
                        </div>
                        <div className="hero-notify-title">🚨 Iowa Scores!</div>
                        <div className="hero-notify-text">Universe point. 15-14 over Iowa State.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hero-flair hero-flair--bracket" aria-hidden="true">
                  <div className="hero-flair-inner">
                    <div className="hero-bracket-head">
                      <span>Bracket update</span>
                      <span className="hero-bracket-pill">FINAL</span>
                    </div>
                    <div className="hero-bracket-tree">
                      <div className="hero-mb-col">
                        <div className="hero-mb-match hero-mb-match--won">
                          <span>Iowa</span><strong>15</strong>
                        </div>
                        <div className="hero-mb-match hero-mb-match--lost">
                          <span>Volt</span><strong>9</strong>
                        </div>
                        <div className="hero-mb-spacer"></div>
                        <div className="hero-mb-match hero-mb-match--won">
                          <span>Iowa St.</span><strong>15</strong>
                        </div>
                        <div className="hero-mb-match hero-mb-match--lost">
                          <span>Nimbus</span><strong>12</strong>
                        </div>
                      </div>
                      <div className="hero-mb-col hero-mb-col--final">
                        <div className="hero-mb-trophy">
                          <span>🏆 CHAMPION</span>
                          <strong>University of Iowa</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="hero-phone-scroll">
                  <div className="hero-phone-tilted">
                    <div className="hero-phone-frame">
                      <div className="hero-phone-bezel-top">
                        <span className="hero-phone-speaker"></span>
                        <span className="hero-phone-camera"></span>
                      </div>
                      <div className="hero-phone-screen">
                        <div className="hp-status">
                          <span>9:41</span>
                          <span className="hp-status-brand">
                            <img src={brandIconUrl} alt="" />
                            RealUltimate
                          </span>
                          <span className="hp-status-icons" aria-hidden="true">
                            <span className="hp-sig"></span>
                            <span className="hp-sig"></span>
                            <span className="hp-sig"></span>
                            <span className="hp-batt"></span>
                          </span>
                        </div>

                        <div className="hp-app-bar">
                          <span className="hp-app-back">&larr;</span>
                          <span className="hp-app-title">Game Recorder</span>
                          <span className="hp-app-menu">⋯</span>
                        </div>

                        <div className={`hp-scoreboard ${heroGoalFlash ? 'hp-scoreboard--flash' : ''}`}>
                          <div className="hp-score-box hp-score-box--ours">
                            <span className="hp-score-team">IOWA</span>
                            <strong className={`hp-score-num ${heroScore === 15 ? 'hp-score-num--pop' : ''}`}>{heroScore}</strong>
                            {heroGoalFlash ? <span className="hp-goal-flash">GOAL!</span> : null}
                          </div>
                          <div className="hp-disc-col">
                            <span className="hp-disc-pill"></span>
                            <span className="hp-disc-caption">IOWA<br/>Disc</span>
                          </div>
                          <div className="hp-score-box hp-score-box--dim">
                            <span className="hp-score-team">ISU</span>
                            <strong className="hp-score-num">14</strong>
                          </div>
                        </div>

                        <div className="hp-clock-card">
                          <div className="hp-clock-face">
                            <strong>74:18</strong>
                            <small>Universe Point</small>
                          </div>
                          <div className="hp-clock-meta">
                            <span>Soft 75m</span>
                            <span>Hard 90m</span>
                          </div>
                        </div>

                        <div className="hp-section-head">
                          <span>Active lineup (7/7)</span>
                          <small>P14 · O-LINE</small>
                        </div>
                        <div className="hp-lineup-grid">
                          <span className="hp-player">Jordan</span>
                          <span className="hp-player">Morgan</span>
                          <span className="hp-player">Sam</span>
                          <span className="hp-player hp-player--selected">
                            Taylor
                            <span className="hp-disc-dot"></span>
                          </span>
                          <span className="hp-player">Riley</span>
                          <span className="hp-player">Drew</span>
                          <span className="hp-player">Skyler</span>
                        </div>

                        <div className="hp-section-head">
                          <span>Tactical actions</span>
                          <small>Offense</small>
                        </div>
                        <div className="hp-action-grid">
                          <button type="button" className="hp-tactile hp-tactile--primary">
                            <span className="hp-tactile-icon">◎</span>
                            <span className="hp-tactile-label">Goal</span>
                            <span className="hp-tactile-tap" aria-hidden="true"></span>
                          </button>
                          <button type="button" className="hp-tactile hp-tactile--error">
                            <span className="hp-tactile-icon">✕</span>
                            <span className="hp-tactile-label">Throwaway</span>
                          </button>
                          <button type="button" className="hp-tactile hp-tactile--warning">
                            <span className="hp-tactile-icon">↓</span>
                            <span className="hp-tactile-label">Drop</span>
                          </button>
                          <button type="button" className="hp-tactile hp-tactile--accent">
                            <span className="hp-tactile-icon">⚡</span>
                            <span className="hp-tactile-label">Opp. Callahan</span>
                          </button>
                        </div>

                        <div className="hp-log-mini">
                          <span className="hp-log-mini-tag hp-log-mini-tag--goal">GOAL</span>
                          <span>Quinn ← Rivera</span>
                          <span className="hp-log-mini-time">74:42</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="metrics-grid">
            {metrics.map((metric) => (
              <div className="metric-card" data-reveal key={metric.label}>
                <div className="metric-value">{metric.value}</div>
                <div className="metric-label">{metric.label}</div>
                <div className="metric-detail">{metric.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="section">
          <div className="section-head reveal" data-reveal>
            <p className="eyebrow">Speed meets trust</p>
            <h2>Instant. Precision. Built for the game.</h2>
            <p>
              RealUltimate gives coaches, organizers, and fans a Professional Grade experience with
              Native speed. Every point, every stat, every update is built to keep the entire sideline
              in sync.
            </p>
          </div>

          <div className="feature-block reveal" data-reveal>
            <div className="feature-copy">
              <h3>The Speed of the Game</h3>
              <p>
                Iowa scores. 14-12, universe point. Followers notified. 2,417 lock screens light up
                before the disc is back at midfield.
              </p>
              <ul className="feature-list">
                <li>Instant push on every score, break, and timeout</li>
                <li>Native iOS and Android delivery — feels like a text</li>
                <li>Followers opt in once, then never miss a point</li>
              </ul>
            </div>
            <div className="feature-visual lock-visual">
              <div className="lock-screen">
                <div className="lock-clock">
                  <span className="lock-day">Saturday, April 19</span>
                  <span className="lock-time">9:41</span>
                </div>
                <div className="lock-notification lock-notification--primary">
                  <div className="lock-app">
                    <span className="lock-app-icon">
                      <img src={brandIconUrl} alt="" />
                    </span>
                    <span className="lock-app-name">RealUltimate</span>
                    <span className="lock-time-ago">now</span>
                  </div>
                  <div className="lock-title">Iowa Scores!</div>
                  <div className="lock-body">The score is now 14-12. Universe point is up next.</div>
                </div>
                <div className="lock-notification lock-notification--secondary">
                  <div className="lock-app">
                    <span className="lock-app-icon">
                      <img src={brandIconUrl} alt="" />
                    </span>
                    <span className="lock-app-name">RealUltimate</span>
                    <span className="lock-time-ago">2m ago</span>
                  </div>
                  <div className="lock-title">D-block · Riley Chen</div>
                  <div className="lock-body">Iowa picks up the disc at midfield.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="feature-block reverse reveal" data-reveal>
            <div className="feature-copy">
              <h3>Data for the Deep-Dive</h3>
              <p>
                Every disc. Every yard. Every second. RealUltimate tracks how long each player holds
                the disc, exactly where on the field every event unfolds, and which lines are
                converting under pressure &mdash; from break points and completion percentage to
                possession streaks and field-position heatmaps. Dual observer mode captures both
                sidelines simultaneously so coaches walk into the second half with precise, granular
                evidence instead of guesswork.
              </p>
              <ul className="feature-list">
                <li>Side-by-side break math, completion, and tempo</li>
                <li>Per-player goals, assists, blocks, and turnovers</li>
                <li>Export the full feed the moment time expires</li>
              </ul>
            </div>
            <div className="feature-visual data-visual">
              <div className="vs-card">
                <div className="vs-card-head">
                  <div className="vs-side vs-side--ours">
                    <span className="vs-name">University of Iowa</span>
                    <span className="vs-tag positive">+4 breaks</span>
                  </div>
                  <div className="vs-divider">VS</div>
                  <div className="vs-side vs-side--opp">
                    <span className="vs-name">Iowa State</span>
                    <span className="vs-tag negative">-2 breaks</span>
                  </div>
                </div>

                <div className="vs-circles">
                  <div className="vs-circle vs-circle--ours">
                    <svg viewBox="0 0 120 120" aria-hidden="true">
                      <circle className="vs-circle-track" cx="60" cy="60" r="52" />
                      <circle className="vs-circle-fill" cx="60" cy="60" r="52" style={{ strokeDasharray: 326.7, strokeDashoffset: 326.7 * (1 - 0.91) }} />
                    </svg>
                    <div className="vs-circle-label">
                      <strong>91%</strong>
                      <small>Completion</small>
                    </div>
                  </div>
                  <div className="vs-circle vs-circle--opp">
                    <svg viewBox="0 0 120 120" aria-hidden="true">
                      <circle className="vs-circle-track" cx="60" cy="60" r="52" />
                      <circle className="vs-circle-fill" cx="60" cy="60" r="52" style={{ strokeDasharray: 326.7, strokeDashoffset: 326.7 * (1 - 0.84) }} />
                    </svg>
                    <div className="vs-circle-label">
                      <strong>84%</strong>
                      <small>Completion</small>
                    </div>
                  </div>
                </div>

                <div className="vs-bars">
                  <div className="vs-bar-row">
                    <span className="vs-bar-label">D-blocks</span>
                    <div className="vs-bar-track">
                      <div className="vs-bar-fill vs-bar-ours" style={{ width: '72%' }}></div>
                      <div className="vs-bar-fill vs-bar-opp" style={{ width: '40%' }}></div>
                    </div>
                    <span className="vs-bar-value"><em>9</em> · 5</span>
                  </div>
                  <div className="vs-bar-row">
                    <span className="vs-bar-label">Turnovers</span>
                    <div className="vs-bar-track">
                      <div className="vs-bar-fill vs-bar-ours" style={{ width: '38%' }}></div>
                      <div className="vs-bar-fill vs-bar-opp" style={{ width: '70%' }}></div>
                    </div>
                    <span className="vs-bar-value"><em>5</em> · 9</span>
                  </div>
                  <div className="vs-bar-row">
                    <span className="vs-bar-label">Hold rate</span>
                    <div className="vs-bar-track">
                      <div className="vs-bar-fill vs-bar-ours" style={{ width: '88%' }}></div>
                      <div className="vs-bar-fill vs-bar-opp" style={{ width: '74%' }}></div>
                    </div>
                    <span className="vs-bar-value"><em>88%</em> · 74%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="feature-block reveal" data-reveal>
            <div className="feature-copy">
              <h3>Tournament Management Redefined</h3>
              <p>
                From Pool Play to the Championship Point. Pools auto-seed brackets, scores promote
                winners, and standings update for every team and every fan in real time.
              </p>
              <ul className="feature-list">
                <li>Auto-seeded pools that promote into the bracket</li>
                <li>Live standings synced across every device</li>
                <li>One control surface for the entire tournament weekend</li>
              </ul>
            </div>
            <div className="feature-visual mini-bracket-visual">
              <div className="mini-bracket" aria-hidden="true">
                <div className="mb-col">
                  <div className="mb-round">Semifinals</div>
                  <div className="mb-match mb-match--won">
                    <span className="mb-team">Iowa</span>
                    <span className="mb-score">15</span>
                  </div>
                  <div className="mb-match mb-match--lost">
                    <span className="mb-team">Volt</span>
                    <span className="mb-score">9</span>
                  </div>
                  <div className="mb-spacer"></div>
                  <div className="mb-match mb-match--won">
                    <span className="mb-team">Iowa State</span>
                    <span className="mb-score">15</span>
                  </div>
                  <div className="mb-match mb-match--lost">
                    <span className="mb-team">Nimbus</span>
                    <span className="mb-score">12</span>
                  </div>
                </div>
                <div className="mb-col mb-col--mid">
                  <div className="mb-round">Final</div>
                  <div className="mb-match mb-match--won">
                    <span className="mb-team">Iowa</span>
                    <span className="mb-score">15</span>
                  </div>
                  <div className="mb-match mb-match--lost">
                    <span className="mb-team">Iowa State</span>
                    <span className="mb-score">11</span>
                  </div>
                </div>
                <div className="mb-col mb-col--final">
                  <div className="mb-round">Champion</div>
                  <div className="mb-trophy">
                    <span className="mb-trophy-tag">CHAMPION</span>
                    <span className="mb-trophy-team">University of Iowa</span>
                    <span className="mb-trophy-meta">7-0 · Midwest Open</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="recorder-demo" className="section demo-section">
          <div className="demo-pair demo-pair--mobile-showcase-first">
            <div className="demo-copy reveal" data-reveal>
              <p className="eyebrow">Built for the Sideline</p>
              <h2>The fastest recorder in Ultimate</h2>
              <p>
                Two taps logs an event. Tap the player with the disc, then tap the action — pass,
                goal, throwaway, drop, D-block, or opponent score. RealUltimate handles possession
                changes automatically, so the offense and defense buttons swap themselves at the
                exact moment the disc flips.
              </p>
              <p>
                Every tap drives a full audit trail: per-player goals, assists, blocks, turnovers,
                and pass completions, plus a play-by-play event log your whole bench can scroll
                through between points.
              </p>
              <div className="side-card">
                <div className="card-title">Live stat leaders</div>
                <div className="leader-list">
                  {recorderLeaders.map((leader) => (
                    <div key={leader.id} className="leader-row">
                      <span>{leader.name}</span>
                      <span>G {leader.goals} A {leader.assists} D {leader.blocks}</span>
                    </div>
                  ))}
                  {!recorderLeaders.length ? <div className="leader-row muted">Tap a player and an action to begin</div> : null}
                </div>

                <div className="card-title">Event log</div>
                <div className="event-log">
                  {recorderState.history.slice(-6).reverse().map((event) => (
                    <div key={event.id} className="event-row">
                      <span>{event.type}</span>
                      <span>{eventLabel(event)}</span>
                    </div>
                  ))}
                  {!recorderState.history.length ? <div className="event-row muted">No events yet</div> : null}
                </div>
              </div>
            </div>

            <div className="app-screen reveal app-screen--interactive" data-reveal>
              <span className="live-pill" aria-hidden="true">
                <span className="live-dot"></span>
                Try it · Live
              </span>
              <div className="app-topbar">
                <button className="icon-button" type="button">&#8592;</button>
                <div className="app-title">Game Recorder</div>
                <button className="icon-button" type="button">&#8942;</button>
              </div>
              <div className="app-content">
                <div className="app-scoreboard">
                  <div className={`score-box ${recorderState.possession === TEAM_A.id ? 'score-box--ours' : 'score-box--dim'}`}>
                    <div className="score-label">{TEAM_A.name.toUpperCase()}</div>
                    <div className={`score-number ${recorderPulse ? 'score-pulse' : ''}`}>{recorderState.score1}</div>
                  </div>
                  <div className="score-disc">
                    <div className="disc-pill"></div>
                    <div className="disc-caption">{recorderState.possession === TEAM_A.id ? TEAM_A.short : TEAM_B.short} Disc</div>
                  </div>
                  <div className={`score-box ${recorderState.possession === TEAM_B.id ? 'score-box--opp' : 'score-box--dim'}`}>
                    <div className="score-label">{TEAM_B.name.toUpperCase()}</div>
                    <div className={`score-number ${recorderPulse ? 'score-pulse' : ''}`}>{recorderState.score2}</div>
                  </div>
                </div>

                <div className="clock-card">
                  <div className="clock-face">
                    <span className="clock-time">42:18</span>
                    <span className="clock-label">{recorderState.isHalftime ? 'Halftime paused' : 'Soft cap 75m'}</span>
                  </div>
                  <div className="clock-meta">
                    <span>Hard 90m</span>
                    <span>7v7</span>
                  </div>
                </div>

                <div className="section-row">
                  <span className="section-title">Active lineup</span>
                  <span className="section-chip">P{recorderState.currentPointNumber} · {recorderState.currentPointNumber % 2 === 0 ? 'D' : 'O'}-Line</span>
                </div>
                <div className="lineup-hint">
                  {recorderState.possession === TEAM_A.id
                    ? (discHolderId
                        ? `${playerById[discHolderId]?.name.split(' ')[0]} has the disc. Tap a teammate then Pass, or score with Goal.`
                        : 'Iowa on offense. Tap any player to put the disc in their hands.')
                    : 'Iowa is on defense. Tap a defender, then log a D-block, an opponent turnover, or an opponent score.'}
                </div>
                <div className="player-grid">
                  {HAWKEYES.slice(0, 7).map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={`player-button ${selectedPlayerId === player.id ? 'selected' : ''} ${discHolderId === player.id ? 'holding-disc' : ''}`}
                      onClick={() => {
                        setSelectedPlayerId(player.id)
                        if (recorderState.possession === TEAM_A.id) setDiscHolderId(player.id)
                      }}
                    >
                      <span className="player-name">{player.name.split(' ')[0]}</span>
                      <span className="player-meta">#{player.number}</span>
                    </button>
                  ))}
                </div>

                <div className="action-panel">
                  <div className="section-row">
                    <span className="section-title">{recorderState.possession === TEAM_A.id ? 'Offense actions' : 'Defense actions'}</span>
                    <span className={`section-chip ${recorderState.possession === TEAM_A.id ? 'chip-offense' : 'chip-defense'}`}>
                      {recorderState.possession === TEAM_A.id ? 'IOWA ON O' : 'IOWA ON D'}
                    </span>
                  </div>
                  {recorderState.possession === TEAM_A.id ? (
                    <>
                      <div className="action-row">
                        <button type="button" className="tactile-button primary" onClick={() => handleRecorderAction('Goal')}>Goal</button>
                        <button type="button" className="tactile-button danger" onClick={() => handleRecorderAction('Throwaway')}>Throwaway</button>
                      </div>
                      <div className="action-row">
                        <button type="button" className="tactile-button success" onClick={() => handleRecorderAction('Pass')}>Pass</button>
                        <button type="button" className="tactile-button warning" onClick={() => handleRecorderAction('Drop')}>Drop</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="action-row">
                        <button type="button" className="tactile-button neutral" onClick={() => handleRecorderAction('D')}>D-Block</button>
                        <button type="button" className="tactile-button success" onClick={() => handleRecorderAction('Opponent Turnover')}>Opp. Turnover</button>
                      </div>
                      <div className="action-row">
                        <button type="button" className="tactile-button error" onClick={() => handleRecorderAction('Opponent Score')}>Opp. Score</button>
                        <button type="button" className="tactile-button success" onClick={() => handleRecorderAction('Callahan_US')}>US Callahan</button>
                      </div>
                    </>
                  )}
                  <div className="action-row">
                    <button type="button" className="control-button" onClick={handleRecorderUndo}>Undo</button>
                    <button type="button" className="control-button" onClick={() => handleRecorderAction('Timeout')}>Timeout</button>
                    <button type="button" className="control-button" onClick={() => handleRecorderAction(recorderState.isHalftime ? 'End Halftime' : 'Halftime')}>
                      {recorderState.isHalftime ? 'Resume' : 'Halftime'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="spectate-demo" className="section demo-section scroll-stage" data-scroll-progress>
          <div className="demo-pair demo-pair--reverse">
            <div className="app-screen reveal app-screen--interactive" data-reveal>
              <span className="live-pill" aria-hidden="true">
                <span className="live-dot"></span>
                Live · React below
              </span>
              <div className="app-topbar">
                <button className="icon-button" type="button">&#8592;</button>
                <div className="app-title">Spectate Live</div>
                <button className="icon-button" type="button">&#8942;</button>
              </div>
              <div className="app-content">
                <div className="app-scoreboard">
                  <div className={`score-box ${spectateState.possession === TEAM_A.id ? 'score-box--ours' : 'score-box--dim'}`}>
                    <div className="score-label">{TEAM_A.short}</div>
                    <div className="score-number">{spectateState.score1}</div>
                  </div>
                  <div className="score-disc">
                    <div className="disc-pill"></div>
                    <div className="disc-caption">{spectateState.possession === TEAM_A.id ? TEAM_A.short : TEAM_B.short} Disc</div>
                  </div>
                  <div className={`score-box ${spectateState.possession === TEAM_B.id ? 'score-box--opp' : 'score-box--dim'}`}>
                    <div className="score-label">{TEAM_B.short}</div>
                    <div className="score-number">{spectateState.score2}</div>
                  </div>
                </div>

                <div className="spectate-controls">
                  <button type="button" className="pill" onClick={() => setIsSpectatePlaying((value) => !value)}>
                    {isSpectatePlaying ? 'Pause' : 'Play'}
                  </button>
                  <button type="button" className="pill" onClick={handleSpectateReset}>
                    Reset demo
                  </button>
                  <div className="spectate-clock">{formatClock(spectateClock)}</div>
                </div>

                <LiveFieldTracker events={spectateState.history} ourTeamName={TEAM_A.name} oppTeamName={TEAM_B.name} />

                <div className="prediction-card">
                  <div className="prediction-header">Predict next point</div>
                  <div className="prediction-row">
                    <button
                      type="button"
                      className={`prediction-button ${prediction === TEAM_A.id ? 'prediction-active prediction-active--ours' : ''}`}
                      onClick={() => handlePrediction(TEAM_A.id)}
                    >
                      <span>Iowa scores</span>
                      <small>{prediction === TEAM_A.id ? 'Locked' : 'Tap to predict'}</small>
                    </button>
                    <button
                      type="button"
                      className={`prediction-button ${prediction === TEAM_B.id ? 'prediction-active prediction-active--opp' : ''}`}
                      onClick={() => handlePrediction(TEAM_B.id)}
                    >
                      <span>Iowa State scores</span>
                      <small>{prediction === TEAM_B.id ? 'Locked' : 'Tap to predict'}</small>
                    </button>
                  </div>
                </div>

                <div className="reaction-card">
                  <div className="reaction-header">Crowd reactions</div>
                  <div className="reaction-row">
                    {Object.entries(reactions).map(([emoji, count]) => (
                      <button
                        key={emoji}
                        type="button"
                        className="reaction-button"
                        onClick={() => handleReaction(emoji)}
                      >
                        <span className="reaction-emoji">{emoji}</span>
                        <span className="reaction-count">{count}</span>
                      </button>
                    ))}
                  </div>
                  {reactionBurst ? (
                    <div className="reaction-burst" key={reactionBurst.key}>{reactionBurst.emoji}</div>
                  ) : null}
                </div>

                <div className="intel-card">
                  <div className="intel-title">Live intelligence</div>
                  <div className="intel-grid">
                    <div className="intel-pill">
                      <span>Momentum</span>
                      <strong>{momentumText}</strong>
                    </div>
                    <div className="intel-pill">
                      <span>Pressure index</span>
                      <strong>{pressureIndex}</strong>
                    </div>
                  </div>
                  <div className="intel-grid">
                    <div className="intel-pill">
                      <span>Territory alert</span>
                      <strong>{territoryAlert}</strong>
                    </div>
                    <div className="intel-pill">
                      <span>Live events</span>
                      <strong>{spectateState.history.length}</strong>
                    </div>
                  </div>
                </div>

                {onFirePlayers.length ? (
                  <div className="on-fire">
                    On fire: {onFirePlayers.map((id) => playerById[id]?.name).join(', ')}
                  </div>
                ) : null}

                <div className="card-title">Play by play</div>
                <div className="event-log">
                  {spectateState.history.slice(-6).reverse().map((event) => (
                    <div key={`${event.timestamp}-${event.type}`} className="event-row">
                      <span>{event.type}</span>
                      <span>{eventLabel(event)}</span>
                    </div>
                  ))}
                  {!spectateState.history.length ? <div className="event-row muted">Live feed warming up</div> : null}
                </div>
              </div>
            </div>

            <div className="demo-copy reveal" data-reveal>
              <p className="eyebrow">Live for Every Fan</p>
              <h2>Closer to the disc than the sideline</h2>
              <p>
                RealUltimate beams every point straight to your followers' lock screens. Score
                updates, field position, momentum, and pressure all stream in real time — no
                refreshes, no spreadsheets, no lag.
              </p>
              <p>
                Fans can lock predictions, fire reactions, and ride the momentum with the team.
                Coaches and recruiters get a play-by-play feed they can rewatch the second the
                final point lands.
              </p>
              <div className="side-card">
                <div className="card-title">Top performers</div>
                <div className="leader-list">
                  {spectateLeaders.map((leader) => (
                    <div key={leader.id} className="leader-row">
                      <span>{leader.name}</span>
                      <span>G {leader.goals} A {leader.assists} D {leader.blocks}</span>
                    </div>
                  ))}
                  {!spectateLeaders.length ? <div className="leader-row muted">Stats incoming...</div> : null}
                </div>
                <div className="card-title">Fan predictions</div>
                <div className="fan-predictions">
                  <div className="fp-summary">
                    <span className="fp-total">{fanPredictions.totalPredictions.toLocaleString()} fans</span>
                    <span className="fp-shift">
                      {scoreDiff === 0
                        ? 'Tied — coin flip'
                        : `${spectateState.score1 > spectateState.score2 ? 'Iowa' : 'Iowa State'} favored`}
                    </span>
                  </div>
                  <div className="fp-bar" role="img" aria-label={`Iowa ${fanPredictions.iowaPct}% vs Iowa State ${fanPredictions.isuPct}%`}>
                    <div className="fp-bar-iowa" style={{ width: `${fanPredictions.iowaPct}%` }}>
                      <span>Iowa {fanPredictions.iowaPct}%</span>
                    </div>
                    <div className="fp-bar-isu" style={{ width: `${fanPredictions.isuPct}%` }}>
                      <span>ISU {fanPredictions.isuPct}%</span>
                    </div>
                  </div>
                  <div className="fp-rows">
                    <div className="fp-row">
                      <span className="fp-dot fp-dot--iowa"></span>
                      <span className="fp-name">Iowa to win</span>
                      <span className="fp-count">{fanPredictions.iowaCount.toLocaleString()}</span>
                    </div>
                    <div className="fp-row">
                      <span className="fp-dot fp-dot--isu"></span>
                      <span className="fp-name">Iowa State to win</span>
                      <span className="fp-count">{fanPredictions.isuCount.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="fp-foot">
                    <span>Updates with every point</span>
                    <strong>{isSpectatePlaying ? 'LIVE' : 'PAUSED'}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="team-demo" className="section demo-section">
          <div className="demo-pair demo-pair--mobile-showcase-first">
            <div className="demo-copy reveal" data-reveal>
              <p className="eyebrow">Team Profile Demo</p>
              <h2>The team hub coaches and fans rely on</h2>
              <p>
                A polished team page with the Iowa banner and icon, win-rate stats, full roster,
                upcoming games, and a historical match log.
              </p>
              <div className="side-card">
                <div className="card-title">Match history & stats</div>
                <div className="leader-list">
                  {teamStatLeaders.map((leader) => (
                    <div key={leader.id} className="leader-row">
                      <span>{leader.name}</span>
                      <span>G {leader.goals} A {leader.assists} D {leader.blocks}</span>
                    </div>
                  ))}
                </div>
                <div className="history-list">
                  {demoGames.map((game) => (
                    <div key={game.id} className="history-row">
                      <div>
                        <div>vs {game.opponent}</div>
                        <div className="muted">{new Date(game.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                      </div>
                      <div className="history-score">
                        {game.score1} - {game.score2}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="app-screen reveal" data-reveal>
              <div className="app-topbar">
                <button className="icon-button" type="button">&#8592;</button>
                <div className="app-title">{TEAM_A.name}</div>
                <button className="icon-button" type="button">&#9998;</button>
              </div>
              <div className="app-content">
                <div className="team-profile-card">
                  <div className="team-banner" style={{ backgroundImage: `url(${iowaBannerUrl})` }}></div>
                  <div className="team-avatar-wrap">
                    <img src={iowaIconUrl} alt="University of Iowa icon" className="team-avatar-img" />
                  </div>
                  <div className="team-profile-body">
                    <div className="team-profile-title-row">
                      <div>
                        <div className="team-name-lg">{DEMO_TEAM_PROFILE.name}</div>
                        <div className="team-sub">{DEMO_TEAM_PROFILE.division}</div>
                      </div>
                      <div className="team-pill">{DEMO_TEAM_PROFILE.followers.toLocaleString()} followers</div>
                    </div>
                    <p className="team-bio">{DEMO_TEAM_PROFILE.bio}</p>
                    <div className="team-code-row">
                      <span>Fan code <strong>{DEMO_TEAM_PROFILE.fanCode}</strong></span>
                      <span>Coach: {DEMO_TEAM_PROFILE.coach}</span>
                      <span>Public Team Page</span>
                    </div>
                  </div>
                </div>

                <div className="team-actions">
                  <button type="button" className="primary-btn">Follow Team</button>
                  <button type="button" className="ghost-btn">Watch Live</button>
                </div>

                <div className="stats-tape">
                  <div>
                    <span>Win rate</span>
                    <strong>{winrate}%</strong>
                  </div>
                  <div className="accent">
                    <span>Points for/game</span>
                    <strong>{pointsForAvg}</strong>
                  </div>
                  <div>
                    <span>Points against/game</span>
                    <strong>{pointsAgainstAvg}</strong>
                  </div>
                </div>

                <div className="rating-card">
                  <span>Team Rating</span>
                  <strong>{teamRating}</strong>
                  <small>{wins}-{losses} record · +{totalPointDiff} point differential</small>
                </div>

                <div className="section-row">
                  <span className="section-title">Roster</span>
                  <span className="section-chip">12 players</span>
                </div>
                <div className="roster-list">
                  {HAWKEYES.slice(0, 6).map((player) => (
                    <div key={player.id} className="roster-row">
                      <div>
                        <div className="player-name">{player.name}</div>
                        <div className="player-meta">#{player.number} · {POSITION_LABEL[player.position]}</div>
                      </div>
                      <span className="line-pill">{LINE_LABEL[player.line]}</span>
                    </div>
                  ))}
                </div>

                <div className="section-row">
                  <span className="section-title">Scheduled games</span>
                  <span className="section-chip">Upcoming</span>
                </div>
                <div className="schedule-list">
                  {demoScheduledGames.map((game) => (
                    <div key={game.id} className="schedule-row">
                      <span>{game.date}</span>
                      <span>vs {game.opponent}</span>
                      <span>{game.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tournament-demo" className="section demo-section">
          <div className="demo-pair demo-pair--reverse demo-pair--mobile-copy-first">
            <div className="app-screen reveal app-screen--interactive" data-reveal>
              <span className="live-pill" aria-hidden="true">
                <span className="live-dot"></span>
                Try the tabs
              </span>
              <div className="tournament-hero">
                <div className="hero-row">
                  <button className="icon-button" type="button">&#8592;</button>
                  <span className="hero-status">COMPLETED</span>
                </div>
                <div className="hero-title">RealUltimate Showcase</div>
                <div className="hero-sub">8-team finals · Eastern Iowa Complex</div>
              </div>
              <div className={`tab-bar tournament-tabs ${tournamentTabTouched ? '' : 'tab-bar--nudge'}`}>
                {['overview', 'pools', 'bracket', 'activity', 'teams'].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`tab-item ${tournamentTab === tab ? 'active' : ''}`}
                    onClick={() => {
                      setTournamentTab(tab)
                      setTournamentTabTouched(true)
                    }}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div className="app-content">
                {tournamentTab === 'overview' ? (
                  <>
                    <div className="champion-card">
                      <span>Champion</span>
                      <strong>University of Iowa</strong>
                    </div>
                    <div className="info-box">
                      <div className="info-row">
                        <span>Host Team</span>
                        <strong>University of Iowa</strong>
                      </div>
                      <div className="info-row">
                        <span>Format</span>
                        <strong>2 Pools → Quarterfinals → Final</strong>
                      </div>
                      <div className="info-row">
                        <span>Status</span>
                        <strong>Completed</strong>
                      </div>
                      <div className="info-row">
                        <span>Final Score</span>
                        <strong>Iowa 15 — 12 Volt</strong>
                      </div>
                    </div>
                    <div className="table-card">
                      <div className="table-header">Final standings</div>
                      <div className="table-row header">
                        <span>Team</span>
                        <span>W-L</span>
                        <span>PD</span>
                      </div>
                      {demoTournamentStandings.map((team, idx) => (
                        <div key={team.id} className="table-row">
                          <span>{idx + 1}. {team.team}</span>
                          <span>{team.record}</span>
                          <span>{team.pointDiff}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : tournamentTab === 'pools' ? (
                  <div className="pool-match-stack">
                    {demoTournamentMatches.map((match) => (
                      <div key={match.id} className="pool-match-card">
                        <div className="match-meta">
                          <span className="status-dot"></span>
                          <strong>Pool {match.group}</strong>
                          <small>{match.field}</small>
                          <small>{match.time}</small>
                        </div>
                        <div className="match-teams">
                          <span className={match.scoreA > match.scoreB ? 'winner' : ''}>{match.teamA}</span>
                          <strong>{match.scoreA} - {match.scoreB}</strong>
                          <span className={match.scoreB > match.scoreA ? 'winner' : ''}>{match.teamB}</span>
                        </div>
                      </div>
                    ))}
                    <div className="table-card">
                      <div className="table-header">Per-pool standings</div>
                      {['A', 'B'].map((pool) => (
                        <div key={pool} className="pool-standing-block">
                          <div className="pool-standing-title">Pool {pool}</div>
                          {demoTournamentStandings.filter((team) => team.pool === pool).map((team, idx) => (
                            <div key={team.id} className="table-row">
                              <span>{idx + 1}. {team.team}</span>
                              <span>{team.record}</span>
                              <span>{team.pointDiff}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : tournamentTab === 'activity' ? (
                  <div className="activity-feed">
                    <div className="activity-feed-head">
                      <span>Activity feed</span>
                      <small>{demoTournamentActivity.length} latest games</small>
                    </div>
                    {demoTournamentActivity.map((item) => (
                      <div
                        key={item.id}
                        className={`activity-row ${item.highlight ? 'activity-row--champ' : ''}`}
                      >
                        <div className="activity-row-head">
                          <span className="activity-tag">
                            {item.highlight ? <span className="activity-trophy">🏆</span> : null}
                            {item.stage}
                          </span>
                          <span className="activity-label">{item.label}</span>
                          <span className="activity-time">{item.time}</span>
                        </div>
                        <div className="activity-teams">
                          <div className="activity-team activity-team--won">
                            <span className="activity-team-name">{item.winner}</span>
                            <strong className="activity-team-score">{item.winnerScore}</strong>
                          </div>
                          <div className="activity-team activity-team--lost">
                            <span className="activity-team-name">{item.loser}</span>
                            <strong className="activity-team-score">{item.loserScore}</strong>
                          </div>
                        </div>
                        {item.note ? <div className="activity-note">{item.note}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : tournamentTab === 'bracket' ? (
                  <div className="bracket-shell">
                    <div className="bracket-hint">Scroll &rarr; through the rounds</div>
                    <div className="bracket-canvas">
                      {demoBracketRounds.map((round, colIndex) => {
                        const slotHeight = 84 * Math.pow(2, colIndex)
                        return (
                          <div key={round.title} className="bracket-column">
                            <div className="bracket-round-header">{round.title}</div>
                            {round.matches.map((match) => (
                              <div
                                key={match.id}
                                className="bracket-slot"
                                style={{ height: `${slotHeight}px` }}
                              >
                                <div className="bracket-match">
                                  <small className="bracket-time">{match.time}</small>
                                  <div className={`bracket-team ${match.winner === match.teamA ? 'winner' : ''}`}>
                                    <span>{match.teamA}</span>
                                    <strong>{match.scoreA}</strong>
                                  </div>
                                  <div className="bracket-divider" />
                                  <div className={`bracket-team ${match.winner === match.teamB ? 'winner' : ''}`}>
                                    <span>{match.teamB}</span>
                                    <strong>{match.scoreB}</strong>
                                  </div>
                                </div>
                                {colIndex > 0 ? <span className="bracket-connector" /> : null}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      <div className="bracket-column">
                        <div className="bracket-round-header">Champion</div>
                        <div className="bracket-slot" style={{ height: `${84 * Math.pow(2, demoBracketRounds.length - 1)}px` }}>
                          <div className="bracket-match bracket-match--champion">
                            <strong>University of Iowa</strong>
                          </div>
                          <span className="bracket-connector" />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="teams-grid">
                    {demoTournamentTeams.map((team) => (
                      <div key={team.id} className="tournament-team-card">
                        <div className="team-avatar-mini">{team.name.slice(0, 2).toUpperCase()}</div>
                        <div>
                          <strong>{team.name}</strong>
                          <span>Seed {team.seed}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="demo-copy reveal" data-reveal>
              <p className="eyebrow">Tournament Operations</p>
              <h2>Run the whole event from one screen</h2>
              <p>
                Pools, brackets, standings, and team profiles all live in a single dashboard that
                stays in sync across every coach, player, and fan in attendance. Auto-seed the
                bracket the second pool play wraps and let RealUltimate handle the rest.
              </p>
              <p>
                The horizontal championship bracket reads exactly like the venue scoreboard,
                announcing winners and crowning a champion the moment the final point lands.
                Spectators get the same view in their pocket — no spreadsheets, no refresh button.
              </p>
              <div className="side-card">
                <div className="card-title">Director snapshot</div>
                <div className="stat-tape">
                  <div>
                    <span>Champion</span>
                    <strong>Iowa</strong>
                  </div>
                  <div>
                    <span>Teams</span>
                    <strong>8</strong>
                  </div>
                  <div>
                    <span>Games</span>
                    <strong>{demoTournamentMatches.length + demoBracketRounds.flatMap((r) => r.matches).length}</strong>
                  </div>
                </div>
                <div className="card-title">Championship path</div>
                <div className="bracket-preview">
                  {demoBracketRounds.flatMap((round, rIdx) => round.matches.map((m) => ({ ...m, roundTitle: round.title, roundIndex: rIdx }))).filter((m) => m.teamA === 'University of Iowa' || m.teamB === 'University of Iowa').map((match) => {
                    const iowaWon = match.winner === 'University of Iowa'
                    const iowaIsA = match.teamA === 'University of Iowa'
                    const iowaScore = iowaIsA ? match.scoreA : match.scoreB
                    const oppScore = iowaIsA ? match.scoreB : match.scoreA
                    const opponent = iowaIsA ? match.teamB : match.teamA
                    return (
                      <div key={match.id} className={`bracket-matchup ${iowaWon ? 'bracket-matchup--won' : 'bracket-matchup--lost'}`}>
                        <div className="bracket-matchup-head">
                          <span className="bracket-matchup-round">{match.roundTitle}</span>
                          <span className="bracket-matchup-time">{match.time}</span>
                        </div>
                        <div className="bracket-matchup-row">
                          <span className="bracket-matchup-team">University of Iowa</span>
                          <strong className="bracket-matchup-score">{iowaScore}</strong>
                        </div>
                        <div className="bracket-matchup-row bracket-matchup-row--opp">
                          <span className="bracket-matchup-team">{opponent}</span>
                          <strong className="bracket-matchup-score">{oppScore}</strong>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="vision" className="section vision-section">
          <div className="section-head reveal" data-reveal>
            <p className="eyebrow">The Roadmap</p>
            <h2>Where RealUltimate is headed next.</h2>
            <p className="section-lead">
              We&apos;re only getting started. The next wave of RealUltimate turns the app into the
              global home of Ultimate &mdash; live everywhere, intelligent everywhere, and made for
              every player, coach, and fan.
            </p>
          </div>

          <div className="vision-grid">
            <article className="vision-card vision-card--feed reveal" data-reveal>
              <div className="vision-card-glow" aria-hidden="true"></div>
              <div className="vision-card-head">
                <span className="vision-num">01</span>
                <span className="vision-pill">In Development</span>
              </div>
              <div className="vision-mock vision-mock--feed" aria-hidden="true">
                <div className="vm-feed-row">
                  <span className="vm-dot"></span>
                  <span className="vm-feed-tag">LIVE</span>
                  <span className="vm-feed-text">Hawkeyes 14 - Volt 13 · Universe Point</span>
                </div>
                <div className="vm-feed-row vm-feed-row--news">
                  <span className="vm-feed-tag vm-feed-tag--news">NEWS</span>
                  <span className="vm-feed-text">Iowa State upsets #1 seed at Midwest Open</span>
                </div>
                <div className="vm-feed-row">
                  <span className="vm-dot"></span>
                  <span className="vm-feed-tag">LIVE</span>
                  <span className="vm-feed-text">Aurora 11 - Drift 10 · 2nd half</span>
                </div>
                <div className="vm-feed-row vm-feed-row--news">
                  <span className="vm-feed-tag vm-feed-tag--alert">ALERT</span>
                  <span className="vm-feed-text">Tournament Standings · Pool A locked</span>
                </div>
              </div>
              <h3>The Global Live Feed</h3>
              <p>
                A real-time pulse of Ultimate worldwide. Live tickers from every tournament,
                breaking news, community highlights, and instant standings &mdash; all in one feed
                you can&apos;t look away from.
              </p>
            </article>

            <article className="vision-card vision-card--player reveal" data-reveal>
              <div className="vision-card-glow" aria-hidden="true"></div>
              <div className="vision-card-head">
                <span className="vision-num">02</span>
                <span className="vision-pill">Coming Soon</span>
              </div>
              <div className="vision-mock vision-mock--player" aria-hidden="true">
                <div className="vm-player-card">
                  <div className="vm-player-rating">94</div>
                  <div className="vm-player-info">
                    <span className="vm-player-name">Quinn Rivera</span>
                    <span className="vm-player-role">Handler · #7 · IOWA</span>
                    <div className="vm-player-stats">
                      <span><strong>91%</strong> Comp.</span>
                      <span><strong>+22</strong> Plus/Minus</span>
                      <span><strong>4.1</strong> Assists/G</span>
                    </div>
                  </div>
                </div>
                <div className="vm-player-actions">
                  <span className="vm-follow-pill">+ Follow</span>
                  <span className="vm-meta-pill">Season 2026</span>
                </div>
              </div>
              <h3>Player Profiles &amp; Tracking</h3>
              <p>
                Treat players like pros. Follow your favorites, watch their season unfold across
                advanced stat cards, possession heatmaps, and growth curves &mdash; with deeper
                customization for every team and individual page.
              </p>
            </article>

            <article className="vision-card vision-card--lab reveal" data-reveal>
              <div className="vision-card-glow" aria-hidden="true"></div>
              <div className="vision-card-head">
                <span className="vision-num">03</span>
                <span className="vision-pill">In Development</span>
              </div>
              <div className="vision-mock vision-mock--lab" aria-hidden="true">
                <div className="vm-board">
                  <span className="vm-mark vm-mark--o vm-mark--p1">O</span>
                  <span className="vm-mark vm-mark--o vm-mark--p2">O</span>
                  <span className="vm-mark vm-mark--o vm-mark--p3">O</span>
                  <span className="vm-mark vm-mark--x vm-mark--d1">X</span>
                  <span className="vm-mark vm-mark--x vm-mark--d2">X</span>
                  <svg className="vm-arrows" viewBox="0 0 200 120" aria-hidden="true">
                    <defs>
                      <marker id="vm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
                      </marker>
                    </defs>
                    <path d="M40,90 Q90,40 150,30" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#vm-arrow)" />
                    <path d="M150,30 Q120,55 80,60" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" markerEnd="url(#vm-arrow)" opacity="0.55" />
                  </svg>
                </div>
                <div className="vm-lab-tag">Drill: Vert-Stack Reset · auto-generated</div>
              </div>
              <h3>The Coaching Lab</h3>
              <p>
                Don&apos;t just track games &mdash; build better teams. RealUltimate analyzes your
                tendencies and weaknesses to generate custom drills, scrimmage scripts, and
                practice plans tailored to your roster, with deeper analytics for coaches.
              </p>
            </article>

            <article className="vision-card vision-card--cast reveal" data-reveal>
              <div className="vision-card-glow" aria-hidden="true"></div>
              <div className="vision-card-head">
                <span className="vision-num">04</span>
                <span className="vision-pill">Coming Soon</span>
              </div>
              <div className="vision-mock vision-mock--cast" aria-hidden="true">
                <div className="vm-cast-frame">
                  <div className="vm-cast-overlay">
                    <span className="vm-cast-live">
                      <span className="vm-dot"></span>LIVE
                    </span>
                    <span className="vm-cast-meta">Iowa vs Volt · 2.4k watching</span>
                  </div>
                  <div className="vm-cast-cams">
                    <span className="vm-cam vm-cam--active">CAM 1</span>
                    <span className="vm-cam">CAM 2</span>
                    <span className="vm-cam">SIDELINE</span>
                  </div>
                </div>
                <div className="vm-cast-chat">
                  <div className="vm-chat-row"><strong>@hawkeyemom</strong> Let&apos;s go Quinn!</div>
                  <div className="vm-chat-row"><strong>@frisbro</strong> Best layout of the day</div>
                  <div className="vm-chat-row vm-chat-row--mod"><strong>+24</strong> more</div>
                </div>
              </div>
              <h3>Next-Gen Spectating</h3>
              <p>
                Live, interactive streams with multiple camera angles, real-time fan chat, in-app
                reactions, and a social layer built for the Ultimate community &mdash; so every
                match feels like a championship broadcast.
              </p>
            </article>
          </div>

          <p className="vision-footnote reveal" data-reveal>
            And much more on the way: deeper roster &amp; player-page customization, richer social
            features, advanced coach dashboards, and refinements driven by the community. Have a
            wish? <a href="#download">Download the app</a> and tell us what to build next.
          </p>
        </section>

        <section id="download" className="section download">
          <div className="download-card" data-reveal>
            <div className="download-copy">
              <div className="download-brand">
                <img src={brandIconUrl} alt="" className="download-brand-icon" />
                <span>RealUltimate</span>
              </div>
              <p className="eyebrow">Download RealUltimate</p>
              <h2>Ready to run your season on RealUltimate?</h2>
              <p>
                Put the most advanced Ultimate platform in every coach and organizer&apos;s hands.
                Download the APK and experience the speed.
              </p>
            </div>
            <div className="download-actions">
              <a className="btn btn-primary" href={DOWNLOAD_APK_URL} download rel="noopener noreferrer">
                Download the APK
              </a>
              <a className="btn btn-secondary" href="#hero">
                Back to top
              </a>
            </div>
            <div className={`download-hint download-hint--${devicePlatform}`}>
              {devicePlatform === 'android' ? (
                <>
                  <strong>Android detected.</strong> You&apos;re good to go &mdash; tap Download and accept the install prompt. You may need to allow installs from your browser in <em>Settings &rarr; Apps &rarr; Special access</em>.
                </>
              ) : devicePlatform === 'ios' ? (
                <>
                  <strong>iOS isn&apos;t supported yet.</strong> RealUltimate is currently Android-only &mdash; reopen this page on an Android phone to install the APK. iOS support is on the roadmap.
                </>
              ) : (
                <>
                  <strong>Open this page on Android.</strong> The APK installs directly to Android devices. Visit this page from your Android phone&apos;s browser, or scan the QR code to install with one tap.
                </>
              )}
            </div>
          </div>

          <div className="download-qr-card" data-reveal>
            <div className="download-qr-copy">
              <span className="eyebrow">Scan to install</span>
              <h3>One tap from the sideline.</h3>
              <p>
                Point any Android camera at this code to download the APK. Print it on a
                flyer for tournaments, tape it to a clipboard, or share it on socials.
              </p>
              <button type="button" className="btn btn-secondary download-print-btn" onClick={handlePrintQrPoster}>
                Print QR poster
              </button>
            </div>
            <div className="download-qr-frame">
              <div className="download-qr-frame-inner">
                <QRCodeSVG
                  value={DOWNLOAD_APK_URL}
                  size={220}
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#0f172a"
                  imageSettings={{
                    src: brandIconUrl,
                    height: 44,
                    width: 44,
                    excavate: true
                  }}
                />
              </div>
              <small className="download-qr-url">{DOWNLOAD_APK_URL}</small>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span className="footer-brand">
          <img src={brandIconUrl} alt="" className="footer-icon" />
          RealUltimate
        </span>
        <span>Precision scoring. Instant fan engagement.</span>
      </footer>
    </div>
  )
}

export default App