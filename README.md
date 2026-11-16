# Click Planet

Een Capacitor Android planet-clicker game met eindeloze `m × 10^e` massagroei, passerende meteorieten en globale highscores.

## Features

- **Startscherm**: Knoppen **Play** en **Highscores**.
- **20 Planeetkleuren**: Kies bij **Play** eerst 1 van de 20 planeetkleuren voordat je op jouw gekleurde planeet speelt.
- **Eindeloze Massa (`m × 10^e`)**:
  - Start op `0.01 kg`.
  - Eerste 10 clicks op de planeet: `+4` tot `+5 kg` per click.
  - Daarna: `+0.01%` per click, eindeloos schalend via mantisse + exponent (`m × 10^e`).
  - Alleen klikken op de planeet zelf of op passerende meteorieten geeft massa (ernaast klikken niet).
- **Passerende Meteorieten**: Klik op voorbijvliegende meteorieten zodat je planeet ze absorbeert (`5–10 kg` aan het begin, schaalt later mee met de totale massa).
- **Unieke Planeetnaam**: Vul onder de massa een unieke planeetnaam in die gekoppeld wordt aan jouw telefoon (geen 2 dezelfde namen).
- **Globale Highscores**: Live verbonden met de meegeleverde Cloudflare Worker of Node.js backend, automatisch bijgewerkt op hoogste massa.

## Android APK & AAB bouwen via GitHub Actions

De workflow [android-build.yml](.github/workflows/android-build.yml) bouwt bij elke push naar `main` automatisch:
- `app-debug.apk` (artifact `app-debug-apk`)
- `app-release.aab` (artifact `app-release-aab`)

## Backend deployen (Globale Highscores)

Je kunt kiezen tussen de Cloudflare Worker of de Node.js server:

### Optie 1: Cloudflare Worker (aanbevolen, gratis tier met Durable Object SQLite)

```bash
cd backend/cloudflare-worker
npm install
npx wrangler deploy
```

### Optie 2: Node.js Server

```bash
cd backend/node-server
npm install
npm start
```

Plak daarna de URL van je backend in de app bij **Highscores → Server**, of stel hem bij build-time in via GitHub Repository Variable `VITE_API_URL`.

## Lokaal ontwikkelen

```bash
npm install
npm run dev
```
