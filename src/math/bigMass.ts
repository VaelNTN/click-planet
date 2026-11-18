export interface BigMass {
  /** Normalized mantissa in [1, 10) */
  m: number;
  /** Integer base-10 exponent: value = m * 10^e kg */
  e: number;
}

export const START_MASS: BigMass = { m: 1, e: -2 }; // 0.01 kg

export function normalizeMass(m: number, e: number): BigMass {
  if (!Number.isFinite(m) || !Number.isFinite(e) || m <= 0) {
    return { ...START_MASS };
  }
  let nm = m;
  let ne = Math.trunc(e);
  let guard = 0;
  while (nm >= 10 && guard < 2000) {
    nm /= 10;
    ne += 1;
    guard++;
  }
  while (nm < 1 && guard < 2000) {
    nm *= 10;
    ne -= 1;
    guard++;
  }
  if (!Number.isFinite(nm) || !Number.isFinite(ne) || nm <= 0) {
    return { ...START_MASS };
  }
  return { m: nm, e: ne };
}

export function getMassLog10(mass: BigMass): number {
  const norm = normalizeMass(mass.m, mass.e);
  return Math.log10(norm.m) + norm.e;
}

export function compareMass(a: BigMass, b: BigMass): number {
  const na = normalizeMass(a.m, a.e);
  const nb = normalizeMass(b.m, b.e);
  if (na.e !== nb.e) return na.e > nb.e ? 1 : -1;
  if (na.m === nb.m) return 0;
  return na.m > nb.m ? 1 : -1;
}

export function maxMass(a: BigMass, b: BigMass): BigMass {
  const na = normalizeMass(a.m, a.e);
  const nb = normalizeMass(b.m, b.e);
  return compareMass(na, nb) >= 0 ? na : nb;
}

export function addMass(a: BigMass, b: BigMass): BigMass {
  const na = normalizeMass(a.m, a.e);
  const nb = normalizeMass(b.m, b.e);
  const big = compareMass(na, nb) >= 0 ? na : nb;
  const small = big === na ? nb : na;
  const diff = big.e - small.e;
  if (diff > 16) {
    return { ...big };
  }
  const combinedM = big.m + small.m * Math.pow(10, -diff);
  return normalizeMass(combinedM, big.e);
}

export function mulMass(a: BigMass, factor: number): BigMass {
  const na = normalizeMass(a.m, a.e);
  if (!Number.isFinite(factor) || factor <= 0) {
    return na;
  }
  return normalizeMass(na.m * factor, na.e);
}

export function computePlanetClickGain(
  currentMass: BigMass,
  clickCount: number
): { newMass: BigMass; deltaMass: BigMass; isPercent: boolean } {
  const safeMass = normalizeMass(currentMass.m, currentMass.e);
  const safeClicks = Number.isFinite(clickCount) ? Math.max(0, clickCount) : 0;
  if (safeClicks < 10) {
    // First 10 clicks: +4 to +5 kg per click
    const kg = 4 + Math.random();
    const deltaMass = normalizeMass(kg, 0);
    const newMass = addMass(safeMass, deltaMass);
    return { newMass, deltaMass, isPercent: false };
  }
  // After 10 clicks: +0.01% per click (* 1.0001)
  const newMass = mulMass(safeMass, 1.0001);
  const deltaMass = mulMass(safeMass, 0.0001);
  return { newMass, deltaMass, isPercent: true };
}

export function computeMeteoriteGain(currentMass: BigMass): {
  newMass: BigMass;
  deltaMass: BigMass;
} {
  const safeMass = normalizeMass(currentMass.m, currentMass.e);
  // 5-10 kg at the beginning, scales with total mass later (0.5% - 1.5% of mass)
  const baseKg = 5 + Math.random() * 5;
  const baseMass = normalizeMass(baseKg, 0);
  const scaleFactor = 0.005 + Math.random() * 0.01;
  const scaledMass = mulMass(safeMass, scaleFactor);
  const deltaMass = maxMass(baseMass, scaledMass);
  const newMass = addMass(safeMass, deltaMass);
  return { newMass, deltaMass };
}

export interface FormattedMassParts {
  isScientific: boolean;
  text: string;
  mantissa?: string;
  exponent?: number;
}

export function formatMassParts(mass: BigMass): FormattedMassParts {
  const norm = normalizeMass(mass.m, mass.e);

  if (norm.e < 6) {
    const val = norm.m * Math.pow(10, norm.e);
    if (norm.e < -2) {
      return { isScientific: false, text: val.toFixed(4) };
    }
    if (norm.e === 1) {
      return { isScientific: false, text: val.toFixed(3) };
    }
    if (norm.e < 3) {
      return { isScientific: false, text: val.toFixed(2) };
    }
    return {
      isScientific: false,
      text: val.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    };
  }

  return {
    isScientific: true,
    mantissa: norm.m.toFixed(4),
    exponent: norm.e,
    text: `${norm.m.toFixed(4)} × 10^${norm.e}`,
  };
}

export function formatMassString(mass: BigMass): string {
  return `${formatMassParts(mass).text} kg`;
}

export function formatDeltaShort(delta: BigMass): string {
  const norm = normalizeMass(delta.m, delta.e);
  if (norm.e >= -3 && norm.e < 5) {
    const val = norm.m * Math.pow(10, norm.e);
    if (val < 1) return `+${val.toFixed(4)} kg`;
    if (val < 100) return `+${val.toFixed(2)} kg`;
    return `+${Math.round(val).toLocaleString('en-US')} kg`;
  }
  return `+${norm.m.toFixed(2)}×10^${norm.e} kg`;
}
