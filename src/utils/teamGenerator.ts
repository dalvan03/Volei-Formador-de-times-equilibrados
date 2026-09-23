import { Player, Team, Match } from '../types';

interface GenerationOptions {
  teamAName?: string;
  teamBName?: string;
  teamAColor?: string;
  teamBColor?: string;
}

export function generateBalancedTeams(
  presentPlayers: Player[],
  pastMatches: Match[] = [],
  options: GenerationOptions = {}
): { teamA: Team; teamB: Team; scoreDiff: number; ratingA: number; ratingB: number } {
  if (presentPlayers.length < 2) {
    throw new Error('É necessário pelo menos 2 jogadores presentes para formar os times.');
  }

  const teamAColor = options.teamAColor || 'bg-blue-500';
  const teamBColor = options.teamBColor || 'bg-amber-500';

  // If number of players is odd, remove the weakest player before balancing
  let weakestPlayer: Player | null = null;
  let playersToBalance = presentPlayers;

  if (presentPlayers.length % 2 !== 0) {
    const sortedByRating = [...presentPlayers].sort((a, b) => {
      const rA = a.rating ?? 3.0;
      const rB = b.rating ?? 3.0;
      if (rA !== rB) return rA - rB;
      return (a.matchesPlayed || 0) - (b.matchesPlayed || 0);
    });
    weakestPlayer = sortedByRating[0];
    playersToBalance = presentPlayers.filter((p) => p.id !== weakestPlayer!.id);
  }

  // Build co-occurrence matrix from past matches to favor team variety
  const coOccurrenceMap = new Map<string, number>();
  pastMatches.forEach((match) => {
    [match.teamA.playerIds, match.teamB.playerIds].forEach((ids) => {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join('_');
          coOccurrenceMap.set(key, (coOccurrenceMap.get(key) || 0) + 1);
        }
      }
    });
  });

  const countTeamA = Math.ceil(playersToBalance.length / 2);
  const rating = (player: Player) => player.rating ?? 3.0;
  const average = (team: Player[]) => team.reduce((sum, player) => sum + rating(player), 0) / team.length;

  type Candidate = {
    teamAPlayers: Player[];
    teamBPlayers: Player[];
    ratingA: number;
    ratingB: number;
    skillDiff: number;
    sexDiff: number;
    otherPenalty: number;
  };
  let bestCombination: Candidate | null = null;
  const compareCandidates = (a: Candidate, b: Candidate) => {
    const aClose = a.skillDiff <= 0.1 + 1e-9;
    const bClose = b.skillDiff <= 0.1 + 1e-9;
    if (aClose !== bClose) return aClose ? -1 : 1;
    // Once the rating averages are close enough, balance M/F before fine-tuning the rating.
    if (aClose && a.sexDiff !== b.sexDiff) return a.sexDiff - b.sexDiff;
    if (Math.abs(a.skillDiff - b.skillDiff) > 1e-9) return a.skillDiff - b.skillDiff;
    if (a.sexDiff !== b.sexDiff) return a.sexDiff - b.sexDiff;
    return a.otherPenalty - b.otherPenalty;
  };
  const evaluate = (first: Player[], second: Player[]) => {
    const teamAPlayers = [...first];
    const teamBPlayers = [...second];
    const ratingA = average(teamAPlayers);
    const ratingB = average(teamBPlayers);
    const countSex = (team: Player[], sex: 'M' | 'F') => team.filter(player => player.sex === sex).length;
    const sexDiff = Math.abs(countSex(teamAPlayers, 'M') - countSex(teamBPlayers, 'M'))
      + Math.abs(countSex(teamAPlayers, 'F') - countSex(teamBPlayers, 'F'));
    const settersA = teamAPlayers.filter(player => player.position === 'Levantador').length;
    const settersB = teamBPlayers.filter(player => player.position === 'Levantador').length;
    const setterPenalty = playersToBalance.filter(player => player.position === 'Levantador').length >= 2
      && (!settersA || !settersB) ? 4 : 0;
    const repeats = (team: Player[]) => {
      let total = 0;
      for (let i = 0; i < team.length; i++) {
        for (let j = i + 1; j < team.length; j++) {
          total += coOccurrenceMap.get([team[i].id, team[j].id].sort().join('_')) || 0;
        }
      }
      return total;
    };
    const candidate: Candidate = {
      teamAPlayers, teamBPlayers, ratingA, ratingB,
      skillDiff: Math.abs(ratingA - ratingB), sexDiff,
      otherPenalty: setterPenalty * 6 + (repeats(teamAPlayers) + repeats(teamBPlayers)) * 1.5,
    };
    if (!bestCombination || compareCandidates(candidate, bestCombination) < 0) bestCombination = candidate;
  };
  const consider = (first: Player[], second: Player[]) => {
    if (weakestPlayer) {
      evaluate([...first, weakestPlayer], second);
      evaluate(first, [...second, weakestPlayer]);
    } else {
      evaluate(first, second);
    }
  };

  // Exhaustive for normal roster sizes; random sampling keeps large rosters responsive.
  if (playersToBalance.length <= 18) {
    const choose = (start: number, selected: Player[]) => {
      if (selected.length === countTeamA) {
        const selectedIds = new Set(selected.map(player => player.id));
        consider(selected, playersToBalance.filter(player => !selectedIds.has(player.id)));
        return;
      }
      for (let i = start; i <= playersToBalance.length - (countTeamA - selected.length); i++) {
        choose(i + 1, [...selected, playersToBalance[i]]);
      }
    };
    choose(0, []);
  } else {
    for (let i = 0; i < 2000; i++) {
      const shuffled = [...playersToBalance];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
      }
      consider(shuffled.slice(0, countTeamA), shuffled.slice(countTeamA));
    }
  }

  if (!bestCombination) throw new Error('Não foi possível formar os times.');
  const finalTeamAPlayers = bestCombination.teamAPlayers;
  const finalTeamBPlayers = bestCombination.teamBPlayers;

  const randomPlayerA = finalTeamAPlayers.length
    ? finalTeamAPlayers[Math.floor(Math.random() * finalTeamAPlayers.length)]
    : null;
  const randomPlayerB = finalTeamBPlayers.length
    ? finalTeamBPlayers[Math.floor(Math.random() * finalTeamBPlayers.length)]
    : null;

  const getTeamName = (customName?: string, randomPlayer?: Player | null, fallback = 'Time A') => {
    if (customName) return customName;
    if (randomPlayer) {
      const firstName = randomPlayer.name.trim().split(' ')[0];
      return `Time ${firstName}`;
    }
    return fallback;
  };

  const teamAName = getTeamName(options.teamAName, randomPlayerA, 'Time A');
  const teamBName = getTeamName(options.teamBName, randomPlayerB, 'Time B');

  const teamA: Team = {
    id: 'teamA',
    name: teamAName,
    color: teamAColor,
    playerIds: finalTeamAPlayers.map((p) => p.id),
  };

  const teamB: Team = {
    id: 'teamB',
    name: teamBName,
    color: teamBColor,
    playerIds: finalTeamBPlayers.map((p) => p.id),
  };

  const scoreDiff = bestCombination.skillDiff;

  return {
    teamA,
    teamB,
    scoreDiff,
    ratingA: Number(bestCombination.ratingA.toFixed(1)),
    ratingB: Number(bestCombination.ratingB.toFixed(1)),
  };
}
