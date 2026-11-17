import { PlanetColor } from '../data/planets';
import { drawPlanet } from './planetRenderer';

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
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
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
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
}

export interface PlanetStageCallbacks {
  onPlanetTap: (x: number, y: number) => string;
  onMeteoriteAbsorb: (x: number, y: number) => string;
}

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
  private pulseScale = 1;
  private pulseVelocity = 0;
  private rotationPhase = 0;

  private stars: Star[] = [];
  private meteorites: Meteorite[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private shockwaves: Shockwave[] = [];

  private nextMeteorTimer = 2.2;
  private meteorIdSeq = 1;
  private rafId: number | null = null;
  private lastTime = 0;
  private active = false;

  constructor(
    canvas: HTMLCanvasElement,
    planet: PlanetColor,
    callbacks: PlanetStageCallbacks
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context not available');
    }
    this.ctx = context;
    this.planet = planet;
    this.callbacks = callbacks;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.loop = this.loop.bind(this);
  }

  public setPlanet(planet: PlanetColor): void {
    this.planet = planet;
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.active = false;
    window.removeEventListener('resize', this.handleResize);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private handleResize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);

    this.planetCx = this.width * 0.5;
    this.planetCy = this.height * 0.5;
    this.basePlanetRadius = Math.max(
      64,
      Math.min(this.width, this.height) * 0.25
    );

    if (this.stars.length === 0) {
      this.initStars();
    } else {
      // Redistribute stars cleanly on resize
      this.initStars();
    }
  }

  private initStars(): void {
    const count = Math.min(130, Math.max(55, Math.floor((this.width * this.height) / 5500)));
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 0.7 + Math.random() * 1.8,
        alpha: 0.25 + Math.random() * 0.75,
        twinkleSpeed: 0.8 + Math.random() * 2.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private handlePointerDown(ev: PointerEvent): void {
    ev.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;

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

        const label = this.callbacks.onMeteoriteAbsorb(m.x, m.y);
        this.spawnBurst(m.x, m.y, '#fbbf24', 16);
        this.spawnFloatingText(m.x, m.y - 12, label, '#fde047', 1.15);
        this.pulseVelocity += 0.55;
        return;
      }
    }

    // 2. Check planet body strictly inside its circular radius
    const currentRadius = this.basePlanetRadius * this.pulseScale;
    const distToPlanet = Math.hypot(x - this.planetCx, y - this.planetCy);
    if (distToPlanet <= currentRadius) {
      const label = this.callbacks.onPlanetTap(x, y);
      this.pulseVelocity += 0.34;
      this.shockwaves.push({
        x: this.planetCx,
        y: this.planetCy,
        radius: currentRadius * 0.96,
        maxRadius: currentRadius * 1.48,
        life: 0,
        maxLife: 0.42,
        color: this.planet.accent,
      });
      this.spawnBurst(x, y, this.planet.accent, 8);
      this.spawnFloatingText(x, y - 16, label, '#f8fafc', 1);
      return;
    }

    // 3. Clicked outside planet & meteorites: zero mass gained, subtle empty-space ripple
    this.shockwaves.push({
      x,
      y,
      radius: 2,
      maxRadius: 16,
      life: 0,
      maxLife: 0.24,
      color: 'rgba(148, 163, 184, 0.35)',
    });
  }

  private spawnMeteorite(): void {
    if (this.width < 100 || this.height < 100) return;
    const fromLeft = Math.random() < 0.5;
    const margin = 48;

    // Pick a passing lane above or below the planet so it visibly flies past
    const offsetSign = Math.random() < 0.5 ? -1 : 1;
    const minPassDist = this.basePlanetRadius * 1.32;
    const maxPassDist = Math.max(minPassDist + 24, Math.min(this.width, this.height) * 0.44);
    const passDist = minPassDist + Math.random() * (maxPassDist - minPassDist);

    const startX = fromLeft ? -margin : this.width + margin;
    const endX = fromLeft ? this.width + margin : -margin;

    const laneY = Math.max(
      40,
      Math.min(this.height - 40, this.planetCy + offsetSign * passDist)
    );
    const startY = laneY + (Math.random() - 0.5) * 90;
    const endY = laneY + (Math.random() - 0.5) * 90;

    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 105 + Math.random() * 85;

    const radius = 16 + Math.random() * 7;
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
      hitRadius: radius + 16,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 3.2,
      vertices,
      hue: hues[Math.floor(Math.random() * hues.length)],
      absorbing: false,
      absorbT: 0,
      startX,
      startY,
    });
  }

  private spawnBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 145;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.28,
        size: 2 + Math.random() * 2.8,
        color,
      });
    }
  }

  private spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    scale: number
  ): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -56,
      text,
      life: 0,
      maxLife: 0.78,
      color,
      scale,
    });
  }

  private loop(now: number): void {
    if (!this.active) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    this.update(dt);
    this.render(now / 1000);

    this.rafId = requestAnimationFrame(this.loop);
  }

  private update(dt: number): void {
    // Gentle planet rotation
    this.rotationPhase += dt * 0.045;

    // Spring physics for planet tap pulse
    const springForce = (1 - this.pulseScale) * 140;
    this.pulseVelocity += springForce * dt;
    this.pulseVelocity *= Math.pow(0.004, dt);
    this.pulseScale = Math.max(0.92, Math.min(1.16, this.pulseScale + this.pulseVelocity * dt));

    // Meteorite spawner
    this.nextMeteorTimer -= dt;
    if (this.nextMeteorTimer <= 0) {
      if (this.meteorites.length < 3) {
        this.spawnMeteorite();
      }
      this.nextMeteorTimer = 3.2 + Math.random() * 4.2;
    }

    // Update meteorites
    for (let i = this.meteorites.length - 1; i >= 0; i--) {
      const m = this.meteorites[i];
      if (m.absorbing) {
        m.absorbT += dt * 4.2;
        const ease = 1 - Math.pow(1 - Math.min(1, m.absorbT), 2);
        m.x = m.startX + (this.planetCx - m.startX) * ease;
        m.y = m.startY + (this.planetCy - m.startY) * ease;
        m.angle += m.spin * dt * 4;

        // Trail particles while absorbing into the planet
        if (Math.random() < 0.7) {
          this.particles.push({
            x: m.x,
            y: m.y,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            life: 0,
            maxLife: 0.25,
            size: 2.5,
            color: m.hue,
          });
        }

        if (m.absorbT >= 1) {
          this.spawnBurst(this.planetCx, this.planetCy, m.hue, 18);
          this.shockwaves.push({
            x: this.planetCx,
            y: this.planetCy,
            radius: this.basePlanetRadius * 0.85,
            maxRadius: this.basePlanetRadius * 1.65,
            life: 0,
            maxLife: 0.48,
            color: m.hue,
          });
          this.meteorites.splice(i, 1);
        }
      } else {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.angle += m.spin * dt;
        if (
          m.x < -100 ||
          m.x > this.width + 100 ||
          m.y < -100 ||
          m.y > this.height + 100
        ) {
          this.meteorites.splice(i, 1);
        }
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
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
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.96;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private render(timeSec: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.width, this.height);

    // Twinkling stars
    for (const s of this.stars) {
      const twinkle = 0.45 + 0.55 * Math.sin(timeSec * s.twinkleSpeed + s.phase);
      ctx.globalAlpha = s.alpha * twinkle;
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Shockwaves behind/around planet
    for (const s of this.shockwaves) {
      const t = s.life / s.maxLife;
      const r = s.radius + (s.maxRadius - s.radius) * (1 - Math.pow(1 - t, 2));
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Planet
    const currentRadius = this.basePlanetRadius * this.pulseScale;
    drawPlanet(
      ctx,
      this.planetCx,
      this.planetCy,
      currentRadius,
      this.planet,
      this.rotationPhase
    );

    // Passing meteorites
    for (const m of this.meteorites) {
      this.drawMeteorite(ctx, m);
    }

    // Particles
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Floating +mass texts
    for (const ft of this.floatingTexts) {
      const t = ft.life / ft.maxLife;
      ctx.save();
      ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      ctx.font = `700 ${Math.round(16 * ft.scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1.5);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawMeteorite(ctx: CanvasRenderingContext2D, m: Meteorite): void {
    const scale = m.absorbing ? Math.max(0.2, 1 - m.absorbT * 0.8) : 1;
    const r = m.radius * scale;

    ctx.save();
    // Tail glow along reverse velocity
    if (!m.absorbing) {
      const speed = Math.hypot(m.vx, m.vy) || 1;
      const tx = m.x - (m.vx / speed) * r * 3.4;
      const ty = m.y - (m.vy / speed) * r * 3.4;
      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, m.hue);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = r * 1.15;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // Outer halo for visibility
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = m.hue;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r * 1.55, 0, Math.PI * 2);
    ctx.fill();

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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.restore();
  }
}
