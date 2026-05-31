# Cheap Travels India — Brand Direction

The brand name is **Cheap Travels India**. The brand asset is `Logo.png`, supplied by you and now embedded directly in the mockup, brain map, and ticket templates.

## The Logo

`Logo.png` lives in the project folder. All HTML files reference it via relative path (`src="Logo.png"`), so when this folder is deployed to a web server the logo will load automatically.

Layout: "Cheap" stacked above a bold "Travels", a stylised teal arrow/leaf graphic to the right, and "India" in orange. Forest green + orange palette.

### Where it appears in the mockup

- Header (top-left, ~48 px tall) — main brand identity
- Footer (on dark green background, white card behind it for contrast)
- E-ticket header (on dark green band, white card behind it)
- QR centre uses a simplified "CTi" monogram (full logo is too small to be readable inside a 256×256 QR)

## Colours extracted from your logo

| Token | Hex | Sample | Role |
|---|---|---|---|
| Primary Green | `#0E7B4F` | forest green | Header, CTA, brand surfaces, page accents |
| Deep Green | `#094B30` | dark forest | Hero gradient end, footer, dark text on light |
| Mark Teal | `#14B58C` | leaf-teal | Hero gradient highlight, decorative |
| Orange | `#EE8C2E` | India orange | "Save" pills, savings badge, CTAs, accents |
| Soft Orange | `#FBE2C3` | warm tint | Discount chips, success-warm backgrounds |
| Ink | `#0B1220` | near-black | Body text |
| Ink-2 | `#475569` | slate | Secondary text |
| Surface | `#FAFAF7` | off-white | Page background |
| Card | `#FFFFFF` | white | Card surfaces |
| Trust Green | `#16A34A` | bright green | Verified badges, payment success |

These values are wired into both `02-brain-map.html` and `03-mockup-cheap-travels.html` as CSS variables (`--teal`, `--teal-d`, `--gold`, etc. — names kept for compatibility; values are now your real palette).

## Typography

- Headings: **Plus Jakarta Sans** (modern, premium, free via Google Fonts)
- Body: **Inter** (high-legibility on Indian feature phones too)
- Numerals (fare displays): tabular Inter for clean alignment

## Tagline options (pick one — currently the mockup carries no tagline since your logo speaks for itself)

1. **"Affordable travel · Trusted tickets."**
2. **"India's most affordable bus booking."**
3. **"Sasti booking, pakka ticket."** *(Hindi-mix — usually converts better in North India)*

## Trust-signal voice (used throughout the UI)

- "Verified agent network" — never "third-party reseller".
- "Ticket pushed directly from operator portal" — repeat on hero, checkout, ticket footer.
- "Auto-refund if ticket not issued in 30 minutes" — the strongest single line; bake it into the QR receipt too.
- Always show customer-care number, WhatsApp number, refund policy link in the header.

## Logo do's and don'ts

- Always preserve clear space around the logo equal to the height of the "C".
- On dark backgrounds (footer, ticket header), use CSS filters (e.g. `filter: brightness(0) invert(1)`) to render the logo in clean white, ensuring readability without needing white background containers. This is already implemented in the mockup.
- Don't recolour, don't add effects.
- Don't put text "Cheap Travels India" next to the logo — the logo already contains the wordmark.
- If you ever need a square favicon / app-icon, ask for an "icon-only" version derived from the teal arrow/leaf graphic.
