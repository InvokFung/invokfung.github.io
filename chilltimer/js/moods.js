// Room moods. One named stop sets all six room sounds at once, so nobody has to mix six sliders.
// The third mood of each vibe is that vibe's starting mix.
// `id` never changes: the shown name is the dictionary key `mood.<id>`, with `name` as the English fallback.

const SHARED = [
  { id: 'forest', name: 'Forest', mix: { forest: 0.6, wind: 0.15 } },
  { id: 'shore', name: 'Shore', mix: { ocean: 0.7, wind: 0.2 } }
];

export const MOODS = {
  cozy: [
    { id: 'quiet', name: 'Quiet', mix: {} },
    { id: 'soft-rain', name: 'Soft rain', mix: { rain: 0.35 } },
    { id: 'rain-fire', name: 'Rain and fire', mix: { rain: 0.55, fire: 0.3, wind: 0.12 } },
    { id: 'fireside', name: 'Fireside', mix: { fire: 0.6, rain: 0.15 } },
    { id: 'storm', name: 'Storm', mix: { rain: 0.9, wind: 0.5, fire: 0.2 } },
    ...SHARED
  ],
  lofi: [
    { id: 'quiet', name: 'Quiet', mix: {} },
    { id: 'vinyl', name: 'Vinyl', mix: { vinyl: 0.5 } },
    { id: 'night-rain', name: 'Night rain', mix: { rain: 0.2, vinyl: 0.5, wind: 0.2 } },
    { id: 'rooftop-wind', name: 'Rooftop wind', mix: { wind: 0.5, vinyl: 0.3 } },
    { id: 'downpour', name: 'Downpour', mix: { rain: 0.85, vinyl: 0.3, wind: 0.3 } },
    ...SHARED
  ]
};

// Which mood of the list a mix is, or -1 when it was mixed by hand.
export function moodOf(list, mix) {
  return list.findIndex(m => {
    const keys = new Set([...Object.keys(m.mix), ...Object.keys(mix)]);
    for (const k of keys) if (Math.abs((m.mix[k] || 0) - (mix[k] || 0)) > 0.015) return false;
    return true;
  });
}
