# Tombola · Opat IRL Halloween Joker Party

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
