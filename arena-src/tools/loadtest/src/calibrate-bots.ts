/**
 * Bot difficulty calibration: each level plays 60 seeded solo boards per size with the
 * real engine on a virtual clock. `npx tsx tools/loadtest/src/calibrate-bots.ts`
 */
import { BOT_PROFILES, BotMind, applyEvent, createMatch, decideClear, decideFlip, decideStart, decideTimeout, rngFromSeed, type MatchEvent, type MatchState } from "@arena/engine";
for (const level of ["rookie", "adept", "ace"] as const) {
  for (const cards of [12, 18, 24]) {
    let cleared = 0, score = 0, secs = 0, fails = 0;
    const N = 60;
    for (let k = 0; k < N; k++) {
      const seed = (k.toString(16) + "0".repeat(32)).slice(0, 32);
      let s: MatchState = applyEvent(null, createMatch({ matchId: "m", mode: "room", seed, cardCount: cards, players: [{ id: "b", name: "b", kind: "bot", seat: 0, botLevel: level }], now: 0 }));
      const commit = (es: MatchEvent[]) => { for (const e of es) s = applyEvent(s, e); return es; };
      const d = decideStart(s, s.startsAt); if (d.ok) commit(d.events);
      const mind = new BotMind(BOT_PROFILES[level], rngFromSeed("c" + k));
      let t = s.startedAt!;
      while (s.status === "active") {
        const me = s.players[0]!;
        if (me.resolvingUntil !== null) { t = Math.max(t, me.resolvingUntil); const c = decideClear(s, "b", "mismatch", t); if (c.ok) commit(c.events); continue; }
        t += mind.thinkDelay();
        if (t >= s.endsAt!) { const x = decideTimeout(s, t); if (x.ok) commit(x.events); break; }
        const card = mind.chooseCard(s, "b", t)!;
        const r = decideFlip(s, "b", card, t);
        if (!r.ok) throw new Error(r.code);
        for (const e of commit(r.events)) { if (e.type === "card_flipped") mind.observe(e.card, e.value, e.at); if (e.type === "triple_claimed") e.cards.forEach((c) => mind.forget(c)); if (e.type==="triple_failed") fails++; }
      }
      if (s.finishReason === "cleared") cleared++;
      score += s.players[0]!.score; secs += ((s.finishedAt ?? 0) - s.startedAt!) / 1000;
    }
    console.log(level, cards, "cleared", (cleared / N * 100).toFixed(0) + "%", "avgScore", Math.round(score / N), "avgSecs", (secs / N).toFixed(1), "limit", s0(cards), "fails/game", (fails/N).toFixed(1));
  }
}
function s0(c: number) { return Math.floor(6 * (c / 3) ** 2 / 1.85) + 13; }
