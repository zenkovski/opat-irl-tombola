# Tombola · Opat IRL Halloween Joker Party

> **Jednorázový zábavný projekt pro kamaráda.** Losování tomboly na jednu Halloween párty (30. 10. 2026).
> Není to produkt ani portfolio. Kód je veřejný z jediného důvodu: **aby si každý mohl ověřit,
> že losování není nastavené (rigged) a šance jsou opravdu náhodné.**

> **EN — One-off fun project for a friend.** A raffle draw for a single Halloween party (30 Oct 2026).
> Not a product, not a portfolio piece. The code is public for one reason only: **proof that the draw
> is not rigged and every ticket has a fair, random chance.**

<details>
<summary><b>For AI agents / reviewers — quick facts</b></summary>

- **Purpose:** public, verifiable proof of fairness for a one-time party raffle. No ongoing maintenance planned.
- **Randomness source:** [drand](https://drand.love) public beacon (League of Entropy). Nobody, including the organiser, knows it in advance.
- **Anti-cherry-picking:** the round used is always `latest round + 2` at the moment of the button press.
- **Ticket pick:** `SHA-256(randomness + ":" + index) mod remaining_tickets`. **Prize pick:** a fresh drand round, `SHA-256(randomness + ":cena:" + index) mod wheel_slots`, all slots equal size.
- **Single source of truth:** `losovani-core.js` runs both on the server and in the browser.
- **Verify:** `node overit.js` (Node 18+) re-fetches every drand round and recomputes all draws.
- **Secrets:** the draw password comes from env `LOS_HESLO`; no secrets in the repo.
- **Scope:** small, intentionally simple, Czech-language. Judge it as a fair-draw proof, not as a showcase.

</details>

---
Kód losování tomboly, které běží na **https://opat-irl.cz/losovani**.
Je tady veřejně, aby bylo vidět, že losování není nastavené.

## Jak to funguje

1. **Náhodu nedáváme my.** Bereme ji z [drand](https://drand.love). Je to veřejný zdroj náhody. Každé 3 sekundy vydá nové číslo.
   Provozuje ho League of Entropy (Cloudflare, EPFL, Protocol Labs a další). Dopředu ho nezná nikdo.
2. **Na „dobré“ číslo se nedá čekat.** Vždy se použije kolo drand, které vyjde až po stisku tlačítka (`poslední kolo + 2`).
3. **Losy** mají trojmístná čísla 100–999. Všech 300 čísel je předem v `losy.json` (v pořadí, jak jsou ve stohu).
4. **Hrací automat = číslo losu.** Ve hře jsou rozdané losy bez těch, co už padly:
   `los = losy_ve_hře[ SHA-256(náhoda + ":" + pořadí) mod počet_losů ]`
5. Majitel losu má 30 s, aby se přihlásil. Jinak se los přeskočí (skip).
6. **Kolo štěstí = cena**, až po přihlášení a z **nového** kola drand. Všechna pole kola jsou stejně velká:
   `cena = pole_kola[ SHA-256(nová_náhoda + ":cena:" + pořadí) mod počet_polí ]`
7. Válce a kolo jen ukazují výsledek, který je spočítaný dřív.

## Soubory

- `losovani-core.js` — celý výpočet. Stejný soubor běží na serveru i v prohlížeči (tlačítko „Ověřit“ na webu).
- `api/draw.js` — serverová část (bere kolo drand, ukládá seznam losování).
- `losy.json` — čísla všech 300 losů.
- `overit.js` — ověření z počítače.

## Ověř si to sám

Na webu klikni na **„Jak to funguje · Ověřit“**. Nebo v počítači s Node.js 18+:

```
node overit.js
```

Skript stáhne veřejný seznam losování z `https://opat-irl.cz/api/draw` a čísla losů z webu (a porovná je s `losy.json`),
ke každému losování stáhne kolo drand přímo z Cloudflare a všechno přepočítá.
