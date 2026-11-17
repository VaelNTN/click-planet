import { BigMass } from '../math/bigMass';

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
  const res = await fetch(url, { method: 'GET' });
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
  const res = await fetch(`${clean}/api/player/${encodeURIComponent(deviceId)}`);
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

  try {
    const res = await fetch(`${clean}/api/claim-name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        planetName: payload.planetName,
        colorId: payload.colorId,
        massM: payload.mass.m,
        massE: payload.mass.e,
      }),
    });
    const data = (await res.json()) as ClaimNameResult;
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

  try {
    const res = await fetch(`${clean}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: payload.deviceId,
        planetName: payload.planetName,
        colorId: payload.colorId,
        massM: payload.mass.m,
        massE: payload.mass.e,
      }),
    });
    return (await res.json()) as ClaimNameResult;
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}
