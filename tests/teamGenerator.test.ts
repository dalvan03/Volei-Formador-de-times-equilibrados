import test from 'node:test';
import assert from 'node:assert/strict';
import { generateBalancedTeams } from '../src/utils/teamGenerator';
import type { Player } from '../src/types';

const player = (id: string, sex: 'M' | 'F', rating: number): Player => ({
  id, name: id, phone: '', avatarBg: '', sex, rating,
  wins: 0, losses: 0, matchesPlayed: 0,
});

test('notas equivalentes priorizam times com M/F equilibrados', () => {
  const players = [
    player('m5', 'M', 5), player('m3', 'M', 3), player('m1', 'M', 1), player('f2', 'F', 2),
    player('f5', 'F', 5), player('f3', 'F', 3), player('f1', 'F', 1), player('m2', 'M', 2),
  ];
  const { teamA, teamB, scoreDiff } = generateBalancedTeams(players);
  assert(scoreDiff <= 0.1);
  for (const team of [teamA, teamB]) {
    const members = players.filter(p => team.playerIds.includes(p.id));
    assert.equal(members.filter(p => p.sex === 'M').length, 2);
    assert.equal(members.filter(p => p.sex === 'F').length, 2);
  }
});

test('não sacrifica mais de 0,1 de nota para equilibrar M/F', () => {
  const players = [player('m5', 'M', 5), player('m4', 'M', 4), player('m1', 'M', 1), player('f2', 'F', 2)];
  const { teamA, teamB, scoreDiff } = generateBalancedTeams(players);
  assert.equal(scoreDiff, 0);
  assert.deepEqual([teamA, teamB].map(team => players.filter(p => team.playerIds.includes(p.id) && p.sex === 'M').length).sort(), [1, 2]);
});

test('aceita até 0,1 de diferença para melhorar a distribuição de M/F', () => {
  const players = [player('m5', 'M', 5), player('m1', 'M', 1), player('f49', 'F', 4.9), player('f11', 'F', 1.1)];
  const { teamA, teamB, scoreDiff } = generateBalancedTeams(players);
  assert(scoreDiff <= 0.1 + 1e-9);
  assert(scoreDiff > 0);
  for (const team of [teamA, teamB]) {
    const members = players.filter(p => team.playerIds.includes(p.id));
    assert.equal(members.filter(p => p.sex === 'M').length, 1);
    assert.equal(members.filter(p => p.sex === 'F').length, 1);
  }
});
