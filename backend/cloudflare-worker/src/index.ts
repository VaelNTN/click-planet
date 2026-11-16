import { DurableObject } from 'cloudflare:workers';

export interface Env {
  LEADERBOARD: DurableObjectNamespace<LeaderboardDO>;
}

interface ScoreRow {
  device_id: string;
  planet_name: string;
  name_lower: string;
  color_id: number;
  mass_m: number;
  mass_e: number;
  updated_at: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

function normalizeMass(m: number, e: number): { m: number; e: number } {
  if (!Number.isFinite(m) || !Number.isFinite(e) || m <= 0) {
    return { m: 1, e: -2 };
  }
  let nm = m;
  let ne = Math.trunc(e);
  let guard = 0;
  while (nm >= 10 && guard < 1000) {
    nm /= 10;
    ne += 1;
    guard++;
  }
  while (nm < 1 && guard < 1000) {
    nm *= 10;
    ne -= 1;
    guard++;
  }
  return { m: nm, e: ne };
}

function isMassGreater(m1: number, e1: number, m2: number, e2: number): boolean {
  if (e1 !== e2) return e1 > e2;
  return m1 > m2;
}

function validatePlanetName(raw: unknown): { ok: true; name: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'Ongeldige planeetnaam.' };
  }
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 20) {
    return { ok: false, message: 'Planeetnaam moet tussen 2 en 20 tekens zijn.' };
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) {
    return { ok: false, message: 'Gebruik alleen letters, cijfers, spaties, - of _.' };
  }
  return { ok: true, name: trimmed };
}

export class LeaderboardDO extends DurableObject<Env> {
  private initialized = false;

  private ensureSchema(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (
        device_id TEXT PRIMARY KEY,
        planet_name TEXT NOT NULL,
        name_lower TEXT NOT NULL UNIQUE,
        color_id INTEGER NOT NULL DEFAULT 0,
        mass_m REAL NOT NULL DEFAULT 1.0,
        mass_e INTEGER NOT NULL DEFAULT -2,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_players_mass ON players (mass_e DESC, mass_m DESC);
    `);
    this.initialized = true;
  }

  private getRank(massE: number, massM: number): number {
    const res = this.ctx.storage.sql
      .exec<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM players WHERE mass_e > ? OR (mass_e = ? AND mass_m > ?)`,
        massE,
        massE,
        massM
      )
      .one();
    return (res?.cnt ?? 0) + 1;
  }

  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && path === '/health') {
      return jsonResponse({ ok: true, backend: 'cloudflare' });
    }

    if (request.method === 'GET' && path === '/api/highscores') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
      const deviceId = url.searchParams.get('deviceId')?.trim() || '';

      const rows = this.ctx.storage.sql
        .exec<ScoreRow>(
          `SELECT device_id, planet_name, name_lower, color_id, mass_m, mass_e, updated_at
           FROM players
           ORDER BY mass_e DESC, mass_m DESC, updated_at ASC
           LIMIT ?`,
          limit
        )
        .toArray();

      const entries = rows.map((row, idx) => ({
        rank: idx + 1,
        deviceId: row.device_id,
        planetName: row.planet_name,
        colorId: row.color_id,
        massM: row.mass_m,
        massE: row.mass_e,
        updatedAt: row.updated_at,
      }));

      let player = null;
      if (deviceId) {
        const found = this.ctx.storage.sql
          .exec<ScoreRow>(`SELECT * FROM players WHERE device_id = ?`, deviceId)
          .toArray()[0];
        if (found) {
          player = {
            rank: this.getRank(found.mass_e, found.mass_m),
            deviceId: found.device_id,
            planetName: found.planet_name,
            colorId: found.color_id,
            massM: found.mass_m,
            massE: found.mass_e,
            updatedAt: found.updated_at,
          };
        }
      }

      return jsonResponse({ ok: true, entries, player });
    }

    if (request.method === 'GET' && path.startsWith('/api/player/')) {
      const deviceId = decodeURIComponent(path.slice('/api/player/'.length)).trim();
      if (!deviceId) {
        return jsonResponse({ ok: false, error: 'MISSING_DEVICE_ID' }, 400);
      }
      const found = this.ctx.storage.sql
        .exec<ScoreRow>(`SELECT * FROM players WHERE device_id = ?`, deviceId)
        .toArray()[0];
      if (!found) {
        return jsonResponse({ ok: true, entry: null });
      }
      return jsonResponse({
        ok: true,
        entry: {
          rank: this.getRank(found.mass_e, found.mass_m),
          deviceId: found.device_id,
          planetName: found.planet_name,
          colorId: found.color_id,
          massM: found.mass_m,
          massE: found.mass_e,
          updatedAt: found.updated_at,
        },
      });
    }

    if (request.method === 'POST' && path === '/api/claim-name') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.deviceId !== 'string' || body.deviceId.trim().length < 4) {
        return jsonResponse({ ok: false, error: 'INVALID_DEVICE_ID', message: 'Ongeldig toestel-ID.' }, 400);
      }
      const deviceId = body.deviceId.trim().slice(0, 128);
      const nameCheck = validatePlanetName(body.planetName);
      if (!nameCheck.ok) {
        return jsonResponse({ ok: false, error: 'INVALID_NAME', message: nameCheck.message }, 400);
      }

      const planetName = nameCheck.name;
      const nameLower = planetName.toLowerCase();
      const colorId = Number.isInteger(body.colorId) ? Number(body.colorId) : 0;
      const incomingMass = normalizeMass(Number(body.massM ?? 1), Number(body.massE ?? -2));
      const now = new Date().toISOString();

      const owner = this.ctx.storage.sql
        .exec<{ device_id: string }>(`SELECT device_id FROM players WHERE name_lower = ?`, nameLower)
        .toArray()[0];

      if (owner && owner.device_id !== deviceId) {
        return jsonResponse(
          {
            ok: false,
            error: 'NAME_TAKEN',
            message: 'Deze planeetnaam is al bezet door een andere telefoon!',
          },
          409
        );
      }

      const existing = this.ctx.storage.sql
        .exec<ScoreRow>(`SELECT * FROM players WHERE device_id = ?`, deviceId)
        .toArray()[0];

      let finalM = incomingMass.m;
      let finalE = incomingMass.e;
      if (existing && !isMassGreater(incomingMass.m, incomingMass.e, existing.mass_m, existing.mass_e)) {
        finalM = existing.mass_m;
        finalE = existing.mass_e;
      }

      if (existing) {
        this.ctx.storage.sql.exec(
          `UPDATE players SET planet_name = ?, name_lower = ?, color_id = ?, mass_m = ?, mass_e = ?, updated_at = ? WHERE device_id = ?`,
          planetName,
          nameLower,
          colorId,
          finalM,
          finalE,
          now,
          deviceId
        );
      } else {
        this.ctx.storage.sql.exec(
          `INSERT INTO players (device_id, planet_name, name_lower, color_id, mass_m, mass_e, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          deviceId,
          planetName,
          nameLower,
          colorId,
          finalM,
          finalE,
          now
        );
      }

      return jsonResponse({
        ok: true,
        entry: {
          rank: this.getRank(finalE, finalM),
          deviceId,
          planetName,
          colorId,
          massM: finalM,
          massE: finalE,
          updatedAt: now,
        },
      });
    }

    if (request.method === 'POST' && path === '/api/score') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.deviceId !== 'string' || body.deviceId.trim().length < 4) {
        return jsonResponse({ ok: false, error: 'INVALID_DEVICE_ID' }, 400);
      }
      const deviceId = body.deviceId.trim().slice(0, 128);
      const colorId = Number.isInteger(body.colorId) ? Number(body.colorId) : 0;
      const incoming = normalizeMass(Number(body.massM ?? 1), Number(body.massE ?? -2));
      const now = new Date().toISOString();

      const existing = this.ctx.storage.sql
        .exec<ScoreRow>(`SELECT * FROM players WHERE device_id = ?`, deviceId)
        .toArray()[0];

      if (!existing) {
        // Need a valid unique name to appear on global highscores
        const nameCheck = validatePlanetName(body.planetName);
        if (!nameCheck.ok) {
          return jsonResponse(
            { ok: false, error: 'NAME_REQUIRED', message: 'Vul eerst een unieke planeetnaam in.' },
            400
          );
        }
        const nameLower = nameCheck.name.toLowerCase();
        const owner = this.ctx.storage.sql
          .exec<{ device_id: string }>(`SELECT device_id FROM players WHERE name_lower = ?`, nameLower)
          .toArray()[0];
        if (owner) {
          return jsonResponse(
            { ok: false, error: 'NAME_TAKEN', message: 'Deze planeetnaam is al bezet door een andere telefoon!' },
            409
          );
        }
        this.ctx.storage.sql.exec(
          `INSERT INTO players (device_id, planet_name, name_lower, color_id, mass_m, mass_e, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          deviceId,
          nameCheck.name,
          nameLower,
          colorId,
          incoming.m,
          incoming.e,
          now
        );
        return jsonResponse({
          ok: true,
          entry: {
            rank: this.getRank(incoming.e, incoming.m),
            deviceId,
            planetName: nameCheck.name,
            colorId,
            massM: incoming.m,
            massE: incoming.e,
            updatedAt: now,
          },
        });
      }

      const shouldUpdateMass = isMassGreater(incoming.m, incoming.e, existing.mass_m, existing.mass_e);
      const finalM = shouldUpdateMass ? incoming.m : existing.mass_m;
      const finalE = shouldUpdateMass ? incoming.e : existing.mass_e;

      this.ctx.storage.sql.exec(
        `UPDATE players SET color_id = ?, mass_m = ?, mass_e = ?, updated_at = ? WHERE device_id = ?`,
        colorId,
        finalM,
        finalE,
        shouldUpdateMass ? now : existing.updated_at,
        deviceId
      );

      return jsonResponse({
        ok: true,
        entry: {
          rank: this.getRank(finalE, finalM),
          deviceId,
          planetName: existing.planet_name,
          colorId,
          massM: finalM,
          massE: finalE,
          updatedAt: shouldUpdateMass ? now : existing.updated_at,
        },
      });
    }

    return jsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const id = env.LEADERBOARD.idFromName('global-click-planet-v1');
    const stub = env.LEADERBOARD.get(id);
    return stub.fetch(request);
  },
};
