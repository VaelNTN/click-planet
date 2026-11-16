import { PlanetColor } from '../data/planets';

export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  planet: PlanetColor,
  rotationPhase: number
): void {
  ctx.save();

  // Outer atmospheric glow
  const glowGrad = ctx.createRadialGradient(
    cx,
    cy,
    radius * 0.78,
    cx,
    cy,
    radius * 1.42
  );
  glowGrad.addColorStop(0, planet.glow);
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.42, 0, Math.PI * 2);
  ctx.fill();

  // Back half of ring if planet has rings
  if (planet.hasRing) {
    drawRingHalf(ctx, cx, cy, radius, planet, true);
  }

  // Main sphere clip
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
  shadowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  shadowGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
  shadowGrad.addColorStop(1, 'rgba(2, 6, 23, 0.62)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // Crisp subtle rim highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = Math.max(1, radius * 0.025);
  ctx.beginPath();
  ctx.arc(cx, cy, radius - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // Front half of ring
  if (planet.hasRing) {
    drawRingHalf(ctx, cx, cy, radius, planet, false);
  }

  ctx.restore();
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
