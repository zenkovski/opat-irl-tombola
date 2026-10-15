// v26: losování tomboly. Automat vybere číslo losu, kolo štěstí cenu (obojí ze stejné náhody drand).
// GET = veřejný stav (kdokoli vidí a může ověřit) · GET ?img=ID = fotka ceny.
// POST (heslo adminu v x-admin) {action:"draw"|"absent"|"config"|"prize"|"prizeDel"|"reset"|"check"}.
const L = require("../losovani-core.js");
const { store } = require("../lib/store");
const { body, send, adminOk, ip } = require("../lib/util");

const KEY = "draw", IMG = id => "draw:img:" + id;
// ukázkové ceny, admin je přepíše (název, počet kusů, fotka)
const DEMO = ["Freespiny za tisíce Kč", "Stírací los", "Merch", "Alkohol"];
const empty = () => ({ ver: 0, cfg: { from: 1, to: 100 }, prizes: DEMO.map((name, i) => ({ id: "p" + (i + 1), name, qty: 1, img: 0 })), log: [], resets: [] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function load() {
  const st = (await store.kvGet(KEY)) || empty();
  if (!st.prizes) { const e = empty(); st.prizes = e.prizes; } // v25 → v26
  if (st.cfg.prizes) { delete st.cfg.prizes; delete st.cfg.current; }
  st.ver = st.ver || 0;
  return st;
}
async function save(st) { st.ver++; await store.kvSet(KEY, st); }

async function draw(st) {
  const last = st.log[st.log.length - 1];
  const latest = await L.beacon("latest");
  if (!latest) throw Object.assign(new Error("drand"), { msg: "Veřejná náhoda drand teď neodpovídá. Zkontroluj internet a zkus to znovu." });
  // kolo, které ještě nevyšlo → výsledek nikdo nezná dopředu
  const round = Math.max(latest.round + 2, last ? last.round + 1 : 0);
  const at = (L.GENESIS + (round - 1) * L.PERIOD) * 1000;
  await sleep(Math.max(0, at - Date.now()) + 300);
  let b = null;
  for (let i = 0; i < 8 && !b; i++) { b = await L.beacon(round); if (!b) await sleep(700); }
  if (!b) throw Object.assign(new Error("drand"), { msg: "Kolo drand nepřišlo. Zkus to znovu." });

  const { from, to } = st.cfg;
  const p = L.pool(from, to, st.log.map(e => e.number));
  if (!p.length) throw Object.assign(new Error("empty"), { msg: "Všechny losy už padly." });
  const no = st.log.length + 1;
  const k = await L.pick(b.randomness, no, p);
  const prizePool = L.prizesLeft(st.prizes, st.log).filter(x => x.left > 0);
  const c = await L.pickPrize(b.randomness, no, prizePool);
  const e = { no, round, randomness: b.randomness, from, to, poolSize: p.length, hash: k.hash, index: k.index, number: k.number,
    prizePool, prizeHash: c ? c.hash : null, prizeR: c ? c.r : null, prizeTotal: c ? c.total : 0,
    prizeId: c ? c.id : null, prize: c ? c.name : "", ts: Date.now(), absent: false };
  st.log.push(e);
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
      return res.end(JSON.stringify({ ...st, now: Date.now() }));
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
      if (b.action === "draw") {
        const e = await draw(st);
        await save(st);
        return send(res, 200, { ok: true, entry: e, state: st });
      }
      if (b.action === "absent") {
        const e = st.log.find(x => x.no === Number(b.no));
        if (!e) return send(res, 400, { error: "Takové losování není." });
        e.absent = b.value !== false;
      } else if (b.action === "config") {
        const from = Number.parseInt(b.from, 10), to = Number.parseInt(b.to, 10);
        if (!(from >= 1 && to >= from && to <= 9999 && to - from <= 5000)) return send(res, 400, { error: "Rozsah losů: od 1 do 9999." });
        st.cfg = { from, to };
      } else if (b.action === "prize") {
        const name = String(b.name || "").trim().slice(0, 60), qty = Number.parseInt(b.qty, 10);
        if (!name) return send(res, 400, { error: "Napiš název ceny." });
        if (!(qty >= 0 && qty <= 999)) return send(res, 400, { error: "Počet kusů: 0 až 999." });
        let p = st.prizes.find(x => x.id === b.id);
        if (!p) {
          if (st.prizes.length >= 40) return send(res, 400, { error: "Maximálně 40 druhů cen." });
          p = { id: newId(), name, qty, img: 0 }; st.prizes.push(p);
        }
        p.name = name; p.qty = qty;
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
      return send(res, 200, { ok: true, state: st });
    } finally { await store.unlock(KEY); }
  } catch (e) {
    console.error(e);
    send(res, e.msg ? 503 : 500, { error: e.msg || "Chyba serveru." });
  }
};
