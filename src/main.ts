import './style.css';
import { PLANET_COLORS, getPlanetColor } from './data/planets';
import {
  computeMeteoriteGain,
  computePlanetClickGain,
  formatDeltaShort,
  formatMassParts,
  formatMassString,
  maxMass,
  normalizeMass,
} from './math/bigMass';
import { drawPlanet } from './game/planetRenderer';
import { PlanetStage } from './game/PlanetStage';
import { soundFX } from './game/SoundFX';
import { GameState, loadSavedState, resolveDeviceId, saveState } from './storage/state';
import {
  HighscoreEntry,
  claimUniquePlanetName,
  fetchGlobalHighscores,
  fetchPlayerProfile,
  submitHighestMass,
} from './api/highscores';

type ScreenName = 'home' | 'colors' | 'game' | 'highscores';

let state: GameState;
let currentScreen: ScreenName = 'home';
let stage: PlanetStage | null = null;
let syncTimeout: number | null = null;
let hsPollInterval: number | null = null;
let homeAnimId: number | null = null;

function renderMassHtml(m: number, e: number): string {
  const parts = formatMassParts({ m, e });
  if (parts.isScientific && parts.mantissa !== undefined && parts.exponent !== undefined) {
    return `${parts.mantissa} × 10<sup>${parts.exponent}</sup> kg`;
  }
  return `${parts.text} kg`;
}

function renderMiniPlanetCanvas(canvas: HTMLCanvasElement, colorId: number, size: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const planet = getPlanetColor(colorId);
  const r = planet.hasRing ? size * 0.27 : size * 0.36;
  drawPlanet(ctx, size / 2, size / 2, r, planet, 0.22);
}

function buildApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <!-- HOME SCREEN -->
    <section id="screen-home" class="screen home-screen">
      <div class="home-hero">
        <canvas id="home-planet-canvas" class="home-planet-canvas"></canvas>
        <h1 class="game-title">Click Planet</h1>
        <p class="game-subtitle">
          Kies jouw planeetkleur, tap op je planeet &amp; grijp passerende meteorieten voor eindeloze massa.
        </p>
        <div id="home-save-pill" class="home-save-pill hidden"></div>
      </div>
      <div class="home-actions">
        <button id="btn-home-play" class="btn btn-primary">Play</button>
        <button id="btn-home-highscores" class="btn btn-secondary">Highscores</button>
      </div>
    </section>

    <!-- 20 PLANET COLORS SCREEN -->
    <section id="screen-colors" class="screen colors-screen hidden">
      <div class="top-nav">
        <button id="btn-colors-back" class="btn btn-small">← Terug</button>
        <h2 class="screen-heading">Kies Planeetkleur</h2>
        <span style="width:64px"></span>
      </div>
      <p class="colors-subtitle">Kies 1 van de 20 kleuren om te spelen:</p>
      <div id="color-grid" class="color-grid"></div>
    </section>

    <!-- GAME SCREEN -->
    <section id="screen-game" class="screen game-screen hidden">
      <header class="game-header">
        <div class="game-nav-row">
          <button id="btn-game-menu" class="btn btn-small">← Menu</button>
          <div class="game-nav-right">
            <button id="btn-game-colors" class="btn btn-small">Kleuren</button>
            <button id="btn-game-sound" class="btn btn-small">Geluid: Aan</button>
          </div>
        </div>

        <div class="mass-panel">
          <span class="mass-label">Massa</span>
          <div id="mass-value" class="mass-value">0.01 kg</div>
          <div id="mass-rate-badge" class="mass-rate-badge">Eerste 10 clicks: +4–5 kg (0/10)</div>
        </div>

        <div class="name-claim-box">
          <form id="name-claim-form" class="name-input-row">
            <input
              id="planet-name-input"
              class="name-input"
              type="text"
              maxlength="20"
              autocomplete="off"
              placeholder="Unieke planeetnaam..."
            />
            <button id="btn-claim-name" class="btn btn-claim" type="submit">Claim</button>
          </form>
          <div id="name-status" class="name-status"></div>
        </div>
      </header>

      <div class="stage-wrap">
        <canvas id="planet-stage-canvas" class="stage-canvas"></canvas>
      </div>

      <footer class="game-footer">
        <p class="motto-text">Most MASS Just TAP</p>
      </footer>
    </section>

    <!-- HIGHSCORES SCREEN -->
    <section id="screen-highscores" class="screen highscores-screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Terug</button>
        <h2 class="screen-heading">Globale Highscores</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Vernieuw</button>
      </div>

      <div class="hs-status-bar">
        <span id="hs-status-text">Verbinden met globale server...</span>
        <button id="btn-hs-config" class="btn btn-small">Server</button>
      </div>

      <div id="hs-config-panel" class="hs-config-panel hidden">
        <p class="hs-config-help">
          Vul de URL van je Click Planet backend in (Cloudflare Worker of Node.js server) voor globale synchronisatie.
        </p>
        <div class="name-input-row">
          <input
            id="api-url-input"
            class="name-input"
            type="url"
            placeholder="https://click-planet-api.workers.dev"
          />
          <button id="btn-save-api-url" class="btn btn-claim" type="button">Opslaan</button>
        </div>
      </div>

      <div id="hs-list" class="hs-list"></div>
    </section>
  `;

  populateColorGrid();
  wireEvents();
  refreshHomeSummary();
  startHomePreview();
}

function populateColorGrid(): void {
  const grid = document.getElementById('color-grid')!;
  grid.innerHTML = '';

  for (const p of PLANET_COLORS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `color-card${state.colorId === p.id ? ' selected' : ''}`;
    card.dataset.colorId = String(p.id);

    const cvs = document.createElement('canvas');
    renderMiniPlanetCanvas(cvs, p.id, 56);

    const label = document.createElement('span');
    label.className = 'color-card-name';
    label.textContent = p.name;

    card.appendChild(cvs);
    card.appendChild(label);

    card.addEventListener('click', () => {
      soundFX.playUiTap();
      state.colorId = p.id;
      saveState(state);
      updateColorGridSelection();
      showScreen('game');
      scheduleScoreSync(400);
    });

    grid.appendChild(card);
  }
}

function updateColorGridSelection(): void {
  const cards = document.querySelectorAll<HTMLButtonElement>('.color-card');
  cards.forEach((c) => {
    c.classList.toggle('selected', Number(c.dataset.colorId) === state.colorId);
  });
}

function showScreen(target: ScreenName): void {
  currentScreen = target;
  const screens: Record<ScreenName, HTMLElement> = {
    home: document.getElementById('screen-home')!,
    colors: document.getElementById('screen-colors')!,
    game: document.getElementById('screen-game')!,
    highscores: document.getElementById('screen-highscores')!,
  };

  (Object.keys(screens) as ScreenName[]).forEach((name) => {
    screens[name].classList.toggle('hidden', name !== target);
  });

  if (target === 'game') {
    stopHomePreview();
    stopHighscorePolling();
    startGameStage();
    updateGameUI();
  } else if (target === 'highscores') {
    stopHomePreview();
    stopGameStage();
    void loadHighscores();
    startHighscorePolling();
  } else if (target === 'home') {
    stopGameStage();
    stopHighscorePolling();
    refreshHomeSummary();
    startHomePreview();
  } else {
    stopHomePreview();
    stopGameStage();
    stopHighscorePolling();
    updateColorGridSelection();
  }
}

function startHomePreview(): void {
  if (homeAnimId !== null) return;
  const canvas = document.getElementById('home-planet-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const size = 168;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let phase = 0;
  let last = performance.now();
  const tick = (now: number) => {
    if (currentScreen !== 'home') {
      homeAnimId = null;
      return;
    }
    const dt = (now - last) / 1000;
    last = now;
    phase += dt * 0.06;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const planet = getPlanetColor(state.colorId ?? 1);
    drawPlanet(ctx, size / 2, size / 2, planet.hasRing ? 48 : 60, planet, phase);
    ctx.restore();

    homeAnimId = requestAnimationFrame(tick);
  };
  homeAnimId = requestAnimationFrame(tick);
}

function stopHomePreview(): void {
  if (homeAnimId !== null) {
    cancelAnimationFrame(homeAnimId);
    homeAnimId = null;
  }
}

function refreshHomeSummary(): void {
  const pill = document.getElementById('home-save-pill')!;
  if (state.clickCount > 0 || state.planetName) {
    const labelName = state.planetName ? `${state.planetName} • ` : '';
    pill.textContent = `${labelName}${formatMassString(state.highestMass)}`;
    pill.classList.remove('hidden');
  } else {
    pill.classList.add('hidden');
  }
}

function startGameStage(): void {
  const canvas = document.getElementById('planet-stage-canvas') as HTMLCanvasElement;
  const planet = getPlanetColor(state.colorId ?? 0);

  if (stage) {
    stage.setPlanet(planet);
    stage.start();
    return;
  }

  stage = new PlanetStage(canvas, planet, {
    onPlanetTap: () => {
      const { newMass, deltaMass } = computePlanetClickGain(state.mass, state.clickCount);
      state.mass = newMass;
      state.highestMass = maxMass(state.highestMass, newMass);
      state.clickCount += 1;
      saveState(state);
      soundFX.playPlanetTap();
      updateMassDisplay();
      scheduleScoreSync(2000);
      return formatDeltaShort(deltaMass);
    },
    onMeteoriteAbsorb: () => {
      const { newMass, deltaMass } = computeMeteoriteGain(state.mass);
      state.mass = newMass;
      state.highestMass = maxMass(state.highestMass, newMass);
      saveState(state);
      soundFX.playMeteorAbsorb();
      updateMassDisplay();
      scheduleScoreSync(1200);
      return formatDeltaShort(deltaMass);
    },
  });
  stage.start();
}

function stopGameStage(): void {
  if (stage) {
    stage.stop();
  }
}

function updateMassDisplay(): void {
  const massEl = document.getElementById('mass-value');
  const rateEl = document.getElementById('mass-rate-badge');
  if (massEl) {
    massEl.innerHTML = renderMassHtml(state.mass.m, state.mass.e);
  }
  if (rateEl) {
    if (state.clickCount < 10) {
      rateEl.textContent = `Eerste 10 clicks: +4–5 kg (${state.clickCount}/10)`;
    } else {
      rateEl.textContent = `+0.01% per click • Meteorieten schalen mee`;
    }
  }
}

function updateGameUI(): void {
  updateMassDisplay();
  const soundBtn = document.getElementById('btn-game-sound')!;
  soundBtn.textContent = state.soundEnabled ? 'Geluid: Aan' : 'Geluid: Uit';

  const input = document.getElementById('planet-name-input') as HTMLInputElement;
  input.value = state.planetName;

  const status = document.getElementById('name-status')!;
  if (state.planetName && state.nameClaimed) {
    status.className = 'name-status ok';
    status.textContent = `✓ "${state.planetName}" is gekoppeld aan jouw telefoon`;
  } else if (state.planetName) {
    status.className = 'name-status';
    status.textContent = state.apiBaseUrl
      ? 'Klik Claim om deze naam wereldwijd aan je telefoon te koppelen.'
      : 'Lokaal opgeslagen (koppel backend bij Highscores voor wereldwijde check).';
  } else {
    status.className = 'name-status';
    status.textContent = 'Kies een unieke planeetnaam (gekoppeld aan jouw telefoon).';
  }
}

function scheduleScoreSync(delayMs: number): void {
  if (!state.apiBaseUrl || !state.planetName.trim()) return;
  if (syncTimeout !== null) {
    window.clearTimeout(syncTimeout);
  }
  syncTimeout = window.setTimeout(() => {
    syncTimeout = null;
    void submitHighestMass(state.apiBaseUrl, {
      deviceId: state.deviceId,
      planetName: state.planetName,
      colorId: state.colorId ?? 0,
      mass: state.highestMass,
    });
  }, delayMs);
}

async function handleClaimName(): Promise<void> {
  const input = document.getElementById('planet-name-input') as HTMLInputElement;
  const status = document.getElementById('name-status')!;
  const btn = document.getElementById('btn-claim-name') as HTMLButtonElement;
  const rawName = input.value.trim().replace(/\s+/g, ' ');

  if (rawName.length < 2 || rawName.length > 20 || !/^[a-zA-Z0-9 _-]+$/.test(rawName)) {
    status.className = 'name-status err';
    status.textContent = 'Gebruik 2–20 tekens (letters, cijfers, spatie, - of _).';
    return;
  }

  state.planetName = rawName;
  saveState(state);

  if (!state.apiBaseUrl) {
    state.nameClaimed = false;
    saveState(state);
    status.className = 'name-status ok';
    status.textContent = `Lokaal opgeslagen als "${rawName}" (stel server URL in bij Highscores).`;
    return;
  }

  btn.disabled = true;
  status.className = 'name-status';
  status.textContent = 'Controleren & koppelen aan telefoon...';

  const result = await claimUniquePlanetName(state.apiBaseUrl, {
    deviceId: state.deviceId,
    planetName: rawName,
    colorId: state.colorId ?? 0,
    mass: state.highestMass,
  });

  btn.disabled = false;

  if (result.ok && result.entry) {
    state.planetName = result.entry.planetName;
    state.nameClaimed = true;
    saveState(state);
    input.value = result.entry.planetName;
    status.className = 'name-status ok';
    status.textContent = `✓ "${result.entry.planetName}" gekoppeld! (Rang #${result.entry.rank})`;
  } else {
    state.nameClaimed = false;
    saveState(state);
    status.className = 'name-status err';
    status.textContent = result.message || 'Naam is al bezet of server niet bereikbaar.';
  }
}

async function loadHighscores(): Promise<void> {
  const statusEl = document.getElementById('hs-status-text')!;
  const apiInput = document.getElementById('api-url-input') as HTMLInputElement;
  apiInput.value = state.apiBaseUrl;

  if (!state.apiBaseUrl) {
    statusEl.textContent = 'Geen globale server ingesteld (lokale weergave)';
    renderHighscoreRows(buildLocalFallbackEntry());
    return;
  }

  statusEl.textContent = 'Highscores laden...';

  try {
    // Push latest highest mass first if player has claimed a name
    if (state.planetName.trim()) {
      await submitHighestMass(state.apiBaseUrl, {
        deviceId: state.deviceId,
        planetName: state.planetName,
        colorId: state.colorId ?? 0,
        mass: state.highestMass,
      });
    }

    const res = await fetchGlobalHighscores(state.apiBaseUrl, state.deviceId, 50);
    statusEl.textContent = `Live verbonden • ${res.entries.length} planeten`;
    renderHighscoreRows(res.entries);
  } catch {
    statusEl.textContent = 'Server niet bereikbaar (offline modus)';
    renderHighscoreRows(buildLocalFallbackEntry());
  }
}

function buildLocalFallbackEntry(): HighscoreEntry[] {
  if (!state.planetName && state.clickCount === 0) return [];
  return [
    {
      rank: 1,
      deviceId: state.deviceId,
      planetName: state.planetName || 'Jouw Planeet (naamloos)',
      colorId: state.colorId ?? 0,
      massM: state.highestMass.m,
      massE: state.highestMass.e,
      updatedAt: new Date().toISOString(),
    },
  ];
}

function renderHighscoreRows(entries: HighscoreEntry[]): void {
  const listEl = document.getElementById('hs-list')!;
  if (entries.length === 0) {
    listEl.innerHTML = `
      <div class="hs-empty">
        Nog geen highscores gevonden.<br/>
        Kies een planeetkleur, tap op je planeet en claim een unieke planeetnaam!
      </div>
    `;
    return;
  }

  listEl.innerHTML = '';
  for (const item of entries) {
    const isMe = item.deviceId === state.deviceId;
    const row = document.createElement('div');
    row.className = `hs-row${isMe ? ' me' : ''}`;

    const rank = document.createElement('div');
    rank.className = 'hs-rank';
    rank.textContent = `#${item.rank}`;

    const icon = document.createElement('canvas');
    icon.className = 'hs-planet-icon';
    renderMiniPlanetCanvas(icon, item.colorId, 34);

    const nameCol = document.createElement('div');
    nameCol.className = 'hs-name-col';

    const name = document.createElement('div');
    name.className = 'hs-name';
    name.textContent = item.planetName;

    const sub = document.createElement('div');
    sub.className = 'hs-sub';
    sub.textContent = isMe ? 'Jouw telefoon' : getPlanetColor(item.colorId).name;

    nameCol.appendChild(name);
    nameCol.appendChild(sub);

    const mass = document.createElement('div');
    mass.className = 'hs-mass';
    const norm = normalizeMass(item.massM, item.massE);
    mass.innerHTML = renderMassHtml(norm.m, norm.e);

    row.appendChild(rank);
    row.appendChild(icon);
    row.appendChild(nameCol);
    row.appendChild(mass);

    listEl.appendChild(row);
  }
}

function startHighscorePolling(): void {
  stopHighscorePolling();
  hsPollInterval = window.setInterval(() => {
    if (currentScreen === 'highscores') {
      void loadHighscores();
    }
  }, 5000);
}

function stopHighscorePolling(): void {
  if (hsPollInterval !== null) {
    window.clearInterval(hsPollInterval);
    hsPollInterval = null;
  }
}

function wireEvents(): void {
  document.getElementById('btn-home-play')!.addEventListener('click', () => {
    soundFX.playUiTap();
    // Always let the player choose 1 of 20 planet colors first
    showScreen('colors');
  });

  document.getElementById('btn-home-highscores')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('highscores');
  });

  document.getElementById('btn-colors-back')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-game-menu')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-game-colors')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('colors');
  });

  document.getElementById('btn-game-sound')!.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    soundFX.enabled = state.soundEnabled;
    saveState(state);
    soundFX.playUiTap();
    updateGameUI();
  });

  document.getElementById('name-claim-form')!.addEventListener('submit', (ev) => {
    ev.preventDefault();
    soundFX.playUiTap();
    void handleClaimName();
  });

  document.getElementById('btn-hs-back')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-hs-refresh')!.addEventListener('click', () => {
    soundFX.playUiTap();
    void loadHighscores();
  });

  document.getElementById('btn-hs-config')!.addEventListener('click', () => {
    soundFX.playUiTap();
    document.getElementById('hs-config-panel')!.classList.toggle('hidden');
  });

  document.getElementById('btn-save-api-url')!.addEventListener('click', () => {
    soundFX.playUiTap();
    const input = document.getElementById('api-url-input') as HTMLInputElement;
    state.apiBaseUrl = input.value.trim().replace(/\/+$/, '');
    saveState(state);
    document.getElementById('hs-config-panel')!.classList.add('hidden');
    void loadHighscores();
  });
}

async function bootstrap(): Promise<void> {
  const deviceId = await resolveDeviceId();
  state = loadSavedState(deviceId);
  soundFX.enabled = state.soundEnabled;

  buildApp();
  showScreen('home');

  // If backend is configured, sync any existing device profile
  if (state.apiBaseUrl) {
    const profile = await fetchPlayerProfile(state.apiBaseUrl, state.deviceId).catch(() => null);
    if (profile) {
      state.planetName = profile.planetName;
      state.nameClaimed = true;
      state.highestMass = maxMass(
        state.highestMass,
        normalizeMass(profile.massM, profile.massE)
      );
      saveState(state);
      refreshHomeSummary();
    }
  }
}

void bootstrap();
