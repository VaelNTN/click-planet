import { PlanetColor } from '../data/planets';
import { BigMass, START_MASS, getMassLog10 } from '../math/bigMass';
import { drawPlanet } from './planetRenderer';

interface Star {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
  color: string;
  flare: boolean;
}

interface NebulaCloud {
  canvas: HTMLCanvasElement;
  baseX: number;
  baseY: number;
  radius: number;
  driftSpeedX: number;
  driftSpeedY: number;
  phase: number;
  alpha: number;
}

interface Meteorite {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hitRadius: number;
  angle: number;
  spin: number;
  vertices: number[];
  hue: string;
  absorbing: boolean;
  absorbT: number;
  startX: number;
  startY: number;
  ctrlX: number;
  ctrlY: number;
  trailAccum: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  glow: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  badge?: string;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  dual: boolean;
}

export interface PlanetStageCallbacks {
  onPlanetTap: (x: number, y: number) => string;
  onMeteoriteAbsorb: (x: number, y: number) => string;
}

const MAX_PARTICLES = 180;
const MAX_SHOCKWAVES = 24;
const MAX_FLOATING_TEXTS = 24;
const STAR_PALETTE = ['#f8fafc', '#e2e8f0', '#bae6fd', '#ddd6fe', '#fef08a'];

export class PlanetStage {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private planet: PlanetColor;
  private callbacks: PlanetStageCallbacks;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private planetCx = 0;
  private planetCy = 0;
  private basePlanetRadius = 90;

  // Spring bounce & screen pulse state
  private pulseScale = 1;
  private pulseVelocity = 0;
  private tapEnergy = 0;
  private screenFlash = 0;
  private screenFlashColor = '#38bdf8';
  private shakeMag = 0;
  private shakeAngle = 0;
  private rotationPhase = 0;
  private massEvolution = 0;

  private stars: Star[] = [];
  private nebulae: NebulaCloud[] = [];
  private meteorites: Meteorite[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private shockwaves: Shockwave[] = [];

  private nextMeteorTimer = 2.0;
  private meteorIdSeq = 1;
  private rafId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastTime = 0;
  private elapsedSec = 0;
  private active = false;
  private paused = false;

  constructor(
    canvas: HTMLCanvasElement,
    planet: PlanetColor,
    callbacks: PlanetStageCallbacks,
    initialMass: BigMass = START_MASS
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context not available');
    }
    this.ctx = context;
    this.planet = planet;
    this.callbacks = callbacks;
    this.setMass(initialMass);
    this.initNebulae();

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.loop = this.loop.bind(this);
  }

  public setPlanet(planet: PlanetColor): void {
    if (this.planet.id !== planet.id) {
      this.planet = planet;
      this.initNebulae();
    } else {
      this.planet = planet;
    }
  }

  public setMass(mass: BigMass): void {
    this.massEvolution = Math.max(0, getMassLog10(mass) + 2);
    this.updatePlanetMetrics();
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (!p) this.lastTime = performance.now();
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public triggerMeteorShower(count = 4): void {
    for (let i = 0; i < count; i++) {
      this.spawnMeteorite(true);
    }
    this.triggerPulse(0.8, 0.5, 3.5, '#facc15');
    this.pushShockwave({
      x: this.planetCx,
      y: this.planetCy,
      radius: this.basePlanetRadius * 0.9,
      maxRadius: this.basePlanetRadius * 2.3,
      life: 0,
      maxLife: 0.65,
      color: '#fde047',
      dual: true,
    });
  }

  public triggerMilestoneCelebration(): void {
    this.spawnBurst(this.planetCx, this.planetCy, '#fde047', 34, true);
    this.pushShockwave({
      x: this.planetCx,
      y: this.planetCy,
      radius: this.basePlanetRadius * 0.8,
      maxRadius: this.basePlanetRadius * 2.5,
      life: 0,
      maxLife: 0.72,
      color: '#38bdf8',
      dual: true,
    });
    this.triggerPulse(1.1, 0.65, 4.0, '#38bdf8');
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.active) this.handleResize();
      });
      this.resizeObserver.observe(this.canvas);
    }

    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    this.paused = false;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Clear transient FX and absorbing meteors so returning to stage is crisp
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.meteorites = this.meteorites.filter((m) => !m.absorbing);
    this.pulseScale = 1;
    this.pulseVelocity = 0;
    this.tapEnergy = 0;
    this.screenFlash = 0;
    this.shakeMag = 0;
  }

  private handleVisibilityChange(): void {
    if (!document.hidden && this.active) {
      this.lastTime = performance.now();
    }
  }

  private updatePlanetMetrics(): void {
    if (this.width <= 0 || this.height <= 0) return;
    this.planetCx = this.width * 0.5;
    this.planetCy = this.height * 0.5;
    const minDim = Math.min(this.width, this.height);
    // Keep rings & orbiting satellites safely inside short landscape viewports
    const orbitFactor = this.massEvolution >= 3.8 ? 0.2 : this.massEvolution >= 2.1 ? 0.22 : 0.245;
    this.basePlanetRadius = Math.max(38, Math.min(112, minDim * orbitFactor));
  }

  private handleResize(): void {
    // clientWidth/clientHeight stay accurate even during CSS transform: scale() transitions
    const rect = this.canvas.getBoundingClientRect();
    const w = this.canvas.clientWidth || rect.width;
    const h = this.canvas.clientHeight || rect.height;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const targetW = Math.max(1, Math.round(w * this.dpr));
    const targetH = Math.max(1, Math.round(h * this.dpr));

    if (
      this.width === w &&
      this.height === h &&
      this.canvas.width === targetW &&
      this.canvas.height === targetH
    ) {
      return;
    }

    this.width = w;
    this.height = h;
    this.canvas.width = targetW;
    this.canvas.height = targetH;

    this.updatePlanetMetrics();
    this.initStars();
  }

  private initNebulae(): void {
    const configs = [
      {
        c1: 'rgba(109, 40, 217, 0.32)',
        c2: 'rgba(56, 189, 248, 0.14)',
        baseX: 0.22,
        baseY: 0.28,
        radius: 0.52,
        dx: 0.08,
        dy: 0.05,
        phase: 0.2,
        alpha: 0.85,
      },
      {
        c1: 'rgba(14, 165, 233, 0.26)',
        c2: 'rgba(236, 72, 153, 0.12)',
        baseX: 0.78,
        baseY: 0.72,
        radius: 0.56,
        dx: -0.07,
        dy: 0.06,
        phase: 2.1,
        alpha: 0.8,
      },
      {
        c1: this.planet.glow,
        c2: 'rgba(15, 23, 42, 0)',
        baseX: 0.52,
        baseY: 0.48,
        radius: 0.62,
        dx: 0.05,
        dy: -0.05,
        phase: 4.0,
        alpha: 0.55,
      },
    ];

    this.nebulae = configs.map((cfg) => {
      const off = document.createElement('canvas');
      off.width = 256;
      off.height = 256;
      const octx = off.getContext('2d');
      if (octx) {
        const g1 = octx.createRadialGradient(116, 118, 8, 128, 128, 124);
        g1.addColorStop(0, cfg.c1);
        g1.addColorStop(0.55, cfg.c2);
        g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        octx.fillStyle = g1;
        octx.fillRect(0, 0, 256, 256);

        const g2 = octx.createRadialGradient(152, 146, 4, 152, 146, 86);
        g2.addColorStop(0, cfg.c2);
        g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        octx.fillStyle = g2;
        octx.fillRect(0, 0, 256, 256);
      }
      return {
        canvas: off,
        baseX: cfg.baseX,
        baseY: cfg.baseY,
        radius: cfg.radius,
        driftSpeedX: cfg.dx,
        driftSpeedY: cfg.dy,
        phase: cfg.phase,
        alpha: cfg.alpha,
      };
    });
  }

  private initStars(): void {
    const area = this.width * this.height;
    const count = Math.min(170, Math.max(70, Math.floor(area / 4200)));
    this.stars = [];
    for (let i = 0; i < count; i++) {
      const layerRoll = Math.random();
      const depth = layerRoll < 0.52 ? 0.25 : layerRoll < 0.85 ? 0.58 : 1.0;
      const flare = depth === 1.0 && Math.random() < 0.28;
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        depth,
        size: depth === 0.25 ? 0.65 + Math.random() * 0.75 : depth === 0.58 ? 1.0 + Math.random() * 1.1 : 1.45 + Math.random() * 1.4,
        alpha: depth === 0.25 ? 0.28 + Math.random() * 0.42 : 0.45 + Math.random() * 0.55,
        twinkleSpeed: 0.7 + Math.random() * 2.4,
        phase: Math.random() * Math.PI * 2,
        color: STAR_PALETTE[Math.floor(Math.random() * STAR_PALETTE.length)],
        flare,
      });
    }
  }

  private handlePointerDown(ev: PointerEvent): void {
    if (this.paused) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (this.width <= 0 || this.height <= 0) return;

    ev.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = ((ev.clientX - rect.left) * this.width) / rect.width;
    const y = ((ev.clientY - rect.top) * this.height) / rect.height;

    // 1. Check passing meteorites first (only non-absorbing ones)
    for (let i = this.meteorites.length - 1; i >= 0; i--) {
      const m = this.meteorites[i];
      if (m.absorbing) continue;
      const dist = Math.hypot(x - m.x, y - m.y);
      if (dist <= m.hitRadius) {
        m.absorbing = true;
        m.absorbT = 0;
        m.startX = m.x;
        m.startY = m.y;

        // Curved magnetic pull control point perpendicular to planet vector
        const toCx = this.planetCx - m.x;
        const toCy = this.planetCy - m.y;
        const perpSign = (m.id % 2 === 0 ? 1 : -1);
        m.ctrlX = (m.x + this.planetCx) * 0.5 - toCy * 0.38 * perpSign;
        m.ctrlY = (m.y + this.planetCy) * 0.5 + toCx * 0.38 * perpSign;

        const label = this.callbacks.onMeteoriteAbsorb(m.x, m.y);
        this.spawnBurst(m.x, m.y, m.hue, 18, true);
        this.pushShockwave({
          x: m.x,
          y: m.y,
          radius: m.radius * 0.6,
          maxRadius: m.radius * 3.4,
          life: 0,
          maxLife: 0.38,
          color: m.hue,
          dual: true,
        });
        this.spawnFloatingText(m.x, m.y - 16, label, '#fde047', 1.18, 'METEOR!');
        this.triggerPulse(0.75, 0.45, 2.8, m.hue);
        return;
      }
    }

    // 2. Check planet body strictly inside its circular radius
    const currentRadius = this.basePlanetRadius * this.pulseScale;
    const distToPlanet = Math.hypot(x - this.planetCx, y - this.planetCy);
    if (distToPlanet <= currentRadius) {
      const label = this.callbacks.onPlanetTap(x, y);
      this.triggerPulse(0.58, 0.22, 1.8, this.planet.accent);

      // Planet aura shockwave + crisp tap-point ripple
      this.pushShockwave({
        x: this.planetCx,
        y: this.planetCy,
        radius: currentRadius * 0.94,
        maxRadius: currentRadius * 1.56,
        life: 0,
        maxLife: 0.45,
        color: this.planet.accent,
        dual: true,
      });
      this.pushShockwave({
        x,
        y,
        radius: 4,
        maxRadius: 34,
        life: 0,
        maxLife: 0.28,
        color: '#ffffff',
        dual: false,
      });

      this.spawnBurst(x, y, this.planet.accent, 11, true);
      const jitterX = (Math.random() - 0.5) * 18;
      this.spawnFloatingText(x + jitterX, y - 16, label, '#f8fafc', 1);
      return;
    }

    // 3. Clicked outside planet & meteorites: subtle empty-space ripple
    this.pushShockwave({
      x,
      y,
      radius: 2,
      maxRadius: 18,
      life: 0,
      maxLife: 0.24,
      color: 'rgba(148, 163, 184, 0.35)',
      dual: false,
    });
  }

  private triggerPulse(
    velocityBoost: number,
    flashBoost: number,
    shakeBoost: number,
    flashColor: string
  ): void {
    this.pulseVelocity = Math.max(-4.2, Math.min(4.2, this.pulseVelocity + velocityBoost));
    this.tapEnergy = Math.min(1, this.tapEnergy + 0.52);
    this.screenFlash = Math.min(1, Math.max(this.screenFlash, flashBoost));
    this.screenFlashColor = flashColor;
    this.shakeMag = Math.min(5.5, Math.max(this.shakeMag, shakeBoost));
    this.shakeAngle = Math.random() * Math.PI * 2;
  }

  private pushShockwave(sw: Shockwave): void {
    if (this.shockwaves.length >= MAX_SHOCKWAVES) {
      this.shockwaves.shift();
    }
    this.shockwaves.push(sw);
  }

  private pushParticle(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) {
      this.particles.shift();
    }
    this.particles.push(p);
  }

  private spawnMeteorite(golden = false): void {
    if (this.width < 100 || this.height < 100) return;
    const fromLeft = Math.random() < 0.5;
    const margin = 54;

    // Pick a passing lane above or below the planet so it visibly flies past
    const offsetSign = Math.random() < 0.5 ? -1 : 1;
    const minPassDist = this.basePlanetRadius * 1.28;
    const maxAvailDist = Math.max(minPassDist + 16, this.height * 0.44);
    const maxPassDist = Math.min(maxAvailDist, Math.min(this.width, this.height) * 0.46 + 20);
    const passDist =
      minPassDist + Math.random() * Math.max(8, maxPassDist - minPassDist);

    const startX = fromLeft ? -margin : this.width + margin;
    const endX = fromLeft ? this.width + margin : -margin;

    const minY = 34;
    const maxY = Math.max(minY + 10, this.height - 34);
    const laneY = Math.max(minY, Math.min(maxY, this.planetCy + offsetSign * passDist));
    const startY = Math.max(minY, Math.min(maxY, laneY + (Math.random() - 0.5) * 64));
    const endY = Math.max(minY, Math.min(maxY, laneY + (Math.random() - 0.5) * 64));

    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.hypot(dx, dy) || 1;
    const speed = golden ? 90 + Math.random() * 65 : 108 + Math.random() * 84;

    const radius = golden ? 19 + Math.random() * 6 : 16 + Math.random() * 7;
    const vertices: number[] = [];
    const numVerts = 8;
    for (let i = 0; i < numVerts; i++) {
      vertices.push(0.75 + Math.random() * 0.42);
    }

    const hues = ['#fb923c', '#facc15', '#38bdf8', '#f472b6'];

    this.meteorites.push({
      id: this.meteorIdSeq++,
      x: startX,
      y: startY,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      radius,
      hitRadius: radius + (golden ? 28 : 22),
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 3.2,
      vertices,
      hue: golden ? '#fde047' : hues[Math.floor(Math.random() * hues.length)],
      absorbing: false,
      absorbT: 0,
      startX,
      startY,
      ctrlX: startX,
      ctrlY: startY,
      trailAccum: 0,
    });
  }

  private spawnBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    glow = false
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 55 + Math.random() * 165;
      this.pushParticle({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        maxLife: 0.34 + Math.random() * 0.3,
        size: 1.8 + Math.random() * 2.8,
        color: i % 4 === 0 ? '#ffffff' : color,
        glow,
      });
    }
  }

  private spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    scale: number,
    badge?: string
  ): void {
    if (this.floatingTexts.length >= MAX_FLOATING_TEXTS) {
      this.floatingTexts.shift();
    }
    const clampedX = Math.max(58, Math.min(Math.max(58, this.width - 58), x));
    const clampedY = Math.max(38, Math.min(Math.max(38, this.height - 24), y));
    this.floatingTexts.push({
      x: clampedX,
      y: clampedY,
      vx: (Math.random() - 0.5) * 16,
      vy: -62,
      text,
      badge,
      life: 0,
      maxLife: badge ? 0.96 : 0.78,
      color,
      scale,
    });
  }

  private loop(now: number): void {
    if (!this.active) return;
    const rawDt = (now - this.lastTime) / 1000;
    const dt = this.paused ? 0 : (Number.isFinite(rawDt) ? Math.min(0.05, Math.max(0.001, rawDt)) : 0.016);
    this.lastTime = now;
    this.elapsedSec += dt;

    if (!this.paused) {
      this.update(dt);
    }
    this.render(this.elapsedSec);

    this.rafId = requestAnimationFrame(this.loop);
  }

  private update(dt: number): void {
    // Gentle planet rotation
    this.rotationPhase += dt * 0.045;

    // Parallax starfield cosmic drift
    if (this.width > 0 && this.height > 0) {
      for (const s of this.stars) {
        s.x -= s.depth * 7.5 * dt;
        s.y += s.depth * 2.2 * dt;
        if (s.x < -4) s.x += this.width + 8;
        if (s.y > this.height + 4) s.y -= this.height + 8;
      }
    }

    // Spring physics for planet tap bounce
    const springForce = (1 - this.pulseScale) * 165;
    this.pulseVelocity += springForce * dt;
    this.pulseVelocity *= Math.pow(0.0025, dt);
    this.pulseVelocity = Math.max(-4.2, Math.min(4.2, this.pulseVelocity));
    this.pulseScale = Math.max(0.91, Math.min(1.17, this.pulseScale + this.pulseVelocity * dt));

    // Decay transient tap energy, screen pulse, and micro-shake
    this.tapEnergy = Math.max(0, this.tapEnergy - dt * 2.4);
    this.screenFlash = Math.max(0, this.screenFlash - dt * 2.9);
    this.shakeMag *= Math.pow(0.0005, dt);
    if (this.shakeMag < 0.05) this.shakeMag = 0;

    // Meteorite spawner
    this.nextMeteorTimer -= dt;
    if (this.nextMeteorTimer <= 0) {
      if (this.meteorites.length < 3) {
        this.spawnMeteorite();
      }
      this.nextMeteorTimer = 3.0 + Math.random() * 4.0;
    }

    // Update meteorites
    for (let i = this.meteorites.length - 1; i >= 0; i--) {
      const m = this.meteorites[i];
      if (m.absorbing) {
        m.absorbT += dt * 3.4;
        const u = Math.min(1, m.absorbT);
        // Smooth ease-in-out quadratic Bezier magnetic curve into the planet core
        const t = u * u * (3 - 2 * u);
        const inv = 1 - t;
        m.x = inv * inv * m.startX + 2 * inv * t * m.ctrlX + t * t * this.planetCx;
        m.y = inv * inv * m.startY + 2 * inv * t * m.ctrlY + t * t * this.planetCy;
        m.angle += m.spin * dt * 4.5;

        // Magnetic spark stream particles pulled toward the planet
        m.trailAccum += dt * 55;
        while (m.trailAccum >= 1) {
          m.trailAccum -= 1;
          const toPx = this.planetCx - m.x;
          const toPy = this.planetCy - m.y;
          const dist = Math.hypot(toPx, toPy) || 1;
          const streamSpd = 90 + Math.random() * 90;
          this.pushParticle({
            x: m.x + (Math.random() - 0.5) * 10,
            y: m.y + (Math.random() - 0.5) * 10,
            vx: (toPx / dist) * streamSpd + (Math.random() - 0.5) * 45,
            vy: (toPy / dist) * streamSpd + (Math.random() - 0.5) * 45,
            life: 0,
            maxLife: 0.24 + Math.random() * 0.14,
            size: 2.0 + Math.random() * 2.0,
            color: Math.random() < 0.35 ? '#ffffff' : m.hue,
            glow: true,
          });
        }

        if (m.absorbT >= 1) {
          this.spawnBurst(this.planetCx, this.planetCy, m.hue, 24, true);
          this.pushShockwave({
            x: this.planetCx,
            y: this.planetCy,
            radius: this.basePlanetRadius * 0.85,
            maxRadius: this.basePlanetRadius * 1.88,
            life: 0,
            maxLife: 0.54,
            color: m.hue,
            dual: true,
          });
          this.triggerPulse(1.05, 0.65, 4.2, m.hue);
          this.meteorites.splice(i, 1);
        }
      } else {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.angle += m.spin * dt;

        // Shed subtle comet ember sparks along flight path
        m.trailAccum += dt * 16;
        if (m.trailAccum >= 1) {
          m.trailAccum -= 1;
          this.pushParticle({
            x: m.x + (Math.random() - 0.5) * m.radius * 0.6,
            y: m.y + (Math.random() - 0.5) * m.radius * 0.6,
            vx: -m.vx * 0.18 + (Math.random() - 0.5) * 24,
            vy: -m.vy * 0.18 + (Math.random() - 0.5) * 24,
            life: 0,
            maxLife: 0.28 + Math.random() * 0.18,
            size: 1.5 + Math.random() * 1.8,
            color: Math.random() < 0.3 ? '#fef3c7' : m.hue,
            glow: true,
          });
        }

        if (
          m.x < -120 ||
          m.x > this.width + 120 ||
          m.y < -120 ||
          m.y > this.height + 120
        ) {
          this.meteorites.splice(i, 1);
        }
      }
    }

    // Update particles
    const pDamp = Math.pow(0.06, dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= pDamp;
      p.vy *= pDamp;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Update floating texts
    const ftDamp = Math.pow(0.18, dt);
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      ft.x += ft.vx * dt;
      ft.y += ft.vy * dt;
      ft.vy *= ftDamp;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private render(timeSec: number): void {
    if (this.width <= 0 || this.height <= 0) return;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const shakeX = this.shakeMag > 0 ? Math.cos(this.shakeAngle + timeSec * 55) * this.shakeMag : 0;
    const shakeY = this.shakeMag > 0 ? Math.sin(this.shakeAngle + timeSec * 55) * this.shakeMag : 0;

    // 1. Colorful drifting space nebula clouds (cached offscreen canvases)
    const minDim = Math.min(this.width, this.height);
    for (const neb of this.nebulae) {
      const nx =
        neb.baseX * this.width +
        Math.sin(timeSec * neb.driftSpeedX + neb.phase) * this.width * 0.08 +
        shakeX * 0.15;
      const ny =
        neb.baseY * this.height +
        Math.cos(timeSec * neb.driftSpeedY + neb.phase) * this.height * 0.08 +
        shakeY * 0.15;
      const r = minDim * neb.radius * (1 + Math.sin(timeSec * 0.3 + neb.phase) * 0.06);
      ctx.globalAlpha = neb.alpha * (0.88 + 0.12 * Math.sin(timeSec * 0.4 + neb.phase));
      ctx.drawImage(neb.canvas, nx - r, ny - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // 2. Deep multi-layer parallax twinkling starfield
    for (const s of this.stars) {
      const twinkle = 0.42 + 0.58 * Math.sin(timeSec * s.twinkleSpeed + s.phase);
      const px = s.x + shakeX * (s.depth * 0.45);
      const py = s.y + shakeY * (s.depth * 0.45);
      const alpha = s.alpha * twinkle;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(px, py, s.size, 0, Math.PI * 2);
      ctx.fill();

      if (s.flare && twinkle > 0.72) {
        ctx.globalAlpha = alpha * 0.55;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 0.9;
        const arm = s.size * 2.6 * twinkle;
        ctx.beginPath();
        ctx.moveTo(px - arm, py);
        ctx.lineTo(px + arm, py);
        ctx.moveTo(px, py - arm);
        ctx.lineTo(px, py + arm);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Apply subtle camera shake to gameplay foreground layer
    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 3. Subtle radial screen pulse flash on tap / meteor impact
    if (this.screenFlash > 0.01) {
      const pulseR = Math.max(this.width, this.height) * 0.68;
      const fGrad = ctx.createRadialGradient(
        this.planetCx,
        this.planetCy,
        this.basePlanetRadius * 0.6,
        this.planetCx,
        this.planetCy,
        pulseR
      );
      fGrad.addColorStop(0, this.screenFlashColor);
      fGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.save();
      ctx.globalAlpha = this.screenFlash * 0.18;
      ctx.fillStyle = fGrad;
      ctx.fillRect(-10, -10, this.width + 20, this.height + 20);
      ctx.restore();
    }

    // 4. Crisp radial shockwaves
    for (const s of this.shockwaves) {
      const t = s.life / s.maxLife;
      const easeOut = 1 - Math.pow(1 - t, 3);
      const r = s.radius + (s.maxRadius - s.radius) * easeOut;

      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.78;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3.0 * (1 - t) + 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();

      if (s.dual) {
        const rInner = s.radius + (s.maxRadius - s.radius) * Math.max(0, easeOut - 0.14);
        ctx.globalAlpha = (1 - t) * 0.42;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4 * (1 - t) + 0.4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rInner, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. Evolving Planet
    const currentRadius = this.basePlanetRadius * this.pulseScale;
    drawPlanet(
      ctx,
      this.planetCx,
      this.planetCy,
      currentRadius,
      this.planet,
      this.rotationPhase,
      {
        evolution: this.massEvolution,
        energy: this.tapEnergy,
        timeSec,
      }
    );

    // 6. Magnetic spark stream filaments while absorbing meteorites
    for (const m of this.meteorites) {
      if (m.absorbing) {
        this.drawMagneticStream(ctx, m, timeSec);
      }
    }

    // 7. Passing & absorbing meteorites
    for (const m of this.meteorites) {
      this.drawMeteorite(ctx, m, timeSec);
    }

    // 8. Particles
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      const radius = Math.max(0.4, p.size * (1 - t * 0.55));
      ctx.globalAlpha = (1 - t) * (p.glow ? 0.95 : 0.85);
      if (p.glow) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = (1 - t) * 0.28;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1 - t;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 9. Floating neon +MASS / METEOR! popups
    for (const ft of this.floatingTexts) {
      const t = ft.life / ft.maxLife;
      const alpha = t < 0.16 ? t / 0.16 : 1 - Math.pow((t - 0.16) / 0.84, 1.4);
      const popScale = t < 0.18 ? 0.72 + (t / 0.18) * 0.42 : 1.14 - Math.min(0.14, (t - 0.18) * 0.35);

      ctx.save();
      ctx.translate(ft.x, ft.y);
      ctx.scale(popScale, popScale);
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (ft.badge) {
        ctx.font = `800 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
        ctx.strokeText(ft.badge, 0, -17);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(ft.badge, 0, -17);
      }

      ctx.font = `700 ${Math.round(16 * ft.scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.88)';
      ctx.strokeText(ft.text, 0, 0);

      // Subtle neon outer tint pass
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawMagneticStream(
    ctx: CanvasRenderingContext2D,
    m: Meteorite,
    timeSec: number
  ): void {
    const fade = Math.max(0, 1 - m.absorbT * 0.45);
    ctx.save();

    // Outer plasma beam
    const grad = ctx.createLinearGradient(m.x, m.y, this.planetCx, this.planetCy);
    grad.addColorStop(0, m.hue);
    grad.addColorStop(0.55, this.planet.accent);
    grad.addColorStop(1, '#ffffff');

    const midX = (m.x + this.planetCx) * 0.5 + Math.sin(timeSec * 36 + m.id) * 14;
    const midY = (m.y + this.planetCy) * 0.5 + Math.cos(timeSec * 32 + m.id) * 14;

    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.45 * fade;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.quadraticCurveTo(midX, midY, this.planetCx, this.planetCy);
    ctx.stroke();

    // Crisp electric core filament
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.85 * fade;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.quadraticCurveTo(midX, midY, this.planetCx, this.planetCy);
    ctx.stroke();

    ctx.restore();
  }

  private drawMeteorite(
    ctx: CanvasRenderingContext2D,
    m: Meteorite,
    timeSec: number
  ): void {
    const scale = m.absorbing ? Math.max(0.22, 1 - m.absorbT * 0.78) : 1;
    const r = m.radius * scale;

    ctx.save();

    // Glowing cosmic comet tail along reverse velocity
    if (!m.absorbing) {
      const speed = Math.hypot(m.vx, m.vy) || 1;
      const nx = m.vx / speed;
      const ny = m.vy / speed;
      const tailLen = r * 4.8;
      const tx = m.x - nx * tailLen;
      const ty = m.y - ny * tailLen;

      // Wide outer plasma cone
      const outerGrad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      outerGrad.addColorStop(0, m.hue);
      outerGrad.addColorStop(0.5, this.planet.accent);
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.strokeStyle = outerGrad;
      ctx.lineWidth = r * 1.45;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.42;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Bright white-hot inner comet core streak
      const coreTx = m.x - nx * (r * 3.1);
      const coreTy = m.y - ny * (r * 3.1);
      const coreGrad = ctx.createLinearGradient(m.x, m.y, coreTx, coreTy);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.45, m.hue);
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.strokeStyle = coreGrad;
      ctx.lineWidth = r * 0.55;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(coreTx, coreTy);
      ctx.stroke();
    }

    // Pulsing outer halo for tap readability
    const haloPulse = 1 + Math.sin(timeSec * 7 + m.id) * 0.1;
    const haloGrad = ctx.createRadialGradient(m.x, m.y, r * 0.4, m.x, m.y, r * 1.95 * haloPulse);
    haloGrad.addColorStop(0, m.hue);
    haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r * 1.95 * haloPulse, 0, Math.PI * 2);
    ctx.fill();

    // Glowing leading bow-shock arc along velocity vector
    if (!m.absorbing) {
      const moveAngle = Math.atan2(m.vy, m.vx);
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(moveAngle);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = Math.max(1.4, r * 0.14);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.18, -Math.PI * 0.36, Math.PI * 0.36);
      ctx.stroke();
      ctx.restore();
    }

    // Jagged rocky body
    ctx.globalAlpha = 1;
    ctx.translate(m.x, m.y);
    ctx.rotate(m.angle);
    ctx.beginPath();
    const n = m.vertices.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const vr = r * m.vertices[i];
      const px = Math.cos(a) * vr;
      const py = Math.sin(a) * vr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    const rockGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    rockGrad.addColorStop(0, '#fef3c7');
    rockGrad.addColorStop(0.45, m.hue);
    rockGrad.addColorStop(1, '#451a03');
    ctx.fillStyle = rockGrad;
    ctx.fill();

    // Inner rocky craters & glowing fracture line
    ctx.fillStyle = 'rgba(41, 16, 4, 0.48)';
    ctx.beginPath();
    ctx.arc(-r * 0.22, r * 0.18, r * 0.2, 0, Math.PI * 2);
    ctx.arc(r * 0.28, -r * 0.16, r * 0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fef9c3';
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.28);
    ctx.lineTo(0, -r * 0.02);
    ctx.lineTo(r * 0.25, r * 0.22);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}
