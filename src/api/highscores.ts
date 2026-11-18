import { BigMass, normalizeMass } from '../math/bigMass';

export interface HighscoreEntry {
  rank: number;
  deviceId: string;
  planetName: string;
  colorId: number;
  massM: number;
  massE: number;
  updatedAt: string;
}

export interface HighscoresResponse {
  ok: boolean;
  entries: HighscoreEntry[];
  player: HighscoreEntry | null;
}

export interface ClaimNameResult {
  ok: boolean;
  entry?: HighscoreEntry;
  error?: string;
  message?: string;
}

function normalizeUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchGlobalHighscores(
  baseUrl: string,
  deviceId: string,
  limit = 50
): Promise<HighscoresResponse> {
  const clean = normalizeUrl(baseUrl);
  if (!clean) {
    throw new Error('NO_BACKEND_URL');
  }
  const url = `${clean}/api/highscores?limit=${limit}&deviceId=${encodeURIComponent(deviceId)}`;
  const res = await fetchWithTimeout(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }
  return (await res.json()) as HighscoresResponse;
}

export async function fetchPlayerProfile(
  baseUrl: string,
  deviceId: string
): Promise<HighscoreEntry | null> {
  const clean = normalizeUrl(baseUrl);
  if (!clean) return null;
  const res = await fetchWithTimeout(`${clean}/api/player/${encodeURIComponent(deviceId)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { ok: boolean; entry: HighscoreEntry | null };
  return data.entry ?? null;
}

export async function claimUniquePlanetName(
  baseUrl: string,
  payload: {
    deviceId: string;
    planetName: string;
    colorId: number;
    mass: BigMass;
  }
): Promise<ClaimNameResult> {
  const clean = normalizeUrl(baseUrl);
  if (!clean) {
    return {
      ok: false,
      error: 'NO_BACKEND_URL',
      message: 'Offline mode active — saved locally on this device.',
    };
  }

  const normMass = normalizeMass(payload.mass.m, payload.mass.e);

  try {
    const res = await fetchWithTimeout(`${clean}/api/claim-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        planetName: payload.planetName,
        colorId: payload.colorId,
        massM: normMass.m,
        massE: normMass.e,
      }),
    });
    const data = (await res.json().catch(() => null)) as ClaimNameResult | null;
    if (!data) {
      return {
        ok: false,
        error: `HTTP_${res.status}`,
        message: 'Could not reach the online leaderboard right now.',
      };
    }
    return data;
  } catch {
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: 'Could not reach the online leaderboard right now.',
    };
  }
}

export async function submitHighestMass(
  baseUrl: string,
  payload: {
    deviceId: string;
    planetName: string;
    colorId: number;
    mass: BigMass;
  }
): Promise<ClaimNameResult> {
  const clean = normalizeUrl(baseUrl);
  if (!clean || !payload.planetName.trim()) {
    return { ok: false, error: 'SKIPPED' };
  }

  const normMass = normalizeMass(payload.mass.m, payload.mass.e);

  try {
    const res = await fetchWithTimeout(`${clean}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        planetName: payload.planetName,
        colorId: payload.colorId,
        massM: normMass.m,
        massE: normMass.e,
      }),
    });
    const data = (await res.json().catch(() => null)) as ClaimNameResult | null;
    if (!data) {
      return { ok: false, error: `HTTP_${res.status}` };
    }
    return data;
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}
