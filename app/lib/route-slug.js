export function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// "azamgarh-to-delhi" → { from: "Azamgarh", to: "Delhi" }
// "new-delhi-to-lucknow" → { from: "New Delhi", to: "Lucknow" }
export function parseRouteSlug(slug) {
  const decoded = decodeURIComponent(slug || '');
  const idx = decoded.indexOf('-to-');
  if (idx === -1) return { from: decoded, to: decoded };
  const fromSlug = decoded.slice(0, idx);
  const toSlug = decoded.slice(idx + 4);
  const capitalize = s =>
    s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { from: capitalize(fromSlug), to: capitalize(toSlug) };
}
