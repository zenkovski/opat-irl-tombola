// Ověření všech losování z příkazové řádky (Node 18+):  node overit.js
// Stáhne veřejný seznam losování a seznam čísel losů z webu, ke každému losování stáhne kolo drand z Cloudflare a vše přepočítá.
const L = require("./losovani-core.js");
const WEB = (process.argv[2] || "https://opat-irl.cz").replace(/\/$/, "");
(async () => {
  const st = await (await fetch(WEB + "/api/draw")).json();
  const poradi = (await (await fetch(WEB + "/losy.json")).json()).poradi;
  if (JSON.stringify(poradi) !== JSON.stringify(require("./losy.json").poradi)) console.log("POZOR: čísla losů na webu se liší od losy.json v tomhle repozitáři!");
  if (!st.log.length) return console.log("Zatím se nic nelosovalo.");
  const res = await L.verify(st.log, poradi, ["https://drand.cloudflare.com", "https://api.drand.sh"]);
  res.forEach((r, i) => {
    const e = st.log[i], co = e.stav === "tady" ? " · cena: " + (e.prize || "ceny došly") : e.stav === "pryc" ? " · skip" : " · čeká";
    console.log(`${r.ok ? "OK " : "CHYBA"} ${e.no}. los ${e.number}${co} · kolo drand #${e.round}${e.prizeRound ? " / #" + e.prizeRound : ""}${r.ok ? "" : " · " + r.why}`);
  });
  console.log(res.every(r => r.ok) ? "\nVšechna losování sedí." : "\nNěco nesedí!");
})();
