# Tombola · Opat IRL Halloween Joker Party

Kód losování tomboly, které běží na **https://opat-irl.cz/losovani**.
Je tady veřejně, aby bylo vidět, že losování není nastavené.

## Jak to funguje

1. **Náhodu nedáváme my.** Bereme ji z [drand](https://drand.love). Je to veřejný zdroj náhody. Každé 3 sekundy vydá nové číslo.
   Provozuje ho League of Entropy (Cloudflare, EPFL, Protocol Labs a další). Dopředu ho nezná nikdo.
2. **Na „dobré“ číslo se nedá čekat.** Po stisku LOSUJ se použije kolo drand, které vyjde až za pár sekund (`poslední kolo + 2`).
3. **Hrací automat = číslo losu.** Ve hře jsou losy od–do bez těch, co už padly:
   `los = losy_ve_hře[ SHA-256(náhoda + ":" + pořadí) mod počet_losů ]`
4. **Kolo štěstí = cena.** Každý kus ceny je jeden dílek kola:
   `cena = dílek[ SHA-256(náhoda + ":cena:" + pořadí) mod počet_kusů ]`
5. Válce a kolo jen ukazují výsledek, který je spočítaný dřív.

## Soubory

- `losovani-core.js` — celý výpočet. Stejný soubor běží na serveru i v prohlížeči (tlačítko „Ověřit“ na webu).
- `api/draw.js` — serverová část (bere kolo drand, ukládá seznam losování).
- `overit.js` — ověření z počítače.

## Ověř si to sám

Na webu klikni na **„Jak to funguje · Ověřit“**. Nebo v počítači s Node.js 18+:

```
node overit.js
```

Skript stáhne veřejný seznam losování z `https://opat-irl.cz/api/draw`,
ke každému losování stáhne kolo drand přímo z Cloudflare a všechno přepočítá.
