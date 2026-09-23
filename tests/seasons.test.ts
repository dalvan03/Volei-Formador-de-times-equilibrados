import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, seasonForDate, seasonBounds, nextSeason, rankedPlayers, weightedRating, votingOpen, votingDeadline, mvpVotingOpen, mvpVotingDeadline } from '../src/utils/seasons';
import { hashPin, verifyPin, validPin } from '../src/server/auth';
import type { Match, Player } from '../src/types';

test('trimestres seguem São Paulo, inclusive meia-noite e virada de ano', () => {
  assert.equal(seasonForDate(localDate(new Date('2026-10-01T02:59:59Z'))), '2026-Q3');
  assert.equal(seasonForDate(localDate(new Date('2026-10-01T03:00:00Z'))), '2026-Q4');
  assert.equal(nextSeason('2026-Q4'), '2027-Q1');
  assert.equal(seasonBounds('2026-Q3').endDate, '2026-10-01');
  assert.equal(seasonForDate('2026-03-31'), '2026-Q1');
  assert.equal(seasonForDate('2026-04-01'), '2026-Q2');
});
test('média mantém precisão e aceita peso fracionário e ausência de votos', () => {
  assert.equal(weightedRating(4, 10, [5,5]).mean, 50/12);
  assert.deepEqual(weightedRating(4, 1.5, []), {mean:4,weight:1.5,votes:0});
  assert.equal(weightedRating(3,0,[5]).mean,5);
  assert.equal(weightedRating(3,0,[]).mean,3);
});
test('pódio considera desempates, empate compartilhado e exclui convidados e quem não jogou', () => {
  const p = (id: string, overrides = {}): Player => ({id,name:id,phone:'',avatarBg:'',wins:2,losses:1,draws:0,matchesPlayed:3,setBalance:3,...overrides});
  const ranking = rankedPlayers([p('a'),p('b'),p('c',{setBalance:2}),p('guest',{isGuest:true,wins:99}),p('idle',{matchesPlayed:0})]);
  assert.deepEqual(ranking.map(p => [p.id,p.rank]),[['a',1],['b',1],['c',3]]);
  assert.deepEqual(rankedPlayers([p('a',{losses:2}),p('b'),p('c',{wins:3})]).map(p=>p.id),['c','b','a']);
  assert.deepEqual(rankedPlayers([]),[]);
});
test('votação expira exatamente em 96 horas ou na virada, o que ocorrer primeiro', () => {
  const m = {status:'finalizada',date:'2026-09-10',finalizedAt:'2026-09-10T20:00:00Z'} as Match;
  assert(votingOpen(m,Date.parse('2026-09-14T19:59:59.999Z')));
  assert(!votingOpen(m,Date.parse('2026-09-14T20:00:00Z')));
  const last = {...m,date:'2026-09-30',finalizedAt:'2026-09-30T23:00:00Z'};
  assert.equal(votingDeadline(last),Date.parse('2026-10-01T03:00:00Z'));
  assert(!votingOpen(last,Date.parse('2026-10-01T03:00:00Z')));
  assert(!votingOpen({...m,status:'encerrada'},Date.parse(m.finalizedAt!)));
});
test('PIN preserva zeros à esquerda, usa salt e não aceita formatos alternativos', async () => {
  assert(validPin('0012')); assert(!validPin(12)); assert(!validPin('12345')); assert(!validPin('12a4'));
  const hash = await hashPin('0012');
  assert.notEqual(hash,'0012'); assert.notEqual(hash, await hashPin('0012'));
  assert(await verifyPin('0012',hash)); assert(!await verifyPin('0013',hash));
});

test('MVP encerra em 24h enquanto notas permanecem abertas por 96h', () => {
  const m = {status:'finalizada',date:'2026-09-10',finalizedAt:'2026-09-10T20:00:00Z',votingClosesAt:'2026-09-14T20:00:00Z'} as Match;
  const end = Date.parse('2026-09-11T20:00:00Z');
  assert.equal(mvpVotingDeadline(m),end);
  assert(mvpVotingOpen(m,end-1));
  assert(!mvpVotingOpen(m,end));
  assert(votingOpen(m,end));
  assert(!votingOpen(m,end+72*3600000));
  assert.equal(mvpVotingDeadline({...m,votingClosesAt:'2026-09-11T00:00:00Z'}),Date.parse('2026-09-11T00:00:00Z'));
});
