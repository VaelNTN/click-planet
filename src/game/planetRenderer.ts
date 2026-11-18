import { PlanetColor } from '../data/planets';

export interface PlanetDrawOptions {
  /** Mass evolution metric: 0 at 0.01 kg, ~3 at 10 kg, ~5 at 1,000 kg, ~8 at 10^6 kg, ~14 at 10^12 kg */
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

// Precomputed deterministic ring dust particles (zero per-frame allocations)
const DUST_SPECS: DustSpec[] = Array.from({ length: 28 }, (_, i) => {
  const s1 = Math.sin(i * 12.9898) * 43758.5453;
  const s2 = Math.sin(i * 78.233 + 1.7) * 24634.6345;
  const r1 = s1 - Math.floor(s1);
  const r2 = s2 - Math.floor(s2);
  return {
    angleOffset: (i / 28) * Math.PI * 2 + r1 * 0.35,
    orbitScale: 1.32 + r1 * 0.42,
    speed: 0.32 + r2 * 0.28,
    size: 0.9 + r1 * 1.7,
    alpha: 0.35 + r2 * 0.55,
    yJitter: (r1 - 0.5) * 0.09,
    useAccent: i % 3 !== 0,
  };
});

const MOON_SPECS: MoonSpec[] = [
  {
    unlockEvo: 4.2,
    orbitRx: 1.56,
    orbitRy: 0.42,
    tilt: -0.24,
    speed: 0.55,
    phaseOffset: 0.4,
    sizeRatio: 0.13,
    tint: 'silver',
  },
  {
    unlockEvo: 7.0,
    orbitRx: 1.84,
    orbitRy: 0.52,
    tilt: 0.31,
    speed: -0.38,
    phaseOffset: 2.6,
    sizeRatio: 0.105,
    tint: 'accent',
  },
  {
    unlockEvo: 10.5,
    orbitRx: 2.08,
    orbitRy: 0.58,
    tilt: -0.45,
    speed: 0.27,
    phaseOffset: 4.5,
    sizeRatio: 0.09,
    tint: 'gold',
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
  if (evoFactor > 0.25 || energy > 0.08) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.65, evoFactor * 0.28 + energy * 0.42);
    ctx.strokeStyle = planet.accent;
    ctx.lineWidth = Math.max(1.2, radius * (0.03 + energy * 0.04));
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1.06 + energy * 0.07), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Back half of orbital ring dust & back-side mini-moons (behind planet)
  drawOrbitalDust(ctx, cx, cy, radius, planet, evolution, timeSec, true);
  drawOrbitingMoons(ctx, cx, cy, radius, planet, evolution, timeSec, true);

  // Back half of planetary ring if planet has rings
  if (planet.hasRing) {
    drawRingHalf(ctx, cx, cy, radius, planet, true);
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
    cx + radius * 0.12,
    cy + radius * 0.12,
    radius * 1.25
  );
  sphereGrad.addColorStop(0, planet.accent);
  sphereGrad.addColorStop(0.32, planet.primary);
  sphereGrad.addColorStop(1, planet.secondary);
  ctx.fillStyle = sphereGrad;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  // Surface pattern details with gentle horizontal wrap/rotation
  drawSurfacePattern(ctx, cx, cy, radius, planet, rotationPhase);

  // Specular atmosphere rim + terminator shadow
  const shadowGrad = ctx.createRadialGradient(
    cx - radius * 0.38,
    cy - radius * 0.38,
    radius * 0.45,
    cx,
    cy,
    radius * 1.05
  );
  shadowGrad.addColorStop(0, `rgba(255, 255, 255, ${0.18 + energy * 0.14})`);
  shadowGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0.62)');
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

  // Crisp subtle rim highlight
  ctx.strokeStyle = energy > 0.1 ? planet.accent : 'rgba(255, 255, 255, 0.24)';
  ctx.globalAlpha = 0.26 + energy * 0.45;
  ctx.lineWidth = Math.max(1, radius * 0.026);
  ctx.beginPath();
  ctx.arc(cx, cy, radius - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // 4. Front half of planetary ring
  if (planet.hasRing) {
    drawRingHalf(ctx, cx, cy, radius, planet, false);
  }

  // 5. Front half of orbital ring dust & front-side mini-moons (in front of planet)
  drawOrbitalDust(ctx, cx, cy, radius, planet, evolution, timeSec, false);
  drawOrbitingMoons(ctx, cx, cy, radius, planet, evolution, timeSec, false);

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
  if (evolution < 2.8 || radius < 28) return;
  const maxDust = Math.min(DUST_SPECS.length, Math.floor((evolution - 2.3) * 3.5));
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

    ctx.globalAlpha = d.alpha * depthAlpha;
    ctx.fillStyle = d.useAccent ? planet.accent : '#f8fafc';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.9, (radius / 90) * d.size), 0, Math.PI * 2);
    ctx.fill();
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
    const mr = Math.max(3, radius * moon.sizeRatio * fadeIn);

    ctx.save();
    ctx.globalAlpha = (behind ? 0.72 : 1) * fadeIn;

    // Faint moon glow
    const mGlow = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.1);
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

    mGlow.addColorStop(0, primaryCol);
    mGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = mGlow;
    ctx.globalAlpha *= 0.35;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Shaded moon sphere
    ctx.globalAlpha = (behind ? 0.78 : 1) * fadeIn;
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

    // Tiny crater detail on moon
    ctx.fillStyle = darkCol;
    ctx.globalAlpha *= 0.4;
    ctx.beginPath();
    ctx.arc(mx + mr * 0.22, my + mr * 0.16, mr * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawRingHalf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  isBack: boolean
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.28);

  const startAngle = isBack ? Math.PI : 0;
  const endAngle = isBack ? Math.PI * 2 : Math.PI;

  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.65, radius * 0.36, 0, startAngle, endAngle);
  ctx.strokeStyle = planet.accent;
  ctx.globalAlpha = isBack ? 0.32 : 0.65;
  ctx.lineWidth = Math.max(2, radius * 0.14);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.42, radius * 0.28, 0, startAngle, endAngle);
  ctx.strokeStyle = planet.primary;
  ctx.globalAlpha = isBack ? 0.22 : 0.45;
  ctx.lineWidth = Math.max(1.5, radius * 0.06);
  ctx.stroke();

  ctx.restore();
}

function drawSurfacePattern(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  phase: number
): void {
  const offset = ((phase % 1) + 1) % 1;
  const shiftX = (offset - 0.5) * radius * 2.2;

  ctx.save();
  if (planet.pattern === 'bands') {
    const bandOffsets = [-0.55, -0.22, 0.1, 0.42, 0.68];
    bandOffsets.forEach((by, i) => {
      ctx.fillStyle = i % 2 === 0 ? planet.accent : planet.secondary;
      ctx.globalAlpha = i % 2 === 0 ? 0.22 : 0.26;
      const y = cy + by * radius;
      const h = radius * (0.12 + (i % 3) * 0.04);
      ctx.beginPath();
      ctx.ellipse(cx + shiftX * 0.18, y, radius * 1.25, h, -0.08, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (planet.pattern === 'continents') {
    const blobs = [
      { x: -0.35, y: -0.2, rx: 0.32, ry: 0.22, r: 0.4 },
      { x: 0.28, y: 0.15, rx: 0.28, ry: 0.34, r: -0.3 },
      { x: -0.1, y: 0.48, rx: 0.36, ry: 0.16, r: 0.15 },
      { x: 0.55, y: -0.35, rx: 0.22, ry: 0.18, r: -0.5 },
    ];
    for (const wrap of [-2.2 * radius, 0, 2.2 * radius]) {
      for (const b of blobs) {
        ctx.fillStyle = planet.accent;
        ctx.globalAlpha = 0.38;
        ctx.beginPath();
        ctx.ellipse(
          cx + b.x * radius + shiftX + wrap,
          cy + b.y * radius,
          b.rx * radius,
          b.ry * radius,
          b.r,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
  } else if (planet.pattern === 'craters') {
    const craters = [
      { x: -0.32, y: -0.22, r: 0.16 },
      { x: 0.22, y: 0.12, r: 0.2 },
      { x: -0.15, y: 0.42, r: 0.12 },
      { x: 0.44, y: -0.32, r: 0.1 },
      { x: -0.52, y: 0.18, r: 0.11 },
    ];
    for (const wrap of [-2.2 * radius, 0, 2.2 * radius]) {
      for (const c of craters) {
        const px = cx + c.x * radius + shiftX + wrap;
        const py = cy + c.y * radius;
        const cr = c.r * radius;
        ctx.fillStyle = planet.secondary;
        ctx.globalAlpha = 0.36;
        ctx.beginPath();
        ctx.arc(px, py, cr, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = planet.accent;
        ctx.globalAlpha = 0.24;
        ctx.lineWidth = Math.max(1, cr * 0.18);
        ctx.beginPath();
        ctx.arc(px + cr * 0.08, py + cr * 0.08, cr * 0.9, 0.4, 2.7);
        ctx.stroke();
      }
    }
  } else if (planet.pattern === 'magma') {
    ctx.strokeStyle = planet.accent;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.52;
    ctx.lineWidth = Math.max(1.5, radius * 0.045);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - radius * 0.8 + shiftX * 0.4, cy + i * radius * 0.36);
      ctx.bezierCurveTo(
        cx - radius * 0.2 + shiftX * 0.4,
        cy + (i - 0.5) * radius * 0.3,
        cx + radius * 0.2 + shiftX * 0.4,
        cy + (i + 0.5) * radius * 0.3,
        cx + radius * 0.85 + shiftX * 0.4,
        cy + i * radius * 0.22
      );
      ctx.stroke();
    }
  } else if (planet.pattern === 'ice') {
    ctx.fillStyle = planet.accent;
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.ellipse(cx, cy - radius * 0.72, radius * 0.85, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + radius * 0.76, radius * 0.72, radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // swirl
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = planet.accent;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = Math.max(1.5, radius * 0.09);
      ctx.beginPath();
      ctx.arc(
        cx + shiftX * 0.25,
        cy + (i - 1.5) * radius * 0.32,
        radius * (0.45 + i * 0.12),
        0.2,
        Math.PI * 0.85
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}
