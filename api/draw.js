// v28: losování tomboly ve dvou krocích.
//  1. "draw"  → hrací automat vybere číslo losu (stav "ceka").
//  2. "tady"  → majitel se přihlásil → kolo štěstí vybere cenu z NOVÉHO kola drand (stav "tady").
//     "pryc"  → nikdo se nepřihlásil do 30 s → los se přeskočí (stav "pryc").
// GET = veřejný stav (kdokoli vidí a může ověřit) · GET ?img=ID = fotka ceny.
// POST (heslo adminu v x-admin) {action:"draw"|"tady"|"pryc"|"config"|"prize"|"prizeDel"|"reset"|"check"}.
const L = require("../losovani-core.js");
const LOSY = require("../losy.json").poradi;
const { store } = require("../lib/store");
const { body, send, adminOk, ip } = require("../lib/util");

const KEY = "draw", IMG = id => "draw:img:" + id;
const DEMO = ["Freespiny za tisíce Kč", "Stírací los", "Merch", "Alkohol"];
const empty = () => ({ ver: 0, cfg: { dano: LOSY.length }, prizes: DEMO.map((name, i) => ({ id: "p" + (i + 1), name, short: "", qty: 1, img: 0 })), log: [], resets: [] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const chyba = msg => Object.assign(new Error(msg), { msg });

async function load() {
  const st = (await store.kvGet(KEY)) || empty();
  if (!st.prizes) st.prizes = empty().prizes;
  if (!st.cfg || !st.cfg.dano) { st.cfg = { dano: LOSY.length }; st.log = []; } // v28: nové číslování losů → staré zkoušky pryč
  st.ver = st.ver || 0;
  return st;
}
async function save(st) { st.ver++; await store.kvSet(KEY, st); }

// kolo drand, které ještě nevyšlo (poslední + 2) → výsledek nikdo nezná dopředu
async function budouciKolo(min) {
  const latest = await L.beacon("latest");
  if (!latest) throw chyba("Veřejná náhoda drand teď neodpovídá. Zkontroluj internet a zkus to znovu.");
  const round = Math.max(latest.round + 2, min);
  await sleep(Math.max(0, (L.GENESIS + (round - 1) * L.PERIOD) * 1000 - Date.now()) + 300);
  let b = null;
  for (let i = 0; i < 8 && !b; i++) { b = await L.beacon(round); if (!b) await sleep(700); }
  if (!b) throw chyba("Kolo drand nepřišlo. Zkus to znovu.");
  return b;
}
const posledniKolo = st => Math.max(0, ...st.log.map(e => Math.max(e.round, e.prizeRound || 0)));

async function draw(st) {
  const last = st.log[st.log.length - 1];
  if (last && last.stav === "ceka") throw chyba(`Nejdřív potvrď los ${last.number}: je tady, nebo skip.`);
  const p = L.pool(LOSY, st.cfg.dano, st.log.map(e => e.number));
  if (!p.length) throw chyba("Všechny rozdané losy už padly.");
  const b = await budouciKolo(posledniKolo(st) + 1);
  const no = st.log.length + 1;
  const k = await L.pick(b.randomness, no, p);
  const e = { no, round: b.round, randomness: b.randomness, dano: st.cfg.dano, poolSize: p.length, hash: k.hash, index: k.index, number: k.number,
    stav: "ceka", ts: Date.now(), prizeId: null, prize: "" };
  st.log.push(e);
  return e;
}

async function tady(st, e) {
  const pole = L.prizesLeft(st.prizes, st.log).filter(x => x.left > 0).map(x => ({ id: x.id, name: x.name, short: x.short }));
  e.stav = "tady"; e.tadyTs = Date.now();
  if (!pole.length) return e; // ceny došly
  const b = await budouciKolo(posledniKolo(st) + 1);
  const c = await L.pickPrize(b.randomness, e.no, pole);
  Object.assign(e, { prizeRound: b.round, prizeRandomness: b.randomness, prizePool: pole, prizeHash: c.hash, prizeIndex: c.index, prizeKde: c.kde, prizeId: c.id, prize: c.name });
  return e;
}

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      if (q.get("img")) {
        const d = await store.kvGet(IMG(String(q.get("img")).slice(0, 40)));
        const m = typeof d === "string" && d.match(/^data:(image\/(?:webp|jpeg|png));base64,(.+)$/);
        if (!m) { res.statusCode = 404; return res.end(); }
        res.setHeader("Content-Type", m[1]);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); // adresa nese verzi (&v=)
        res.statusCode = 200;
        return res.end(Buffer.from(m[2], "base64"));
      }
      const st = await load();
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=2"); // CDN drží 2 s → diváci nežerou databázi
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      return res.end(JSON.stringify({ ...st, celkem: LOSY.length, now: Date.now() }));
    }
    if (req.method !== "POST") return send(res, 405, { error: "?" });

    const k = "adm:" + ip(req);
    if ((await store.hits(k)) >= 20) return send(res, 429, { error: "Moc špatných pokusů. Zkus to za 15 minut." });
    if (!adminOk(req)) { await store.hit(k, 900); return send(res, 401, { error: "Špatné heslo." }); }

    const b = await body(req);
    if (b.action === "check") return send(res, 200, { ok: true });
    if (!(await store.lock(KEY, 25))) return send(res, 409, { error: "Právě se losuje. Chvilku." });
    try {
      const st = await load();
      if (b.action === "draw" || b.action === "tady") {
        let e;
        if (b.action === "draw") e = await draw(st);
        else {
          e = st.log.find(x => x.no === Number(b.no));
          if (!e || e.stav !== "ceka") return send(res, 400, { error: "Tenhle los už je vyřízený." });
          await tady(st, e);
        }
        await save(st);
        return send(res, 200, { ok: true, entry: e, state: { ...st, celkem: LOSY.length } });
      }
      if (b.action === "pryc") {
        const e = st.log.find(x => x.no === Number(b.no));
        if (!e || e.stav !== "ceka") return send(res, 400, { error: "Tenhle los už je vyřízený." });
        e.stav = "pryc";
      } else if (b.action === "config") {
        const dano = Number.parseInt(b.dano, 10);
        if (!(dano >= 1 && dano <= LOSY.length)) return send(res, 400, { error: `Rozdáno může být 1 až ${LOSY.length} losů.` });
        st.cfg = { dano };
      } else if (b.action === "prize") {
        const name = String(b.name || "").trim().slice(0, 60), short = String(b.short || "").trim().slice(0, 18), qty = Number.parseInt(b.qty, 10);
        if (!name) return send(res, 400, { error: "Napiš název ceny." });
        if (!(qty >= 0 && qty <= 999)) return send(res, 400, { error: "Počet kusů: 0 až 999." });
        let p = st.prizes.find(x => x.id === b.id);
        if (!p) {
          if (st.prizes.length >= 40) return send(res, 400, { error: "Maximálně 40 druhů cen." });
          p = { id: newId(), name, short, qty, img: 0 }; st.prizes.push(p);
        }
        p.name = name; p.short = short; p.qty = qty;
        if (typeof b.img === "string") {
          if (!/^data:image\/(webp|jpeg|png);base64,/.test(b.img) || b.img.length > 600000) return send(res, 400, { error: "Fotka je moc velká nebo ve špatném formátu." });
          await store.kvSet(IMG(p.id), b.img); p.img = Date.now();
        } else if (b.img === null) p.img = 0;
      } else if (b.action === "prizeDel") {
        st.prizes = st.prizes.filter(x => x.id !== b.id);
      } else if (b.action === "reset") {
        st.log = []; st.resets.push(Date.now());
      } else return send(res, 400, { error: "Neznámá akce." });
      await save(st);
      return send(res, 200, { ok: true, state: { ...st, celkem: LOSY.length } });
    } finally { await store.unlock(KEY); }
  } catch (e) {
    console.error(e);
    send(res, e.msg ? 503 : 500, { error: e.msg || "Chyba serveru." });
  }
};
