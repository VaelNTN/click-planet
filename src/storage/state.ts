import { Device } from '@capacitor/device';
import { BigMass, START_MASS, maxMass, normalizeMass } from '../math/bigMass';

const STORAGE_KEY = 'click_planet_save_v1';
const DEVICE_KEY = 'click_planet_device_id_v1';

export interface GameState {
  deviceId: string;
  mass: BigMass;
  highestMass: BigMass;
  clickCount: number;
  colorId: number | null;
  planetName: string;
  nameClaimed: boolean;
  soundEnabled: boolean;
  apiBaseUrl: string;
}

function generateFallbackDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `dev-${crypto.randomUUID()}`;
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or restricted webview errors
  }
}

export async function resolveDeviceId(): Promise<string> {
  const cached = safeGetStorage(DEVICE_KEY);
  try {
    const info = await Device.getId();
    if (info?.identifier && info.identifier.trim().length >= 4) {
      const id = `phone-${info.identifier.trim()}`;
      safeSetStorage(DEVICE_KEY, id);
      return id;
    }
  } catch {
    // Web / desktop browser fallback
  }

  if (cached && cached.trim().length >= 4) {
    return cached;
  }
  const fresh = generateFallbackDeviceId();
  safeSetStorage(DEVICE_KEY, fresh);
  return fresh;
}

export function loadSavedState(deviceId: string): GameState {
  const defaultApi = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  const base: GameState = {
    deviceId,
    mass: { ...START_MASS },
    highestMass: { ...START_MASS },
    clickCount: 0,
    colorId: null,
    planetName: '',
    nameClaimed: false,
    soundEnabled: true,
    apiBaseUrl: defaultApi,
  };

  try {
    const raw = safeGetStorage(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    const mass = parsed.mass
      ? normalizeMass(Number(parsed.mass.m), Number(parsed.mass.e))
      : { ...START_MASS };
    const highest = parsed.highestMass
      ? maxMass(mass, normalizeMass(Number(parsed.highestMass.m), Number(parsed.highestMass.e)))
      : { ...mass };
    const rawClicks = Number(parsed.clickCount);
    const clickCount = Number.isFinite(rawClicks) ? Math.max(0, Math.trunc(rawClicks)) : 0;

    return {
      deviceId,
      mass,
      highestMass: highest,
      clickCount,
      colorId:
        typeof parsed.colorId === 'number' &&
        Number.isInteger(parsed.colorId) &&
        parsed.colorId >= 0 &&
        parsed.colorId < 20
          ? parsed.colorId
          : null,
      planetName: typeof parsed.planetName === 'string' ? parsed.planetName : '',
      nameClaimed: Boolean(parsed.nameClaimed),
      soundEnabled: parsed.soundEnabled !== false,
      apiBaseUrl:
        typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim()
          ? parsed.apiBaseUrl.trim().replace(/\/+$/, '')
          : defaultApi,
    };
  } catch {
    return base;
  }
}

export function saveState(state: GameState): void {
  safeSetStorage(STORAGE_KEY, JSON.stringify(state));
}
