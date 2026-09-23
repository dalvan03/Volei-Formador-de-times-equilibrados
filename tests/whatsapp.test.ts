import test from 'node:test';
import assert from 'node:assert/strict';
import { matchNotice, sendNotice, whatsappConfig, whatsappPhone } from '../src/server/whatsapp';
import type { Match, Player } from '../src/types';

const start = Date.parse('2026-09-15T18:00:00Z');
const hour = 3600000;
const players = ['a','b','c'].map((id, i) => ({ id, name: id, phone: `1191111111${i}`, isGuest: i === 2 })) as Player[];
const match: Match = { id:'match&1',date:'2026-09-15',status:'finalizada',createdAt:new Date(start).toISOString(),
  finalizedAt:new Date(start).toISOString(),teamA:{id:'teamA',name:'A',color:'blue',playerIds:['a']},
  teamB:{id:'teamB',name:'B',color:'red',playerIds:['b','c']},presentPlayerIds:['a','b','c'],
  mvpResult:{totalVotes:2,counts:{a:1,b:1},voterIds:['a','b']} };
const notice = (now: number, m = match, completed: string[] = []) => matchNotice(m,players,completed,now,start,'https://volei.example', now >= start+95*hour && now < start+96*hour ? ['mvp'] : []);

test('WhatsApp desligado por padrão e exige configuração completa ao ativar', () => {
  assert.equal(whatsappConfig({}),null);
  assert.throws(() => whatsappConfig({WHATSAPP_ENABLED:'true'}));
  assert.equal(whatsappPhone('(11) 91111-1110'),'5511911111110');
  assert.equal(whatsappPhone('+55 11 91111-1110'),'5511911111110');
  assert.equal(whatsappPhone('123'),null);
});
test('95h exatas: somente não votantes cadastrados; link da rodada e sem notas', () => {
  assert.equal(matchNotice(match,players,[],start+95*hour-1,start,'https://volei.example',['mvp']),null);
  const result=notice(start+95*hour,match,[players[0].phone])!;
  assert.deepEqual(result.mentioned,['5511911111111@s.whatsapp.net']);
  assert.match(result.text,/https:\/\/volei\.example/);
  assert.equal(result.kind,'reminder');
  assert.equal(notice(start+95*hour,match,players.map(p=>p.phone))!.text,'');
  assert.equal(matchNotice(match,players,[],start+95*hour,start+1,'https://example.com'),null);
});
test('24h e virada: resultado MVP, empate compartilhado; sem votos não anuncia', () => {
  assert.equal(notice(start+24*hour-1)!.kind,'mvp_reminder');
  assert.match(notice(start+96*hour)!.text,/1º a: 1 voto\(s\) \(50,0%\)/);
  assert.match(notice(start+96*hour)!.text,/2º b: 1 voto\(s\) \(50,0%\)/);
  assert.match(notice(start+96*hour)!.text,/Total de votos: 2/);
  assert.equal(notice(start+24*hour,{...match,votingClosesAt:new Date(start+24*hour).toISOString()})!.kind,'mvp');
  assert.equal(notice(start+96*hour,{...match,mvpResult:{totalVotes:0,counts:{},voterIds:[]}})!.text,'');
  assert.equal(notice(start+96*hour,{...match,status:'encerrada'}),null);
});
test('cliente Evolution envia só texto/menções ao grupo, sem ler conversas', async () => {
  const config=whatsappConfig({WHATSAPP_ENABLED:'true',EVOLUTION_URL:'http://evolution-api:8080',APP_PUBLIC_URL:'https://volei.example',
    EVOLUTION_API_KEY:'test-secret',EVOLUTION_INSTANCE:'volei',WHATSAPP_GROUP_JID:'123@g.us',WHATSAPP_START_AT:new Date(start).toISOString()})!;
  let calls=0;
  const mock: typeof fetch=async (url, init) => {
    calls++;
    if (url.includes('/group/participants/')) return new Response(JSON.stringify({participants:[{id:'123@lid',phoneNumber:'5511911111110@s.whatsapp.net'},{id:'456@lid',phoneNumber:'5511911111111@s.whatsapp.net'}]}),{status:200});
    assert.equal(url,'http://evolution-api:8080/message/sendText/volei');
    assert.equal(init?.method,'POST');
    const body=JSON.parse(init!.body as string);
    assert.equal(body.number,'123@g.us');
    assert.equal('mentionsEveryOne' in body,false);
    assert.deepEqual(body.mentioned,['123@lid','456@lid']);
    return new Response(JSON.stringify({key:{id:'outbound-id'}}),{status:201});
  };
  assert.equal(await sendNotice(config,notice(start+95*hour)!,mock),'outbound-id');
  assert.equal(calls,2);
  await assert.rejects(sendNotice(config,notice(start+95*hour)!,async()=>new Response('{}',{status:500})),/HTTP_500/);
  await assert.rejects(sendNotice(config,notice(start+95*hour)!,async()=>new Response('{}')),/NO_MESSAGE_ID/);
});

test('lembrete MVP somente na última hora e uma vez; notas seguem após resultado', () => {
  assert.equal(notice(start+23*hour-1),null);
  assert.equal(notice(start+23*hour)!.kind,'mvp_reminder');
  assert.match(notice(start+23*hour,{...match,mvpResult:{totalVotes:0,counts:{},voterIds:[]}})!.text,/Falta 1h/);
  assert.equal(matchNotice(match,players,[],start+23*hour,start,'https://example.com',['mvp_reminder']),null);
  assert.equal(notice(start+24*hour)!.kind,'mvp');
  assert.equal(matchNotice(match,players,[],start+95*hour,start,'https://example.com',['mvp']).kind,'reminder');
  assert.equal(matchNotice(match,players,[],start+96*hour,start,'https://example.com',['mvp']),null);
  const shortened = {...match,date:'2026-09-30',finalizedAt:'2026-10-01T01:00:00Z'};
  assert.equal(notice(Date.parse('2026-10-01T02:00:00Z'),shortened)!.kind,'mvp_reminder');
  assert.equal(notice(Date.parse('2026-10-01T03:00:00Z'),shortened)!.kind,'mvp');
});

test('MVP marca apenas participantes sem voto MVP, independentemente das notas gerais', () => {
  const m = {...match,mvpResult:{totalVotes:1,counts:{},voterIds:['a']}};
  const extraPlayers = [...players, {...players[0],id:'outside',phone:'11999999999'}];
  const result = matchNotice(m,extraPlayers,[players[1].phone],start+23*hour,start,'https://volei.example')!;
  assert.deepEqual(result.mentioned,['5511911111111@s.whatsapp.net']);
  assert.match(result.text,/@5511911111111/);
  assert.doesNotMatch(result.text,/@5511911111110|@5511911111112|@5511999999999/);
  assert.equal(notice(start+23*hour)!.text,'');
  assert.deepEqual(notice(start+23*hour)!.mentioned,[]);
});
test('notas gerais marcam pendentes mesmo que já tenham votado no MVP; sem repetição', () => {
  const result = notice(start+95*hour,match,['+55 (11) 91111-1110'])!;
  assert.deepEqual(result.mentioned,['5511911111111@s.whatsapp.net']);
  assert.match(result.text,/Falta 1h/);
  assert.match(result.text,/@5511911111111/);
  assert.equal(matchNotice(match,players,[],start+95*hour,start,'https://volei.example',['mvp','reminder']),null);
  const short = {...match,votingClosesAt:new Date(start+10*hour).toISOString()};
  assert.equal(matchNotice(short,players,[],start+9*hour,start,'https://volei.example',['mvp_reminder'])!.kind,'reminder');
});
