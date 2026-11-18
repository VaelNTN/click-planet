import './style.css';
import { PLANET_COLORS, getPlanetColor } from './data/planets';
import {
  computeMeteoriteGain,
  computePlanetClickGain,
  formatDeltaShort,
  formatMassParts,
  formatMassString,
  getMassLog10,
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
let colorsReturnScreen: 'home' | 'game' = 'home';
let stage: PlanetStage | null = null;
let syncTimeout: number | null = null;
let scoreDirty = false;
let syncInFlight = false;
let lastScoreSyncAt = 0;
let hsPollInterval: number | null = null;
let hsLoadSeq = 0;
let homeAnimId: number | null = null;
let hsTapCount = 0;
let hsTapTimer: number | null = null;

function renderMassHtml(m: number, e: number): string {
  const parts = formatMassParts({ m, e });
  if (parts.isScientific && parts.mantissa !== undefined && parts.exponent !== undefined) {
    return `${parts.mantissa} × 10<sup>${parts.exponent}</sup> kg`;
  }
  return `${parts.text} kg`;
}

function renderMiniPlanetCanvas(canvas: HTMLCanvasElement, colorId: number, size: number): void {
  if (size <= 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
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
        <p class="game-subtitle">Tap planets &amp; catch meteorites.</p>
        <div id="home-save-pill" class="home-save-pill hidden"></div>
      </div>
      <div class="home-actions">
        <button id="btn-home-play" class="btn btn-primary">Play</button>
        <button id="btn-home-colors" class="btn btn-secondary">Planet Colors</button>
        <button id="btn-home-highscores" class="btn btn-secondary">Leaderboard</button>
      </div>
    </section>

    <!-- 20 PLANET COLORS SCREEN -->
    <section id="screen-colors" class="screen colors-screen hidden">
      <div class="top-nav">
        <button id="btn-colors-back" class="btn btn-small">← Back</button>
        <h2 class="screen-heading">Planet Colors</h2>
        <span style="width:64px"></span>
      </div>
      <p class="colors-subtitle">Pick 1 of 20 planet styles:</p>
      <div id="color-grid" class="color-grid"></div>
    </section>

    <!-- GAME SCREEN -->
    <section id="screen-game" class="screen game-screen hidden">
      <header class="game-header">
        <div class="game-nav-row">
          <button id="btn-game-menu" class="btn btn-small">← Menu</button>
          <div class="game-nav-right">
            <button id="btn-game-colors" class="btn btn-small">Colors</button>
            <button id="btn-game-sound" class="btn btn-small">🔊 On</button>
          </div>
        </div>

        <div class="mass-panel">
          <span class="mass-label">Mass</span>
          <div id="mass-value" class="mass-value">0.01 kg</div>
          <div id="mass-rate-badge" class="mass-rate-badge">First 10 taps: +4–5 kg (0/10)</div>
        </div>
      </header>

      <div class="stage-wrap">
        <canvas id="planet-stage-canvas" class="stage-canvas"></canvas>
      </div>
    </section>

    <!-- LEADERBOARD SCREEN -->
    <section id="screen-highscores" class="screen highscores-screen hidden">
      <div class="top-nav">
        <button id="btn-hs-back" class="btn btn-small">← Back</button>
        <h2 id="hs-heading" class="screen-heading">🏆 Leaderboard</h2>
        <button id="btn-hs-refresh" class="btn btn-small">Refresh</button>
      </div>

      <div class="hs-status-bar">
        <span id="hs-status-text">📱 Offline Mode — Local Highscores</span>
      </div>

      <div id="hs-config-panel" class="hs-config-panel hidden">
        <p class="hs-config-help">Developer Endpoint URL</p>
        <div class="name-input-row">
          <input
            id="api-url-input"
            class="name-input"
            type="url"
            placeholder="https://api.example.com"
          />
          <button id="btn-save-api-url" class="btn btn-claim" type="button">Save</button>
        </div>
      </div>

      <div class="name-claim-box">
        <form id="name-claim-form" class="name-input-row">
          <input
            id="planet-name-input"
            class="name-input"
            type="text"
            maxlength="20"
            autocomplete="off"
            placeholder="Unique planet name..."
          />
          <button id="btn-claim-name" class="btn btn-claim" type="submit">Claim Name</button>
        </form>
        <div id="name-status" class="name-status"></div>
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
  const selectedId = state.colorId ?? 1;

  for (const p of PLANET_COLORS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `color-card${selectedId === p.id ? ' selected' : ''}`;
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
  const selectedId = state.colorId ?? 1;
  const cards = document.querySelectorAll<HTMLButtonElement>('.color-card');
  cards.forEach((c) => {
    c.classList.toggle('selected', Number(c.dataset.colorId) === selectedId);
  });
}

function showScreen(target: ScreenName): void {
  const prevScreen = currentScreen;
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

  if (prevScreen === 'game' && target !== 'game') {
    void flushScoreSync();
  }

  if (target === 'game') {
    stopHomePreview();
    stopHighscorePolling();
    startGameStage();
    updateGameUI();
  } else if (target === 'highscores') {
    stopHomePreview();
    stopGameStage();
    updateNameClaimUI();
    void loadHighscores(false);
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
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let phase = 0;
  let elapsed = 0;
  let last = performance.now();
  const tick = (now: number) => {
    if (currentScreen !== 'home') {
      homeAnimId = null;
      return;
    }
    const rawDt = (now - last) / 1000;
    const dt = Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0.001, rawDt)) : 0.016;
    last = now;
    phase += dt * 0.06;
    elapsed += dt;

    const currentDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (currentDpr !== dpr) {
      dpr = currentDpr;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const planet = getPlanetColor(state.colorId ?? 1);
    const evolution = Math.max(0, getMassLog10(state.highestMass) + 2);
    const baseR = evolution >= 4.2 ? (planet.hasRing ? 38 : 40) : planet.hasRing ? 46 : 56;
    drawPlanet(ctx, size / 2, size / 2, baseR, planet, phase, {
      evolution,
      timeSec: elapsed,
    });

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
  const planet = getPlanetColor(state.colorId ?? 1);

  if (stage) {
    stage.setPlanet(planet);
    stage.setMass(state.mass);
    stage.start();
    return;
  }

  stage = new PlanetStage(
    canvas,
    planet,
    {
      onPlanetTap: () => {
        const { newMass, deltaMass } = computePlanetClickGain(state.mass, state.clickCount);
        state.mass = newMass;
        state.highestMass = maxMass(state.highestMass, newMass);
        state.clickCount += 1;
        saveState(state);
        stage?.setMass(state.mass);
        soundFX.playPlanetTap();
        updateMassDisplay();
        scheduleScoreSync(1600);
        return formatDeltaShort(deltaMass);
      },
      onMeteoriteAbsorb: () => {
        const { newMass, deltaMass } = computeMeteoriteGain(state.mass);
        state.mass = newMass;
        state.highestMass = maxMass(state.highestMass, newMass);
        saveState(state);
        stage?.setMass(state.mass);
        soundFX.playMeteorAbsorb();
        updateMassDisplay();
        scheduleScoreSync(1000);
        return formatDeltaShort(deltaMass);
      },
    },
    state.mass
  );
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
      rateEl.textContent = `First 10 taps: +4–5 kg (${state.clickCount}/10)`;
    } else {
      rateEl.textContent = `+0.01% per tap • Meteors scale up`;
    }
  }
}

function updateGameUI(): void {
  updateMassDisplay();
  const soundBtn = document.getElementById('btn-game-sound')!;
  soundBtn.textContent = state.soundEnabled ? '🔊 On' : '🔇 Off';
}

function updateNameClaimUI(): void {
  const input = document.getElementById('planet-name-input') as HTMLInputElement | null;
  const status = document.getElementById('name-status');
  if (!input || !status) return;

  if (document.activeElement !== input) {
    input.value = state.planetName;
  }

  if (state.planetName && state.nameClaimed) {
    status.className = 'name-status ok';
    status.textContent = `✓ "${state.planetName}" is linked to your device`;
  } else if (state.planetName) {
    status.className = 'name-status';
    status.textContent = state.apiBaseUrl
      ? 'Tap Claim Name to register on the online leaderboard.'
      : 'Saved locally on this device.';
  } else {
    status.className = 'name-status';
    status.textContent = 'Choose a unique planet name for the leaderboard.';
  }
}

function scheduleScoreSync(delayMs: number): void {
  scoreDirty = true;
  if (!state.apiBaseUrl || !state.planetName.trim()) return;

  // Avoid starving sync forever during continuous tapping
  const elapsed = Date.now() - lastScoreSyncAt;
  if (elapsed >= 4500 && !syncInFlight) {
    void flushScoreSync();
    return;
  }

  if (syncTimeout !== null) {
    window.clearTimeout(syncTimeout);
  }
  syncTimeout = window.setTimeout(() => {
    syncTimeout = null;
    void flushScoreSync();
  }, delayMs);
}

async function flushScoreSync(): Promise<void> {
  if (syncTimeout !== null) {
    window.clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (!scoreDirty || syncInFlight || !state.apiBaseUrl || !state.planetName.trim()) {
    return;
  }

  syncInFlight = true;
  lastScoreSyncAt = Date.now();
  const submittedMass = { ...state.highestMass };
  try {
    const res = await submitHighestMass(state.apiBaseUrl, {
      deviceId: state.deviceId,
      planetName: state.planetName,
      colorId: state.colorId ?? 1,
      mass: submittedMass,
    });
    if (res.ok) {
      // Only clear dirty if no newer mass arrived while request was in flight
      if (
        state.highestMass.e === submittedMass.e &&
        state.highestMass.m === submittedMass.m
      ) {
        scoreDirty = false;
      }
    }
  } finally {
    syncInFlight = false;
  }
}

async function handleClaimName(): Promise<void> {
  const input = document.getElementById('planet-name-input') as HTMLInputElement;
  const status = document.getElementById('name-status')!;
  const btn = document.getElementById('btn-claim-name') as HTMLButtonElement;
  const rawName = input.value.trim().replace(/\s+/g, ' ');

  if (rawName.length < 2 || rawName.length > 20 || !/^[a-zA-Z0-9 _-]+$/.test(rawName)) {
    status.className = 'name-status err';
    status.textContent = 'Use 2–20 characters (letters, numbers, space, - or _).';
    return;
  }

  state.planetName = rawName;
  saveState(state);
  refreshHomeSummary();

  if (!state.apiBaseUrl) {
    state.nameClaimed = false;
    saveState(state);
    status.className = 'name-status ok';
    status.textContent = `Saved locally as "${rawName}".`;
    renderHighscoreRows(buildLocalFallbackEntry());
    return;
  }

  btn.disabled = true;
  status.className = 'name-status';
  status.textContent = 'Checking & claiming name...';

  const result = await claimUniquePlanetName(state.apiBaseUrl, {
    deviceId: state.deviceId,
    planetName: rawName,
    colorId: state.colorId ?? 1,
    mass: state.highestMass,
  });

  btn.disabled = false;

  if (result.ok && result.entry) {
    state.planetName = result.entry.planetName;
    state.nameClaimed = true;
    scoreDirty = false;
    saveState(state);
    input.value = result.entry.planetName;
    status.className = 'name-status ok';
    status.textContent = `✓ "${result.entry.planetName}" claimed! (Rank #${result.entry.rank})`;
    refreshHomeSummary();
    if (currentScreen === 'highscores') {
      void loadHighscores(false);
    }
  } else {
    state.nameClaimed = false;
    saveState(state);
    status.className = 'name-status err';
    status.textContent = result.message || 'Name is already taken or unavailable.';
  }
}

async function loadHighscores(isPoll = false): Promise<void> {
  const mySeq = ++hsLoadSeq;
  const statusEl = document.getElementById('hs-status-text')!;
  const apiInput = document.getElementById('api-url-input') as HTMLInputElement;
  if (document.activeElement !== apiInput) {
    apiInput.value = state.apiBaseUrl;
  }

  if (!state.apiBaseUrl) {
    statusEl.textContent = '📱 Offline Mode — Local Highscores';
    renderHighscoreRows(buildLocalFallbackEntry());
    return;
  }

  if (!isPoll) {
    statusEl.textContent = 'Loading leaderboard...';
  }

  try {
    if (state.planetName.trim() && (!isPoll || scoreDirty)) {
      const subRes = await submitHighestMass(state.apiBaseUrl, {
        deviceId: state.deviceId,
        planetName: state.planetName,
        colorId: state.colorId ?? 1,
        mass: state.highestMass,
      });
      if (subRes.ok) {
        scoreDirty = false;
        lastScoreSyncAt = Date.now();
      }
    }

    const res = await fetchGlobalHighscores(state.apiBaseUrl, state.deviceId, 50);
    if (mySeq !== hsLoadSeq || currentScreen !== 'highscores') return;
    statusEl.textContent = `🌐 Online Leaderboard • ${res.entries.length} planets`;
    renderHighscoreRows(res.entries);
  } catch {
    if (mySeq !== hsLoadSeq || currentScreen !== 'highscores') return;
    statusEl.textContent = '📱 Offline Mode — Local Highscores';
    renderHighscoreRows(buildLocalFallbackEntry());
  }
}

function buildLocalFallbackEntry(): HighscoreEntry[] {
  if (!state.planetName && state.clickCount === 0) return [];
  return [
    {
      rank: 1,
      deviceId: state.deviceId,
      planetName: state.planetName || 'Your Planet (Unnamed)',
      colorId: state.colorId ?? 1,
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
        No highscores yet.<br/>
        Tap your planet and claim a unique planet name!
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
    sub.textContent = isMe ? 'Your Device' : getPlanetColor(item.colorId).name;

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
    if (currentScreen === 'highscores' && !document.hidden) {
      void loadHighscores(true);
    }
  }, 5000);
}

function stopHighscorePolling(): void {
  if (hsPollInterval !== null) {
    window.clearInterval(hsPollInterval);
    hsPollInterval = null;
  }
  if (hsTapTimer !== null) {
    window.clearTimeout(hsTapTimer);
    hsTapTimer = null;
  }
  hsTapCount = 0;
}

function wireEvents(): void {
  document.getElementById('btn-home-play')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('game');
  });

  document.getElementById('btn-home-colors')!.addEventListener('click', () => {
    soundFX.playUiTap();
    colorsReturnScreen = 'home';
    showScreen('colors');
  });

  document.getElementById('btn-home-highscores')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('highscores');
  });

  document.getElementById('btn-colors-back')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen(colorsReturnScreen);
  });

  document.getElementById('btn-game-menu')!.addEventListener('click', () => {
    soundFX.playUiTap();
    showScreen('home');
  });

  document.getElementById('btn-game-colors')!.addEventListener('click', () => {
    soundFX.playUiTap();
    colorsReturnScreen = 'game';
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
    void loadHighscores(false);
  });

  document.getElementById('hs-heading')!.addEventListener('click', () => {
    hsTapCount += 1;
    if (hsTapTimer !== null) {
      window.clearTimeout(hsTapTimer);
    }
    if (hsTapCount >= 5) {
      hsTapCount = 0;
      hsTapTimer = null;
      soundFX.playUiTap();
      document.getElementById('hs-config-panel')!.classList.toggle('hidden');
      return;
    }
    hsTapTimer = window.setTimeout(() => {
      hsTapCount = 0;
      hsTapTimer = null;
    }, 2000);
  });

  document.getElementById('btn-save-api-url')!.addEventListener('click', () => {
    soundFX.playUiTap();
    const input = document.getElementById('api-url-input') as HTMLInputElement;
    state.apiBaseUrl = input.value.trim().replace(/\/+$/, '');
    saveState(state);
    document.getElementById('hs-config-panel')!.classList.add('hidden');
    updateNameClaimUI();
    void loadHighscores(false);
  });

  // Flush pending score sync when app is backgrounded, closed, or regains network
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && scoreDirty) {
      void flushScoreSync();
    }
  });

  window.addEventListener('pagehide', () => {
    if (scoreDirty) {
      void flushScoreSync();
    }
  });

  window.addEventListener('online', () => {
    if (scoreDirty) {
      void flushScoreSync();
    }
  });
}

async function bootstrap(): Promise<void> {
  const deviceId = await resolveDeviceId();
  state = loadSavedState(deviceId);
  soundFX.enabled = state.soundEnabled;

  buildApp();
  showScreen('home');

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
      updateNameClaimUI();
    }
  }
}

void bootstrap();
