// Losování tomboly. STEJNÝ soubor běží na serveru (api/draw.js) i v prohlížeči (tlačítko Ověřit).
//
// Jak se vybere číslo:
//  1. Náhodu nedáváme my. Bereme ji z drand (https://drand.love): veřejný zdroj náhody,
//     který každé 3 s vydá nové číslo. Provozuje ho League of Entropy (Cloudflare, EPFL, Protocol Labs a další).
//     Dopředu ho nezná nikdo, ani my.
//  2. Po stisku LOSUJ se použije kolo drand, které vyjde až za pár sekund (kolo = poslední + 2).
//     Na „dobré“ číslo se tedy čekat nedá.
//  3. Ve hře jsou losy od..do bez těch, co už padly (seřazené vzestupně).
//  4. hash = SHA-256( randomness + ":" + pořadí losování )
//     pozice = hash (jako velké číslo) modulo počet losů ve hře
//     výherce = losy_ve_hře[pozice]
//  5. Cenu vybere kolo štěstí ze stejné náhody. Každý kus ceny = jeden dílek kola:
//     dílek = SHA-256( randomness + ":cena:" + pořadí ) modulo počet kusů, které ještě zbývají.
//     Cena, které je víc kusů, má na kole víc místa (a víc šance).
(function (root) {
  const CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"; // drand quicknet (kolo každé 3 s)
  const GENESIS = 1692803367, PERIOD = 3;
  const RELAYS = ["https://api.drand.sh", "https://drand.cloudflare.com", "https://api2.drand.sh", "https://api3.drand.sh"];

  async function sha256hex(s) {
    if (typeof window === "undefined") return require("crypto").createHash("sha256").update(s).digest("hex");
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  // losy ve hře: od..do bez už vylosovaných
  function pool(from, to, taken) {
    const t = new Set(taken), p = [];
    for (let i = from; i <= to; i++) if (!t.has(i)) p.push(i);
    return p;
  }

  async function pick(randomness, no, p) {
    const hash = await sha256hex(randomness + ":" + no);
    const index = Number(BigInt("0x" + hash) % BigInt(p.length));
    return { hash, index, number: p[index] };
  }

  // kolik kusů každé ceny zbývá (výhra losu, který se nehlásí, se vrací do hry)
  function prizesLeft(prizes, log) {
    return prizes.map(p => ({ id: p.id, name: p.name, left: Math.max(0, p.qty - log.filter(e => e.prizeId === p.id && !e.absent).length) }));
  }

  async function pickPrize(randomness, no, pp) {
    const total = pp.reduce((s, p) => s + p.left, 0);
    if (!total) return null;
    const hash = await sha256hex(randomness + ":cena:" + no);
    const r = Number(BigInt("0x" + hash) % BigInt(total));
    let acc = 0;
    for (const p of pp) { if (r < acc + p.left) return { hash, r, total, id: p.id, name: p.name }; acc += p.left; }
  }

  // jedno kolo drand; round = číslo nebo "latest"; zkouší víc nezávislých serverů
  async function beacon(round, relays = RELAYS) {
    for (const r of relays) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2500);
        const res = await fetch(`${r}/${CHAIN}/public/${round}`, { signal: ctl.signal, cache: "no-store" });
        clearTimeout(t);
        if (res.ok) { const j = await res.json(); if (j.randomness) return j; }
      } catch (e) { /* další server */ }
    }
    return null;
  }

  // přepočítá celý seznam od začátku; vrací pro každé losování { ok, why }
  async function verify(log, relays) {
    const out = [], taken = [];
    for (const e of log) {
      const b = await beacon(e.round, relays);
      const p = pool(e.from, e.to, taken);
      const k = b ? await pick(b.randomness, e.no, p) : null;
      const c = b && e.prizePool ? await pickPrize(b.randomness, e.no, e.prizePool) : null;
      const cenaOk = !e.prizePool || (c ? c.id === e.prizeId : !e.prizeId);
      const ok = !!b && b.randomness === e.randomness && k.number === e.number && cenaOk;
      out.push({ no: e.no, ok, why: !b ? "drand neodpověděl" : b.randomness !== e.randomness ? "jiná náhoda než u drand" : k.number !== e.number ? "jiné číslo losu" : !cenaOk ? "jiná cena" : "" });
      taken.push(e.number);
    }
    return out;
  }

  const api = { CHAIN, GENESIS, PERIOD, RELAYS, sha256hex, pool, pick, prizesLeft, pickPrize, beacon, verify };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Losovani = api;
})(typeof window !== "undefined" ? window : globalThis);
