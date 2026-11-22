// Accent colour for a category on the till (category buttons and product tiles).
// Categories nobody gave a colour (the database default is near-black, the Categories page
// default is white) get one from this palette, so the till stays light and categories still differ.
// A colour picked on the Categories page is always kept.
const PALETTE = ['#2f7d6d', '#c2410c', '#4f46e5', '#b45309', '#0e7490', '#be185d',
    '#15803d', '#7c3aed', '#a16207', '#1d4ed8', '#9f1239', '#047857'];
const UNSET_COLORS = ['', '#1f1d1d', '#fff', '#ffffff', 'white', 'null', 'undefined'];

export const categoryAccent = (categoryId, color) => {
    const value = String(color ?? '').trim().toLowerCase();
    if (!UNSET_COLORS.includes(value)) return color;
    const n = Number(categoryId);
    return Number.isFinite(n) ? PALETTE[Math.abs(n) % PALETTE.length] : '#6b7785';
};

// Light tinted background for a category accent.
export const categoryTint = (accent, percent = 14) => `color-mix(in srgb, ${accent} ${percent}%, #ffffff)`;
