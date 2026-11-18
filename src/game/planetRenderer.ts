import { PlanetColor } from '../data/planets';

export interface PlanetDrawOptions {
  /** Mass evolution metric: 0 at 0.01 kg, ~2.6 at 4.5 kg, ~5 at 1,000 kg, ~8 at 10^6 kg */
  evolution?: number;
  /** Transient tap / meteorite energy flash in [0, 1] */
  energy?: number;
  /** Continuous elapsed time in seconds for orbital motion */
  timeSec?: number;
}

interface DustSpec {
  angleOffset: number;
  orbitScale: number;
  speed: number;
  size: number;
  alpha: number;
  yJitter: number;
  useAccent: boolean;
  isChunk: boolean;
  chunkRot: number;
}

interface MoonSpec {
  unlockEvo: number;
  orbitRx: number;
  orbitRy: number;
  tilt: number;
  speed: number;
  phaseOffset: number;
  sizeRatio: number;
  tint: 'silver' | 'accent' | 'gold';
}

interface CraftSpec {
  kind: 'probe' | 'satellite' | 'station';
  unlockEvo: number;
  orbitRx: number;
  orbitRy: number;
  tilt: number;
  speed: number;
  phaseOffset: number;
  scaleRatio: number;
  blinkFreq: number;
  blinkColor: string;
}

// Precomputed deterministic ring dust & rocky moonlet/ice chunks (zero per-frame allocations)
const DUST_SPECS: DustSpec[] = Array.from({ length: 34 }, (_, i) => {
  const s1 = Math.sin(i * 12.9898) * 43758.5453;
  const s2 = Math.sin(i * 78.233 + 1.7) * 24634.6345;
  const r1 = s1 - Math.floor(s1);
  const r2 = s2 - Math.floor(s2);
  const isChunk = i % 5 === 0;
  return {
    angleOffset: (i / 34) * Math.PI * 2 + r1 * 0.35,
    orbitScale: 1.32 + r1 * 0.44,
    speed: 0.3 + r2 * 0.26,
    size: isChunk ? 1.8 + r1 * 1.9 : 0.85 + r1 * 1.5,
    alpha: isChunk ? 0.82 : 0.36 + r2 * 0.52,
    yJitter: (r1 - 0.5) * 0.09,
    useAccent: i % 3 !== 0,
    isChunk,
    chunkRot: r2 * Math.PI * 2,
  };
});

const MOON_SPECS: MoonSpec[] = [
  {
    unlockEvo: 4.5,
    orbitRx: 1.58,
    orbitRy: 0.43,
    tilt: -0.24,
    speed: 0.52,
    phaseOffset: 0.4,
    sizeRatio: 0.135,
    tint: 'silver',
  },
  {
    unlockEvo: 7.2,
    orbitRx: 1.86,
    orbitRy: 0.52,
    tilt: 0.31,
    speed: -0.36,
    phaseOffset: 2.6,
    sizeRatio: 0.11,
    tint: 'accent',
  },
  {
    unlockEvo: 10.5,
    orbitRx: 2.08,
    orbitRy: 0.58,
    tilt: -0.45,
    speed: 0.26,
    phaseOffset: 4.5,
    sizeRatio: 0.095,
    tint: 'gold',
  },
];

const CRAFT_SPECS: CraftSpec[] = [
  {
    kind: 'probe',
    unlockEvo: 2.1,
    orbitRx: 1.46,
    orbitRy: 0.38,
    tilt: 0.22,
    speed: 0.72,
    phaseOffset: 1.15,
    scaleRatio: 0.13,
    blinkFreq: 3.4,
    blinkColor: '#fb7185',
  },
  {
    kind: 'satellite',
    unlockEvo: 3.8,
    orbitRx: 1.72,
    orbitRy: 0.46,
    tilt: -0.34,
    speed: -0.48,
    phaseOffset: 3.8,
    scaleRatio: 0.125,
    blinkFreq: 2.5,
    blinkColor: '#34d399',
  },
  {
    kind: 'station',
    unlockEvo: 6.2,
    orbitRx: 1.94,
    orbitRy: 0.5,
    tilt: 0.12,
    speed: 0.32,
    phaseOffset: 5.3,
    scaleRatio: 0.155,
    blinkFreq: 2.0,
    blinkColor: '#38bdf8',
  },
];

export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  rotationPhase: number,
  options?: PlanetDrawOptions
): void {
  if (
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !Number.isFinite(radius) ||
    radius <= 0.5
  ) {
    return;
  }

  const evolution = Math.max(0, options?.evolution ?? 0);
  const energy = Math.max(0, Math.min(1, options?.energy ?? 0));
  const timeSec = options?.timeSec ?? rotationPhase * 22;

  ctx.save();

  // 1. Dynamic multi-layered atmospheric halo (grows and brightens with mass & tap energy)
  const evoFactor = Math.min(1, evolution / 12);
  const pulseBreath = 1 + Math.sin(timeSec * 1.8) * 0.025 + energy * 0.12;
  const outerHaloRadius = radius * (1.42 + evoFactor * 0.34) * pulseBreath;

  const glowGrad = ctx.createRadialGradient(
    cx,
    cy,
    radius * 0.72,
    cx,
    cy,
    outerHaloRadius
  );
  glowGrad.addColorStop(0, planet.glow);
  if (evoFactor > 0.12 || energy > 0.05) {
    glowGrad.addColorStop(0.52, planet.glow);
  }
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.globalAlpha = 0.8 + evoFactor * 0.2 + energy * 0.2;
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, outerHaloRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Subtle inner corona ring at higher evolution or tap energy
  if (evoFactor > 0.22 || energy > 0.08) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.65, evoFactor * 0.28 + energy * 0.42);
    ctx.strokeStyle = planet.accent;
    ctx.lineWidth = Math.max(1.2, radius * (0.03 + energy * 0.04));
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1.06 + energy * 0.07), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Back half of orbital dust/chunks, moons, and spacecraft (behind planet)
  drawOrbitalDust(ctx, cx, cy, radius, planet, evolution, timeSec, true);
  drawOrbitingMoons(ctx, cx, cy, radius, planet, evolution, timeSec, true);
  drawOrbitingCraft(ctx, cx, cy, radius, planet, evolution, timeSec, true);

  // Back half of planetary ring if planet has rings
  if (planet.hasRing) {
    drawRingHalf(ctx, cx, cy, radius, planet, true, timeSec);
  }

  // 3. Main sphere clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  // Base 3D spherical gradient (lit from top-left)
  const sphereGrad = ctx.createRadialGradient(
    cx - radius * 0.34,
    cy - radius * 0.34,
    radius * 0.1,
    cx + radius * 0.14,
    cy + radius * 0.14,
    radius * 1.28
  );
  sphereGrad.addColorStop(0, planet.accent);
  sphereGrad.addColorStop(0.32, planet.primary);
  sphereGrad.addColorStop(1, planet.secondary);
  ctx.fillStyle = sphereGrad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Multi-layered surface pattern details with gentle horizontal wrap/rotation
  drawSurfacePattern(ctx, cx, cy, radius, planet, rotationPhase, timeSec);

  // Shimmering ocean / ice / atmospheric specular sheen
  if (planet.pattern === 'continents' || planet.pattern === 'ice') {
    const sheenGrad = ctx.createRadialGradient(
      cx - radius * 0.36,
      cy - radius * 0.32,
      radius * 0.02,
      cx - radius * 0.36,
      cy - radius * 0.32,
      radius * 0.55
    );
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
    sheenGrad.addColorStop(0.45, 'rgba(186, 230, 253, 0.1)');
    sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.36, cy - radius * 0.32, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drifting atmospheric cloud layer for terrestrial, storm, and banded worlds
  if (
    radius >= 22 &&
    (planet.pattern === 'continents' ||
      planet.pattern === 'swirl' ||
      planet.pattern === 'bands')
  ) {
    drawAtmosphericClouds(ctx, cx, cy, radius, rotationPhase * 1.38 + timeSec * 0.008);
  }

  // Specular atmosphere rim + terminator shadow
  const shadowGrad = ctx.createRadialGradient(
    cx - radius * 0.38,
    cy - radius * 0.38,
    radius * 0.42,
    cx,
    cy,
    radius * 1.04
  );
  shadowGrad.addColorStop(0, `rgba(255, 255, 255, ${0.18 + energy * 0.14})`);
  shadowGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  shadowGrad.addColorStop(0.86, 'rgba(2, 6, 23, 0.42)');
  shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0.72)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Atmospheric aurora limb glow for evolved planets
  if (evolution >= 8) {
    const auroraAlpha = Math.min(0.45, (evolution - 8) * 0.06) + energy * 0.15;
    ctx.strokeStyle = planet.accent;
    ctx.globalAlpha = auroraAlpha;
    ctx.lineWidth = Math.max(2, radius * 0.08);
    ctx.lineCap = 'round';
    const arcSpin = timeSec * 0.35;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.92, -2.5 + Math.sin(arcSpin) * 0.2, -1.2 + Math.sin(arcSpin) * 0.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Crisp subtle atmospheric rim highlight
  ctx.strokeStyle = energy > 0.1 ? planet.accent : 'rgba(255, 255, 255, 0.28)';
  ctx.globalAlpha = 0.3 + energy * 0.45;
  ctx.lineWidth = Math.max(1, radius * 0.028);
  ctx.beginPath();
  ctx.arc(cx, cy, radius - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // 4. Front half of planetary ring
  if (planet.hasRing) {
    drawRingHalf(ctx, cx, cy, radius, planet, false, timeSec);
  }

  // 5. Front half of orbital dust/chunks, moons, and spacecraft (in front of planet)
  drawOrbitalDust(ctx, cx, cy, radius, planet, evolution, timeSec, false);
  drawOrbitingMoons(ctx, cx, cy, radius, planet, evolution, timeSec, false);
  drawOrbitingCraft(ctx, cx, cy, radius, planet, evolution, timeSec, false);

  ctx.restore();
}

function drawOrbitalDust(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  evolution: number,
  timeSec: number,
  isBack: boolean
): void {
  if (evolution < 2.6 || radius < 26) return;
  const maxDust = Math.min(DUST_SPECS.length, Math.floor((evolution - 2.1) * 3.8));
  if (maxDust <= 0) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.24);

  for (let i = 0; i < maxDust; i++) {
    const d = DUST_SPECS[i];
    const angle = d.angleOffset + timeSec * d.speed;
    const sinA = Math.sin(angle);
    const behind = sinA < 0;
    if (behind !== isBack) continue;

    const rx = radius * d.orbitScale;
    const ry = radius * (d.orbitScale * 0.24 + d.yJitter);
    const px = Math.cos(angle) * rx;
    const py = sinA * ry;
    const depthAlpha = behind ? 0.45 : 0.95;
    const sz = Math.max(0.9, (radius / 90) * d.size);

    ctx.globalAlpha = d.alpha * depthAlpha;
    if (d.isChunk) {
      // Crisp rocky moonlet / ice chunk polygon
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(d.chunkRot + timeSec * 0.6);
      ctx.fillStyle = d.useAccent ? planet.accent : '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(-sz * 1.1, -sz * 0.35);
      ctx.lineTo(sz * 0.35, -sz * 1.05);
      ctx.lineTo(sz * 1.15, sz * 0.2);
      ctx.lineTo(-sz * 0.25, sz * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = d.useAccent ? planet.accent : '#f8fafc';
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawOrbitingMoons(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  evolution: number,
  timeSec: number,
  isBack: boolean
): void {
  if (radius < 24) return;

  for (const moon of MOON_SPECS) {
    if (evolution < moon.unlockEvo) continue;
    const fadeIn = Math.min(1, (evolution - moon.unlockEvo + 0.4) * 0.9);
    const angle = moon.phaseOffset + timeSec * moon.speed;
    const sinA = Math.sin(angle);
    const behind = sinA < 0;
    if (behind !== isBack) continue;

    const cosT = Math.cos(moon.tilt);
    const sinT = Math.sin(moon.tilt);
    const lx = Math.cos(angle) * radius * moon.orbitRx;
    const ly = sinA * radius * moon.orbitRy;

    const mx = cx + lx * cosT - ly * sinT;
    const my = cy + lx * sinT + ly * cosT;
    const mr = Math.max(3.2, radius * moon.sizeRatio * fadeIn);

    ctx.save();
    ctx.globalAlpha = (behind ? 0.74 : 1) * fadeIn;

    const primaryCol =
      moon.tint === 'gold'
        ? '#fde047'
        : moon.tint === 'accent'
        ? planet.accent
        : '#e2e8f0';
    const darkCol =
      moon.tint === 'gold'
        ? '#854d0e'
        : moon.tint === 'accent'
        ? planet.secondary
        : '#475569';

    // Faint moon glow
    const mGlow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.1);
    mGlow.addColorStop(0, primaryCol);
    mGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mGlow;
    ctx.globalAlpha *= 0.35;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Shaded moon sphere
    ctx.globalAlpha = (behind ? 0.8 : 1) * fadeIn;
    const mGrad = ctx.createRadialGradient(
      mx - mr * 0.35,
      my - mr * 0.35,
      mr * 0.1,
      mx + mr * 0.15,
      my + mr * 0.15,
      mr * 1.15
    );
    mGrad.addColorStop(0, '#ffffff');
    mGrad.addColorStop(0.42, primaryCol);
    mGrad.addColorStop(1, darkCol);
    ctx.fillStyle = mGrad;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();

    // Detailed 3D craters on moon
    const moonCraters = [
      { ox: 0.24, oy: 0.18, r: 0.25 },
      { ox: -0.28, oy: -0.15, r: 0.18 },
      { ox: -0.05, oy: 0.36, r: 0.14 },
    ];
    for (const mc of moonCraters) {
      const mcx = mx + mc.ox * mr;
      const mcy = my + mc.oy * mr;
      const mcr = mc.r * mr;
      ctx.fillStyle = darkCol;
      ctx.globalAlpha = 0.45 * fadeIn;
      ctx.beginPath();
      ctx.arc(mcx, mcy, mcr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = Math.max(0.6, mcr * 0.25);
      ctx.beginPath();
      ctx.arc(mcx, mcy, mcr * 0.92, 0.3, 2.4);
      ctx.stroke();
    }

    // Moon rim highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = Math.max(0.7, mr * 0.08);
    ctx.beginPath();
    ctx.arc(mx, my, mr - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

function drawOrbitingCraft(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  evolution: number,
  timeSec: number,
  isBack: boolean
): void {
  if (radius < 26) return;

  for (const craft of CRAFT_SPECS) {
    if (evolution < craft.unlockEvo) continue;
    const fadeIn = Math.min(1, (evolution - craft.unlockEvo + 0.35) * 1.1);
    const angle = craft.phaseOffset + timeSec * craft.speed;
    const sinA = Math.sin(angle);
    const behind = sinA < 0;
    if (behind !== isBack) continue;

    const cosT = Math.cos(craft.tilt);
    const sinT = Math.sin(craft.tilt);
    const lx = Math.cos(angle) * radius * craft.orbitRx;
    const ly = sinA * radius * craft.orbitRy;
    const px = cx + lx * cosT - ly * sinT;
    const py = cy + lx * sinT + ly * cosT;

    // Velocity tangent direction for realistic craft orientation
    const vxLocal = -Math.sin(angle) * craft.orbitRx * craft.speed;
    const vyLocal = Math.cos(angle) * craft.orbitRy * craft.speed;
    const vx = vxLocal * cosT - vyLocal * sinT;
    const vy = vxLocal * sinT + vyLocal * cosT;
    const heading = Math.atan2(vy, vx);

    const depthScale = behind ? 0.86 : 1.06;
    const s = Math.max(4.5, radius * craft.scaleRatio * depthScale * fadeIn);
    const blinkOn = Math.sin(timeSec * craft.blinkFreq * Math.PI) > 0.25;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(heading);
    ctx.globalAlpha = (behind ? 0.78 : 1) * fadeIn;

    if (craft.kind === 'probe') {
      drawSpaceProbe(ctx, s, blinkOn, craft.blinkColor);
    } else if (craft.kind === 'satellite') {
      drawRelaySatellite(ctx, s, blinkOn, craft.blinkColor, planet.accent);
    } else {
      drawOrbitalStation(ctx, s, blinkOn, craft.blinkColor, timeSec);
    }

    ctx.restore();
  }
}

function drawSpaceProbe(
  ctx: CanvasRenderingContext2D,
  s: number,
  blinkOn: boolean,
  blinkColor: string
): void {
  // Twin blue solar-panel wings with grid lines
  const wingW = s * 0.46;
  const wingH = s * 0.95;
  const wingGap = s * 0.28;

  for (const dir of [-1, 1]) {
    const wy = dir < 0 ? -wingGap - wingH : wingGap;

    // Wing strut
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, dir * s * 0.18);
    ctx.lineTo(0, dir * wingGap);
    ctx.stroke();

    // Solar panel gradient
    const panelGrad = ctx.createLinearGradient(-wingW / 2, wy, wingW / 2, wy + wingH);
    panelGrad.addColorStop(0, '#38bdf8');
    panelGrad.addColorStop(0.5, '#0284c7');
    panelGrad.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = panelGrad;
    ctx.fillRect(-wingW / 2, wy, wingW, wingH);

    // Metallic frame
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(0.7, s * 0.06);
    ctx.strokeRect(-wingW / 2, wy, wingW, wingH);

    // Solar cell grid lines
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.5)';
    ctx.lineWidth = Math.max(0.5, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(0, wy);
    ctx.lineTo(0, wy + wingH);
    for (let r = 1; r <= 2; r++) {
      const ry = wy + (wingH * r) / 3;
      ctx.moveTo(-wingW / 2, ry);
      ctx.lineTo(wingW / 2, ry);
    }
    ctx.stroke();
  }

  // Metallic gold-foil MLI spacecraft bus
  const busW = s * 0.56;
  const busH = s * 0.52;
  const goldGrad = ctx.createLinearGradient(-busW / 2, -busH / 2, busW / 2, busH / 2);
  goldGrad.addColorStop(0, '#fef08a');
  goldGrad.addColorStop(0.45, '#f59e0b');
  goldGrad.addColorStop(1, '#92400e');
  ctx.fillStyle = goldGrad;
  ctx.fillRect(-busW / 2, -busH / 2, busW, busH);
  ctx.strokeStyle = '#fde68a';
  ctx.lineWidth = Math.max(0.7, s * 0.06);
  ctx.strokeRect(-busW / 2, -busH / 2, busW, busH);

  // Forward parabolic dish antenna
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = Math.max(1, s * 0.11);
  ctx.beginPath();
  ctx.arc(s * 0.34, 0, s * 0.28, -Math.PI * 0.42, Math.PI * 0.42);
  ctx.stroke();

  // Dish feed spike
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(0.7, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(s * 0.28, 0);
  ctx.lineTo(s * 0.68, 0);
  ctx.stroke();

  // Subtle ion thruster glow at rear
  ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
  ctx.beginPath();
  ctx.arc(-busW / 2 - s * 0.06, 0, s * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Blinking navigation beacon LED
  if (blinkOn) {
    ctx.fillStyle = blinkColor;
    ctx.beginPath();
    ctx.arc(-s * 0.05, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.4;
    ctx.beginPath();
    ctx.arc(-s * 0.05, 0, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRelaySatellite(
  ctx: CanvasRenderingContext2D,
  s: number,
  blinkOn: boolean,
  blinkColor: string,
  accent: string
): void {
  // Long twin angled solar arrays
  const wingW = s * 0.38;
  const wingH = s * 0.85;
  for (const dir of [-1, 1]) {
    const wy = dir < 0 ? -s * 0.26 - wingH : s * 0.26;
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(-wingW / 2, wy, wingW, wingH);
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = Math.max(0.6, s * 0.05);
    ctx.strokeRect(-wingW / 2, wy, wingW, wingH);
    ctx.beginPath();
    ctx.moveTo(-wingW / 2, wy + wingH * 0.5);
    ctx.lineTo(wingW / 2, wy + wingH * 0.5);
    ctx.stroke();
  }

  // Silver-titanium cylindrical core + gold instrument collar
  const bodyGrad = ctx.createLinearGradient(-s * 0.45, -s * 0.22, s * 0.45, s * 0.22);
  bodyGrad.addColorStop(0, '#f8fafc');
  bodyGrad.addColorStop(0.55, '#94a3b8');
  bodyGrad.addColorStop(1, '#334155');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(-s * 0.42, -s * 0.22, s * 0.84, s * 0.44);

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(s * 0.12, -s * 0.23, s * 0.22, s * 0.46);

  // Magnetometer whip antenna
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(0.6, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(s * 0.42, 0);
  ctx.lineTo(s * 0.82, 0);
  ctx.stroke();

  if (blinkOn) {
    ctx.fillStyle = blinkColor;
    ctx.beginPath();
    ctx.arc(-s * 0.25, 0, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOrbitalStation(
  ctx: CanvasRenderingContext2D,
  s: number,
  blinkOn: boolean,
  blinkColor: string,
  timeSec: number
): void {
  // Central truss spine
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = Math.max(1.2, s * 0.13);
  ctx.beginPath();
  ctx.moveTo(-s * 0.95, 0);
  ctx.lineTo(s * 0.95, 0);
  ctx.stroke();

  // Four solar array paddles along the truss
  for (const xOff of [-0.62, 0.62]) {
    for (const dir of [-1, 1]) {
      const py = dir < 0 ? -s * 0.72 : s * 0.16;
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(s * xOff - s * 0.14, py, s * 0.28, s * 0.56);
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = Math.max(0.5, s * 0.045);
      ctx.strokeRect(s * xOff - s * 0.14, py, s * 0.28, s * 0.56);
    }
  }

  // Rotating centrifuge habitat ring
  ctx.save();
  ctx.rotate(timeSec * 0.6);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = Math.max(1.4, s * 0.16);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
  ctx.stroke();

  // Lit porthole windows on habitat ring
  ctx.fillStyle = '#fde047';
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Central docking hub
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
  ctx.fill();

  if (blinkOn) {
    ctx.fillStyle = blinkColor;
    ctx.beginPath();
    ctx.arc(s * 0.95, 0, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRingHalf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  isBack: boolean,
  timeSec: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.28);

  const startAngle = isBack ? Math.PI : 0;
  const endAngle = isBack ? Math.PI * 2 : Math.PI;

  // Outer A-ring
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.78, radius * 0.4, 0, startAngle, endAngle);
  ctx.strokeStyle = planet.accent;
  ctx.globalAlpha = isBack ? 0.26 : 0.56;
  ctx.lineWidth = Math.max(1.8, radius * 0.11);
  ctx.stroke();

  // Bright main B-ring (separated by Cassini-like gap)
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.53, radius * 0.33, 0, startAngle, endAngle);
  ctx.strokeStyle = planet.accent;
  ctx.globalAlpha = isBack ? 0.36 : 0.74;
  ctx.lineWidth = Math.max(2, radius * 0.13);
  ctx.stroke();

  // Inner translucent C-ring
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.32, radius * 0.27, 0, startAngle, endAngle);
  ctx.strokeStyle = planet.primary;
  ctx.globalAlpha = isBack ? 0.2 : 0.42;
  ctx.lineWidth = Math.max(1.2, radius * 0.06);
  ctx.stroke();

  // Embedded icy ringlet chunks when large enough
  if (radius >= 28) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + timeSec * 0.22;
      const sinA = Math.sin(a);
      if ((sinA < 0) !== isBack) continue;
      const rScale = i % 2 === 0 ? 1.65 : 1.44;
      const rx = Math.cos(a) * radius * rScale;
      const ry = sinA * radius * (rScale * 0.22);
      ctx.globalAlpha = isBack ? 0.45 : 0.85;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(rx, ry, Math.max(1, radius * 0.02), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawAtmosphericClouds(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  cloudPhase: number
): void {
  const offset = ((cloudPhase % 1) + 1) % 1;
  const shiftX = (offset - 0.5) * radius * 2.4;

  const clouds = [
    { x: -0.45, y: -0.34, rx: 0.42, ry: 0.085, rot: -0.08 },
    { x: 0.18, y: -0.14, rx: 0.48, ry: 0.095, rot: 0.05 },
    { x: -0.22, y: 0.24, rx: 0.38, ry: 0.08, rot: -0.05 },
    { x: 0.44, y: 0.44, rx: 0.34, ry: 0.075, rot: 0.08 },
  ];

  ctx.save();
  for (const wrap of [-2.4 * radius, 0, 2.4 * radius]) {
    for (const c of clouds) {
      const px = cx + c.x * radius + shiftX + wrap;
      const py = cy + c.y * radius;
      if (px + c.rx * radius < cx - radius * 1.1 || px - c.rx * radius > cx + radius * 1.1) {
        continue;
      }
      // Soft cloud shadow beneath
      ctx.fillStyle = 'rgba(2, 6, 23, 0.16)';
      ctx.beginPath();
      ctx.ellipse(
        px + radius * 0.02,
        py + radius * 0.03,
        c.rx * radius,
        c.ry * radius,
        c.rot,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Bright translucent cloud wisp
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.beginPath();
      ctx.ellipse(px, py, c.rx * radius, c.ry * radius, c.rot, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawSurfacePattern(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  phase: number,
  timeSec: number
): void {
  const offset = ((phase % 1) + 1) % 1;
  const shiftX = (offset - 0.5) * radius * 2.2;
  const hiDetail = radius >= 24;

  ctx.save();
  if (planet.pattern === 'bands') {
    const bandOffsets = [-0.62, -0.34, -0.06, 0.24, 0.52, 0.76];
    bandOffsets.forEach((by, i) => {
      ctx.fillStyle = i % 2 === 0 ? planet.accent : planet.secondary;
      ctx.globalAlpha = i % 2 === 0 ? 0.24 : 0.28;
      const y = cy + by * radius;
      const h = radius * (0.11 + (i % 3) * 0.035);
      ctx.beginPath();
      ctx.ellipse(cx + shiftX * 0.2, y, radius * 1.28, h, -0.07, 0, Math.PI * 2);
      ctx.fill();

      if (hiDetail && i % 2 === 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = Math.max(0.8, radius * 0.018);
        ctx.beginPath();
        ctx.ellipse(cx + shiftX * 0.22, y - h * 0.35, radius * 1.15, h * 0.4, -0.07, 0, Math.PI);
        ctx.stroke();
      }
    });

    // Swirling Great Storm Eye
    if (hiDetail) {
      for (const wrap of [-2.2 * radius, 0, 2.2 * radius]) {
        const sx = cx + radius * 0.14 + shiftX * 0.65 + wrap;
        const sy = cy + radius * 0.22;
        if (sx < cx - radius * 1.2 || sx > cx + radius * 1.2) continue;

        ctx.globalAlpha = 0.45;
        ctx.fillStyle = planet.secondary;
        ctx.beginPath();
        ctx.ellipse(sx, sy, radius * 0.22, radius * 0.12, -0.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.58;
        ctx.strokeStyle = planet.accent;
        ctx.lineWidth = Math.max(1, radius * 0.03);
        ctx.beginPath();
        ctx.ellipse(sx, sy, radius * 0.16, radius * 0.085, -0.1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(sx, sy, radius * 0.055, radius * 0.03, -0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (planet.pattern === 'continents') {
    const blobs = [
      { x: -0.35, y: -0.2, rx: 0.33, ry: 0.22, r: 0.4 },
      { x: 0.28, y: 0.15, rx: 0.29, ry: 0.34, r: -0.3 },
      { x: -0.08, y: 0.48, rx: 0.36, ry: 0.17, r: 0.15 },
      { x: 0.56, y: -0.35, rx: 0.23, ry: 0.18, r: -0.5 },
    ];
    for (const wrap of [-2.2 * radius, 0, 2.2 * radius]) {
      for (const b of blobs) {
        const bx = cx + b.x * radius + shiftX + wrap;
        const by = cy + b.y * radius;
        if (bx + b.rx * radius < cx - radius * 1.15 || bx - b.rx * radius > cx + radius * 1.15) {
          continue;
        }

        // Coastal shallow shelf glow
        if (hiDetail) {
          ctx.fillStyle = '#7dd3fc';
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.ellipse(bx, by, b.rx * radius * 1.14, b.ry * radius * 1.14, b.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Main landmass
        ctx.fillStyle = planet.accent;
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        ctx.ellipse(bx, by, b.rx * radius, b.ry * radius, b.r, 0, Math.PI * 2);
        ctx.fill();

        // Inner highland / mountain ridge highlight
        if (hiDetail) {
          ctx.fillStyle = planet.secondary;
          ctx.globalAlpha = 0.24;
          ctx.beginPath();
          ctx.ellipse(
            bx + radius * 0.03,
            by + radius * 0.02,
            b.rx * radius * 0.52,
            b.ry * radius * 0.36,
            b.r + 0.15,
            0,
            Math.PI * 2
          );
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
          ctx.lineWidth = Math.max(0.8, radius * 0.018);
          ctx.beginPath();
          ctx.ellipse(
            bx - radius * 0.02,
            by - radius * 0.02,
            b.rx * radius * 0.38,
            b.ry * radius * 0.2,
            b.r,
            0.2,
            Math.PI * 0.9
          );
          ctx.stroke();
        }
      }
    }

    // Polar ice caps
    if (hiDetail) {
      ctx.fillStyle = 'rgba(248, 250, 252, 0.45)';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy - radius * 0.9, radius * 0.56, radius * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy + radius * 0.92, radius * 0.48, radius * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (planet.pattern === 'craters') {
    const craters = [
      { x: -0.32, y: -0.22, r: 0.17, major: true },
      { x: 0.22, y: 0.12, r: 0.21, major: true },
      { x: -0.15, y: 0.42, r: 0.12, major: false },
      { x: 0.44, y: -0.32, r: 0.1, major: false },
      { x: -0.52, y: 0.18, r: 0.11, major: false },
      { x: 0.04, y: -0.54, r: 0.085, major: false },
      { x: 0.48, y: 0.44, r: 0.075, major: false },
    ];
    for (const wrap of [-2.2 * radius, 0, 2.2 * radius]) {
      for (const c of craters) {
        const px = cx + c.x * radius + shiftX + wrap;
        const py = cy + c.y * radius;
        const cr = c.r * radius;
        if (px + cr < cx - radius * 1.1 || px - cr > cx + radius * 1.1) continue;

        // Subtle ejecta halo
        if (hiDetail && c.major) {
          ctx.fillStyle = planet.accent;
          ctx.globalAlpha = 0.14;
          ctx.beginPath();
          ctx.arc(px, py, cr * 1.28, 0, Math.PI * 2);
          ctx.fill();
        }

        // Concave crater bowl shadow (dark top-left inner wall)
        ctx.fillStyle = planet.secondary;
        ctx.globalAlpha = 0.44;
        ctx.beginPath();
        ctx.arc(px, py, cr, 0, Math.PI * 2);
        ctx.fill();

        if (hiDetail) {
          // Sunlit lower-right inner floor
          ctx.fillStyle = planet.primary;
          ctx.globalAlpha = 0.36;
          ctx.beginPath();
          ctx.arc(px + cr * 0.16, py + cr * 0.16, cr * 0.74, 0, Math.PI * 2);
          ctx.fill();

          // Central rebound peak on major craters
          if (c.major) {
            ctx.fillStyle = planet.accent;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(px, py, cr * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Crisp rim highlight
        ctx.strokeStyle = planet.accent;
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = Math.max(1, cr * 0.16);
        ctx.beginPath();
        ctx.arc(px + cr * 0.06, py + cr * 0.06, cr * 0.94, 0.35, 2.65);
        ctx.stroke();
      }
    }
  } else if (planet.pattern === 'magma') {
    // Dark basalt crust plates + multi-layered glowing volcanic fissures
    const lavaPulse = 0.85 + Math.sin(timeSec * 2.6) * 0.15;
    for (let i = -1; i <= 1; i++) {
      const y0 = cy + i * radius * 0.36;
      const xStart = cx - radius * 0.88 + shiftX * 0.4;
      const c1x = cx - radius * 0.22 + shiftX * 0.4;
      const c1y = cy + (i - 0.52) * radius * 0.32;
      const c2x = cx + radius * 0.24 + shiftX * 0.4;
      const c2y = cy + (i + 0.52) * radius * 0.32;
      const xEnd = cx + radius * 0.9 + shiftX * 0.4;

      // Outer molten glow
      ctx.strokeStyle = planet.accent;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35 * lavaPulse;
      ctx.lineWidth = Math.max(2.5, radius * 0.095);
      ctx.beginPath();
      ctx.moveTo(xStart, y0);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, xEnd, cy + i * radius * 0.22);
      ctx.stroke();

      // Hot inner core crack
      ctx.strokeStyle = '#fef9c3';
      ctx.globalAlpha = 0.72 * lavaPulse;
      ctx.lineWidth = Math.max(1, radius * 0.028);
      ctx.beginPath();
      ctx.moveTo(xStart, y0);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, xEnd, cy + i * radius * 0.22);
      ctx.stroke();
    }

    // Glowing volcanic calderas
    if (hiDetail) {
      const calderas = [
        { x: -0.25, y: -0.18, r: 0.075 },
        { x: 0.32, y: 0.22, r: 0.09 },
      ];
      for (const cal of calderas) {
        const vx = cx + cal.x * radius + shiftX * 0.4;
        const vy = cy + cal.y * radius;
        const vr = cal.r * radius;
        const vGrad = ctx.createRadialGradient(vx, vy, vr * 0.1, vx, vy, vr * 1.8);
        vGrad.addColorStop(0, '#fef9c3');
        vGrad.addColorStop(0.45, planet.accent);
        vGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = vGrad;
        ctx.globalAlpha = 0.78 * lavaPulse;
        ctx.beginPath();
        ctx.arc(vx, vy, vr * 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (planet.pattern === 'ice') {
    // Polar caps
    ctx.fillStyle = planet.accent;
    ctx.globalAlpha = 0.38;
    ctx.beginPath();
    ctx.ellipse(cx, cy - radius * 0.72, radius * 0.88, radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + radius * 0.76, radius * 0.75, radius * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crystalline glacial crevasse lines
    if (hiDetail) {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = Math.max(0.8, radius * 0.018);
      const cracks = [
        [-0.55, -0.12, -0.1, 0.08, 0.35, -0.06],
        [-0.35, 0.26, 0.05, 0.14, 0.55, 0.34],
        [-0.15, -0.45, 0.12, -0.22, 0.42, -0.32],
      ];
      for (const [x1, y1, x2, y2, x3, y3] of cracks) {
        ctx.beginPath();
        ctx.moveTo(cx + x1 * radius + shiftX * 0.3, cy + y1 * radius);
        ctx.lineTo(cx + x2 * radius + shiftX * 0.3, cy + y2 * radius);
        ctx.lineTo(cx + x3 * radius + shiftX * 0.3, cy + y3 * radius);
        ctx.stroke();
      }
    }
  } else {
    // swirl: multi-arm cyclone & glowing spiral storm cores
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = planet.accent;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = Math.max(1.5, radius * 0.085);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(
        cx + shiftX * 0.28,
        cy + (i - 1.5) * radius * 0.31,
        radius * (0.44 + i * 0.12),
        0.2,
        Math.PI * 0.88
      );
      ctx.stroke();
    }

    if (hiDetail) {
      const sx = cx + radius * 0.18 + shiftX * 0.45;
      const sy = cy - radius * 0.1;
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.34;
      ctx.lineWidth = Math.max(1, radius * 0.025);
      ctx.beginPath();
      ctx.ellipse(sx, sy, radius * 0.18, radius * 0.11, -0.25, 0, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = planet.accent;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(sx, sy, radius * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
