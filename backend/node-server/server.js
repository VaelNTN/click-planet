import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'highscores.json');
const PORT = Number(process.env.PORT || 3000);

fs.mkdirSync(DATA_DIR, { recursive: true });

/** @type {Map<string, { deviceId: string, planetName: string, nameLower: string, colorId: number, massM: number, massE: number, updatedAt: string }>} */
const playersByDevice = new Map();
/** @type {Map<string, string>} */
const deviceByNameLower = new Map();

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      for (const row of raw) {
        if (!row?.deviceId || !row?.planetName) continue;
        const nameLower = row.planetName.toLowerCase();
        playersByDevice.set(row.deviceId, { ...row, nameLower });
        deviceByNameLower.set(nameLower, row.deviceId);
      }
    }
  } catch (err) {
    console.error('Failed to load highscores.json:', err);
  }
}

function saveData() {
  const arr = Array.from(playersByDevice.values());
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(arr, null, 2), 'utf8');
  fs.renameSync(tmpFile, DATA_FILE);
}

function normalizeMass(m, e) {
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

function isMassGreater(m1, e1, m2, e2) {
  if (e1 !== e2) return e1 > e2;
  return m1 > m2;
}

function validatePlanetName(raw) {
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

function getSortedEntries() {
  return Array.from(playersByDevice.values()).sort((a, b) => {
    if (a.massE !== b.massE) return b.massE - a.massE;
    if (a.massM !== b.massM) return b.massM - a.massM;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
}

function toPublicEntry(row, rank) {
  return {
    rank,
    deviceId: row.deviceId,
    planetName: row.planetName,
    colorId: row.colorId,
    massM: row.massM,
    massE: row.massE,
    updatedAt: row.updatedAt,
  };
}

loadData();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, backend: 'node' });
});

app.get('/api/highscores', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
  const sorted = getSortedEntries();
  const entries = sorted.slice(0, limit).map((row, i) => toPublicEntry(row, i + 1));

  let player = null;
  if (deviceId) {
    const idx = sorted.findIndex((r) => r.deviceId === deviceId);
    if (idx !== -1) {
      player = toPublicEntry(sorted[idx], idx + 1);
    }
  }

  res.json({ ok: true, entries, player });
});

app.get('/api/player/:deviceId', (req, res) => {
  const deviceId = String(req.params.deviceId || '').trim();
  if (!deviceId) {
    return res.status(400).json({ ok: false, error: 'MISSING_DEVICE_ID' });
  }
  const sorted = getSortedEntries();
  const idx = sorted.findIndex((r) => r.deviceId === deviceId);
  if (idx === -1) {
    return res.json({ ok: true, entry: null });
  }
  return res.json({ ok: true, entry: toPublicEntry(sorted[idx], idx + 1) });
});

app.post('/api/claim-name', (req, res) => {
  const body = req.body || {};
  if (typeof body.deviceId !== 'string' || body.deviceId.trim().length < 4) {
    return res.status(400).json({ ok: false, error: 'INVALID_DEVICE_ID', message: 'Ongeldig toestel-ID.' });
  }
  const deviceId = body.deviceId.trim().slice(0, 128);
  const nameCheck = validatePlanetName(body.planetName);
  if (!nameCheck.ok) {
    return res.status(400).json({ ok: false, error: 'INVALID_NAME', message: nameCheck.message });
  }

  const planetName = nameCheck.name;
  const nameLower = planetName.toLowerCase();
  const ownerDeviceId = deviceByNameLower.get(nameLower);
  if (ownerDeviceId && ownerDeviceId !== deviceId) {
    return res.status(409).json({
      ok: false,
      error: 'NAME_TAKEN',
      message: 'Deze planeetnaam is al bezet door een andere telefoon!',
    });
  }

  const existing = playersByDevice.get(deviceId);
  if (existing && existing.nameLower !== nameLower) {
    deviceByNameLower.delete(existing.nameLower);
  }

  const incoming = normalizeMass(Number(body.massM ?? 1), Number(body.massE ?? -2));
  let finalM = incoming.m;
  let finalE = incoming.e;
  if (existing && !isMassGreater(incoming.m, incoming.e, existing.mass_m ?? existing.massM, existing.mass_e ?? existing.massE)) {
    finalM = existing.massM;
    finalE = existing.massE;
  }

  const row = {
    deviceId,
    planetName,
    nameLower,
    colorId: Number.isInteger(body.colorId) ? Number(body.colorId) : (existing?.colorId ?? 0),
    massM: finalM,
    massE: finalE,
    updatedAt: new Date().toISOString(),
  };

  playersByDevice.set(deviceId, row);
  deviceByNameLower.set(nameLower, deviceId);
  saveData();

  const sorted = getSortedEntries();
  const rank = sorted.findIndex((r) => r.deviceId === deviceId) + 1;
  res.json({ ok: true, entry: toPublicEntry(row, rank) });
});

app.post('/api/score', (req, res) => {
  const body = req.body || {};
  if (typeof body.deviceId !== 'string' || body.deviceId.trim().length < 4) {
    return res.status(400).json({ ok: false, error: 'INVALID_DEVICE_ID' });
  }
  const deviceId = body.deviceId.trim().slice(0, 128);
  const colorId = Number.isInteger(body.colorId) ? Number(body.colorId) : 0;
  const incoming = normalizeMass(Number(body.massM ?? 1), Number(body.massE ?? -2));
  const now = new Date().toISOString();

  const existing = playersByDevice.get(deviceId);
  if (!existing) {
    const nameCheck = validatePlanetName(body.planetName);
    if (!nameCheck.ok) {
      return res.status(400).json({
        ok: false,
        error: 'NAME_REQUIRED',
        message: 'Vul eerst een unieke planeetnaam in.',
      });
    }
    const nameLower = nameCheck.name.toLowerCase();
    if (deviceByNameLower.has(nameLower)) {
      return res.status(409).json({
        ok: false,
        error: 'NAME_TAKEN',
        message: 'Deze planeetnaam is al bezet door een andere telefoon!',
      });
    }
    const row = {
      deviceId,
      planetName: nameCheck.name,
      nameLower,
      colorId,
      massM: incoming.m,
      massE: incoming.e,
      updatedAt: now,
    };
    playersByDevice.set(deviceId, row);
    deviceByNameLower.set(nameLower, deviceId);
    saveData();
    const rank = getSortedEntries().findIndex((r) => r.deviceId === deviceId) + 1;
    return res.json({ ok: true, entry: toPublicEntry(row, rank) });
  }

  const shouldUpdateMass = isMassGreater(incoming.m, incoming.e, existing.massM, existing.massE);
  existing.colorId = colorId;
  if (shouldUpdateMass) {
    existing.massM = incoming.m;
    existing.massE = incoming.e;
    existing.updatedAt = now;
  }
  saveData();

  const rank = getSortedEntries().findIndex((r) => r.deviceId === deviceId) + 1;
  res.json({ ok: true, entry: toPublicEntry(existing, rank) });
});

app.listen(PORT, () => {
  console.log(`Click Planet Node server running on http://0.0.0.0:${PORT}`);
});
