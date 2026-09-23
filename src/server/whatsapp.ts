import { client } from '../db/index';
import { readState, seasonTransaction } from '../db/seasonService';
import { votingDeadline, mvpVotingDeadline } from '../utils/seasons';
import type { Match, Player } from '../types';

export function whatsappConfig(env = process.env) {
  if (env.WHATSAPP_ENABLED !== 'true') return null;
  const baseUrl = new URL(env.EVOLUTION_URL || '');
  const appUrl = new URL(env.APP_PUBLIC_URL || '');
  const since = Date.parse(env.WHATSAPP_START_AT || '');
  if (!['http:', 'https:'].includes(baseUrl.protocol) || appUrl.protocol !== 'https:' ||
    baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash ||
    !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE ||
    !/^\d+(?:-\d+)?@g\.us$/.test(env.WHATSAPP_GROUP_JID || '') || !Number.isFinite(since)) {
    throw new Error('Configuração WhatsApp inválida; consulte docs/WHATSAPP.md');
  }
  return {
    baseUrl: baseUrl.href.replace(/\/$/, ''), appUrl: appUrl.origin,
    apiKey: env.EVOLUTION_API_KEY, instance: env.EVOLUTION_INSTANCE,
    group: env.WHATSAPP_GROUP_JID!, since
  };
}
export function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return /^55\d{10,11}$/.test(digits) ? digits : null;
}
type Notice = { kind: 'reminder' | 'mvp' | 'mvp_reminder'; text: string; mentioned: string[] };
// An empty text is still recorded as skipped, so an empty election never sends later.
export function matchNotice(match: Match, players: Player[], completedPhones: string[], now: number, since: number, appUrl: string, deliveredKinds: string[] = []): Notice | null {
  const finalized = Date.parse(match.finalizedAt || '');
  if (match.status !== 'finalizada' || !Number.isFinite(finalized) || finalized < since) return null;
  const deadline = votingDeadline(match);
  const title = (match.title || `Rodada de ${match.date}`).replace(/[\r\n]/g, ' ').slice(0, 120);
  const link = appUrl;
  const mvpDeadline = mvpVotingDeadline(match);
  if (now >= mvpDeadline && !deliveredKinds.includes('mvp')) {
    const counts = match.mvpResult?.counts || {};
    const total = match.mvpResult?.totalVotes || 0;
    const ranking = players.map(p => ({ player: p, votes: counts[p.id] || 0 }))
      .filter(item => item.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.player.name.localeCompare(b.player.name))
      .slice(0, 3);
    const lines = ranking.map((item, index) => {
      const percentage = total ? ((item.votes / total) * 100).toFixed(1).replace('.', ',') : '0,0';
      return `${index + 1}º ${item.player.name}: ${item.votes} voto(s) (${percentage}%)`;
    });
    return {
      kind: 'mvp', mentioned: [], text: ranking.length ?
        `🏆 Votação de MVP encerrada!\n${title}\n\n${lines.join('\n')}\n\nTotal de votos: ${total}\n\n${appUrl}` : ''
    };
  }
  const ids = new Set([...match.teamA.playerIds, ...match.teamB.playerIds]);
  const pendingPhones = (completed: Set<string | null>) => [...new Set(players
    .filter(p => ids.has(p.id) && !p.isGuest)
    .map(p => whatsappPhone(p.phone)).filter((p): p is string => !!p && !completed.has(p)))];
  if (now >= mvpDeadline - 3600000 && now < mvpDeadline && !deliveredKinds.includes('mvp_reminder')) {
    const voters = new Set(match.mvpResult?.voterIds || []);
    const completed = new Set(players.filter(p => voters.has(p.id)).map(p => whatsappPhone(p.phone)));
    const phones = pendingPhones(completed);
    return { kind: 'mvp_reminder', mentioned: phones.map(p => `${p}@s.whatsapp.net`),
      text: phones.length ? `⏰ Falta 1h para encerrar a votação de Craque da Partida (MVP)!\n${title}\n\n${phones.map(p => `@${p}`).join(' ')}\n\nAinda não votou? Escolha o MVP da rodada! 🌟\n${link}\n\nAs notas gerais continuam abertas por até 96h após a finalização, respeitando a virada da temporada.` : '' };
  }
  if (now < deadline - 3600000 || now >= deadline || deliveredKinds.includes('reminder')) return null;
  const phones = pendingPhones(new Set(completedPhones.map(whatsappPhone)));
  const end = new Date(deadline).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return {
    kind: 'reminder', mentioned: phones.map(p => `${p}@s.whatsapp.net`), text: phones.length ?
      `⏰ Falta 1h para encerrar a votação de notas gerais!\n${title}\n\n${phones.map(p => `@${p}`).join(' ')}\n\nVote aqui:\n${link}\n\nVote até ${end}.` : ''
  };

}

export async function sendNotice(config: NonNullable<ReturnType<typeof whatsappConfig>>, notice: Notice, fetcher = fetch) {
  let mentioned = notice.mentioned;
  if (mentioned.length) {
    try {
      const membersResponse = await fetcher(`${config.baseUrl}/group/participants/${encodeURIComponent(config.instance)}?groupJid=${encodeURIComponent(config.group)}`, {
        headers: { apikey: config.apiKey }, signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (membersResponse.ok) {
        const data = await membersResponse.json() as { participants?: Array<{ id?: string; phoneNumber?: string }> };
        const variants = (value: string) => {
          const digits = value.replace(/\D/g, '');
          const national = digits.startsWith('55') ? digits.slice(2) : digits;
          if (national.length < 10) return [digits];
          const ddd = national.slice(0, 2), number = national.slice(2);
          const forms = [number];
          if (number.startsWith('9') && number.length === 9) forms.push(number.slice(1));
          if (!number.startsWith('9') && number.length === 8) forms.push('9' + number);
          return forms.map(form => '55' + ddd + form);
        };
        const byPhone = new Map<string, string>();
        for (const participant of data.participants || []) {
          if (participant.id && participant.phoneNumber) for (const form of variants(participant.phoneNumber)) byPhone.set(form, participant.id);
        }
        mentioned = mentioned.map(jid => variants(jid).map(form => byPhone.get(form)).find(Boolean) || jid);
      }
    } catch { /* Keep the phone JID as a fallback if metadata is temporarily unavailable. */ }
  }
  const response = await fetcher(`${config.baseUrl}/message/sendText/${encodeURIComponent(config.instance)}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
    // Omit mentionsEveryOne entirely: some 2.3.7 installations interpret even false as true.
    body: JSON.stringify({ number: config.group, text: notice.text, ...(mentioned.length ? { mentioned } : {}), linkPreview: false }),
  });
  // Never log provider response bodies (they may contain personal data).
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const body = await response.json() as { key?: { id?: string } };
  if (!body.key?.id) throw new Error('NO_MESSAGE_ID');
  return body.key.id;
}

let running = false;
export async function whatsappTick() {
  if (running) return;
  const config = whatsappConfig();
  if (!config) return;
  running = true;
  try {
    const job = await seasonTransaction(async (sql, seasonId, now) => {
      await sql`UPDATE whatsapp_deliveries SET status='uncertain' WHERE status='sending' AND updated_at < clock_timestamp()-interval '2 minutes'`;
      const { matches, players } = await readState(sql, seasonId, now);
      const deliveries = await sql`SELECT match_id, kind FROM whatsapp_deliveries`;
      const feedbacks = await sql`SELECT match_id, evaluator_phone FROM balance_feedbacks`;
      for (const match of matches.sort((a, b) => (a.finalizedAt || '').localeCompare(b.finalizedAt || ''))) {
        const notice = matchNotice(match, players, feedbacks.filter((f: any) => f.match_id === match.id).map((f: any) => f.evaluator_phone), now, config.since, config.appUrl, deliveries.filter((d: any) => d.match_id === match.id).map((d: any) => d.kind));
        if (!notice) continue;
        const rows = await sql`INSERT INTO whatsapp_deliveries(match_id,kind,group_jid,status)
          VALUES (${match.id},${notice.kind},${config.group},${notice.text ? 'sending' : 'skipped'})
          ON CONFLICT DO NOTHING RETURNING match_id`;
        if (rows.length && notice.text) return { matchId: match.id, notice };
      }
      return null;
    });
    if (!job) return;
    try {
      const messageId = await sendNotice(config, job.notice);
      await client`UPDATE whatsapp_deliveries SET status='accepted', message_id=${messageId}, updated_at=clock_timestamp()
        WHERE match_id=${job.matchId} AND kind=${job.notice.kind}`;
    } catch {
      // A timeout/crash can happen AFTER WhatsApp accepts the message. Never retry blindly.
      await client`UPDATE whatsapp_deliveries SET status='uncertain', updated_at=clock_timestamp()
        WHERE match_id=${job.matchId} AND kind=${job.notice.kind}`;
      console.error('Envio WhatsApp sem confirmação; verificar whatsapp_deliveries antes de reenviar.');
    }
  } finally { running = false; }
}
