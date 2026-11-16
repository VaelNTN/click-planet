export type PlanetPattern =
  | 'craters'
  | 'continents'
  | 'bands'
  | 'swirl'
  | 'magma'
  | 'ice';

export interface PlanetColor {
  id: number;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
  pattern: PlanetPattern;
  hasRing?: boolean;
}

export const PLANET_COLORS: PlanetColor[] = [
  {
    id: 0,
    name: 'Crimson Mars',
    primary: '#e63946',
    secondary: '#7f1d1d',
    accent: '#ff8fa3',
    glow: 'rgba(230, 57, 70, 0.45)',
    pattern: 'craters',
  },
  {
    id: 1,
    name: 'Ocean Terra',
    primary: '#0284c7',
    secondary: '#0c4a6e',
    accent: '#4ade80',
    glow: 'rgba(56, 189, 248, 0.45)',
    pattern: 'continents',
  },
  {
    id: 2,
    name: 'Emerald Terra',
    primary: '#10b981',
    secondary: '#064e3b',
    accent: '#a7f3d0',
    glow: 'rgba(16, 185, 129, 0.45)',
    pattern: 'continents',
  },
  {
    id: 3,
    name: 'Solar Gold',
    primary: '#f59e0b',
    secondary: '#92400e',
    accent: '#fef08a',
    glow: 'rgba(245, 158, 11, 0.5)',
    pattern: 'bands',
  },
  {
    id: 4,
    name: 'Amethyst Nebula',
    primary: '#8b5cf6',
    secondary: '#4c1d95',
    accent: '#ddd6fe',
    glow: 'rgba(139, 92, 246, 0.48)',
    pattern: 'swirl',
  },
  {
    id: 5,
    name: 'Glacier Cyan',
    primary: '#06b6d4',
    secondary: '#164e63',
    accent: '#cffafe',
    glow: 'rgba(6, 182, 212, 0.48)',
    pattern: 'ice',
  },
  {
    id: 6,
    name: 'Volcanic Magma',
    primary: '#dc2626',
    secondary: '#270a0a',
    accent: '#fbbf24',
    glow: 'rgba(239, 68, 68, 0.52)',
    pattern: 'magma',
  },
  {
    id: 7,
    name: 'Obsidian Void',
    primary: '#475569',
    secondary: '#0f172a',
    accent: '#cbd5e1',
    glow: 'rgba(148, 163, 184, 0.35)',
    pattern: 'craters',
  },
  {
    id: 8,
    name: 'Coral Sunset',
    primary: '#fb7185',
    secondary: '#9f1239',
    accent: '#fde047',
    glow: 'rgba(251, 113, 133, 0.45)',
    pattern: 'bands',
  },
  {
    id: 9,
    name: 'Mint Gas Giant',
    primary: '#2dd4bf',
    secondary: '#115e59',
    accent: '#99f6e4',
    glow: 'rgba(45, 212, 191, 0.45)',
    pattern: 'bands',
    hasRing: true,
  },
  {
    id: 10,
    name: 'Copper Rust',
    primary: '#c2410c',
    secondary: '#431407',
    accent: '#fdba74',
    glow: 'rgba(234, 88, 12, 0.45)',
    pattern: 'craters',
  },
  {
    id: 11,
    name: 'Cobalt Storm',
    primary: '#3b82f6',
    secondary: '#1e3a8a',
    accent: '#93c5fd',
    glow: 'rgba(59, 130, 246, 0.5)',
    pattern: 'swirl',
  },
  {
    id: 12,
    name: 'Rose Quartz',
    primary: '#ec4899',
    secondary: '#831843',
    accent: '#fbcfe8',
    glow: 'rgba(236, 72, 153, 0.46)',
    pattern: 'ice',
  },
  {
    id: 13,
    name: 'Jade Ringed',
    primary: '#22c55e',
    secondary: '#14532d',
    accent: '#bbf7d0',
    glow: 'rgba(34, 197, 94, 0.45)',
    pattern: 'bands',
    hasRing: true,
  },
  {
    id: 14,
    name: 'Amber Dune',
    primary: '#d97706',
    secondary: '#78350f',
    accent: '#fde68a',
    glow: 'rgba(217, 119, 6, 0.45)',
    pattern: 'continents',
  },
  {
    id: 15,
    name: 'Sapphire Deep',
    primary: '#2563eb',
    secondary: '#0f172a',
    accent: '#38bdf8',
    glow: 'rgba(37, 99, 235, 0.48)',
    pattern: 'ice',
  },
  {
    id: 16,
    name: 'Neon Lime',
    primary: '#84cc16',
    secondary: '#365314',
    accent: '#ecfccb',
    glow: 'rgba(132, 204, 22, 0.46)',
    pattern: 'swirl',
  },
  {
    id: 17,
    name: 'Magenta Nova',
    primary: '#d946ef',
    secondary: '#701a75',
    accent: '#f5d0fe',
    glow: 'rgba(217, 70, 239, 0.5)',
    pattern: 'magma',
  },
  {
    id: 18,
    name: 'Silver Moon',
    primary: '#cbd5e1',
    secondary: '#475569',
    accent: '#f8fafc',
    glow: 'rgba(226, 232, 240, 0.42)',
    pattern: 'craters',
  },
  {
    id: 19,
    name: 'Tangerine Flare',
    primary: '#f97316',
    secondary: '#7c2d12',
    accent: '#ffedd5',
    glow: 'rgba(249, 115, 22, 0.5)',
    pattern: 'magma',
    hasRing: true,
  },
];

export function getPlanetColor(id: number): PlanetColor {
  return PLANET_COLORS[id] ?? PLANET_COLORS[0];
}
