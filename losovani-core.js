// Losování tomboly. STEJNÝ soubor běží na serveru (api/draw.js) i v prohlížeči (tlačítko Ověřit).
//
// Losy: 300 lístků s trojmístnými čísly (100–999) v pevném pořadí (losy.json, zveřejněné předem).
// Rozdávají se ze stohu shora; ve hře je prvních N rozdaných.
//
// Jak se losuje:
//  1. Náhodu nedáváme my. Bereme ji z drand (https://drand.love): veřejný zdroj náhody,
//     který každé 3 s vydá nové číslo. Provozuje ho League of Entropy (Cloudflare, EPFL, Protocol Labs a další).
//     Dopředu ho nezná nikdo, ani my.
//  2. Vždy se použije kolo drand, které vyjde až po stisku tlačítka (poslední + 2). Na „dobré“ číslo se čekat nedá.
//  3. HRACÍ AUTOMAT = číslo losu:
//     ve hře = rozdané losy bez těch, co už padly (seřazené vzestupně)
//     los = ve_hře[ SHA-256(náhoda + ":" + pořadí) mod počet ]
//  4. Majitel losu se do 30 s přihlásí („je tady“), jinak se los přeskočí.
//  5. KOLO ŠTĚSTÍ = cena, až po „je tady“, z NOVÉHO kola drand:
//     všechna pole kola jsou stejně velká (jeden druh ceny = jedno pole, dokud nějaký kus zbývá)
//     cena = pole[ SHA-256(náhoda + ":cena:" + pořadí) mod počet polí ]
(function (root) {
  const CHAIN = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"; // drand quicknet (kolo každé 3 s)
  const GENESIS = 1692803367, PERIOD = 3;
  const RELAYS = ["https://api.drand.sh", "https://drand.cloudflare.com", "https://api2.drand.sh", "https://api3.drand.sh"];

  async function sha256hex(s) {
    if (typeof window === "undefined") return require("crypto").createHash("sha256").update(s).digest("hex");
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }

  // losy ve hře: prvních `dano` ze stohu bez už vylosovaných, vzestupně
  function pool(poradi, dano, taken) {
    const t = new Set(taken);
    return poradi.slice(0, dano).filter(n => !t.has(n)).sort((a, b) => a - b);
  }

  async function pick(randomness, no, p) {
    const hash = await sha256hex(randomness + ":" + no);
    const index = Number(BigInt("0x" + hash) % BigInt(p.length));
    return { hash, index, number: p[index] };
  }

  // kolik kusů každé ceny zbývá (cenu dostane jen los, který „je tady“)
  function prizesLeft(prizes, log) {
    return prizes.map(p => ({ id: p.id, name: p.name, short: p.short || "", left: Math.max(0, p.qty - log.filter(e => e.prizeId === p.id).length) }));
  }

  // pole kola = druhy cen, kterých ještě něco zbývá; všechna stejně velká
  async function pickPrize(randomness, no, pole) {
    if (!pole.length) return null;
    const hash = await sha256hex(randomness + ":cena:" + no), h = BigInt("0x" + hash), n = BigInt(pole.length);
    const index = Number(h % n);
    const kde = Number((h / n) % 1000n) / 1000; // kde v poli se kolo zastaví (jen vzhled)
    return { hash, index, kde, id: pole[index].id, name: pole[index].name };
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
  async function verify(log, poradi, relays) {
    const out = [], taken = [];
    for (const e of log) {
      const b = await beacon(e.round, relays);
      const k = b ? await pick(b.randomness, e.no, pool(poradi, e.dano, taken)) : null;
      let why = !b ? "drand neodpověděl" : b.randomness !== e.randomness ? "jiná náhoda než u drand" : k.number !== e.number ? "jiné číslo losu" : "";
      if (!why && e.prizeRound) {
        const b2 = await beacon(e.prizeRound, relays);
        const c = b2 ? await pickPrize(b2.randomness, e.no, e.prizePool) : null;
        why = !b2 ? "drand neodpověděl (cena)" : b2.randomness !== e.prizeRandomness ? "jiná náhoda u ceny" : !c || c.id !== e.prizeId ? "jiná cena" : "";
      }
      out.push({ no: e.no, ok: !why, why });
      taken.push(e.number);
    }
    return out;
  }

  const api = { CHAIN, GENESIS, PERIOD, RELAYS, sha256hex, pool, pick, prizesLeft, pickPrize, beacon, verify };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Losovani = api;
})(typeof window !== "undefined" ? window : globalThis);
