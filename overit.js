// Ověření všech losování z příkazové řádky (Node 18+):  node overit.js
// Stáhne veřejný seznam losování z webu, ke každému stáhne kolo drand z Cloudflare a vše přepočítá.
const L = require("./losovani-core.js");
const URL_ = process.argv[2] || "https://opat-irl.cz/api/draw";
(async () => {
  const st = await (await fetch(URL_)).json();
  if (!st.log.length) return console.log("Zatím se nic nelosovalo.");
  const res = await L.verify(st.log, ["https://drand.cloudflare.com", "https://api.drand.sh"]);
  res.forEach((r, i) => {
    const e = st.log[i];
    console.log(`${r.ok ? "OK " : "CHYBA"} ${e.no}. losování · kolo drand #${e.round} · los ${e.number}${e.prize ? " · " + e.prize : ""}${r.ok ? "" : " · " + r.why}`);
  });
  console.log(res.every(r => r.ok) ? "\nVšechna losování sedí." : "\nNěco nesedí!");
})();
