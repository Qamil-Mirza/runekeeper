# Design System Document: The Hearthside Keeper

## 1. Overview & Creative North Star
**Creative North Star: The Tavern Journal**
This design system evokes the feeling of sitting in a cozy medieval tavern by the fire, pulling out a well-worn notebook to plan the week ahead. The aesthetic is dark, warm, and enveloping—dark timber surfaces, firelight accents, and parchment content surfaces that glow against the dark.

The system uses a **two-zone layout**: dark timber (sidebar + chat) and warm parchment (schedule/content areas). Typography, textures, and tonal depth create an intimate, firelit atmosphere. The personality is that of a "Hearthside Keeper": warm, wise, and inviting.

---

## 2. Colors: The Hearthside Palette
The palette is built around dark timber browns, warm parchment, and firelight accents. Dark by default with no light/dark toggle.

### Surface & Tonal Architecture (Dark Timber)
- **Base Surface (`surface` #2c1810):** Dark timber — the primary canvas. Apply wood grain texture at 6% opacity via `.wood-grain` class.
- **Surface Dim (`surface-dim` #1a1008):** Deepest dark — sidebar and navigation.
- **Surface Bright (`surface-bright` #3d2518):** Slightly lighter timber for hover states and alternating rows.

### Parchment Content Surfaces
- **Container Lowest (`surface-container-lowest` #f0dbb8):** Warm parchment for floating cards, AI chat bubbles.
- **Container (`surface-container` #dcc8a0):** Schedule/calendar background. Use `.paper-grain` texture.
- **Container High (`surface-container-high` #d4bc90):** Input fields on parchment areas.
- **Container Highest (`surface-container-highest` #ccb488):** Active states on parchment.
- **Parchment Context:** Use `.parchment-context` class on parchment surfaces to override text colors to dark ink (#3a2410).

### Accents & Emphasis
- **Warm Gold (`primary` #d4a860):** Primary interactive color, structural elements, navigation highlights.
- **Dried Blood Red (`secondary` #9b4342):** Unchanged — critical errors, high-importance.
- **Firelight Orange (`tertiary` #c87828):** Primary CTA color, time block accents, discovery elements.

### Text Colors
- **On dark surfaces:** `on-surface` (#f0dbb8) — light warm text.
- **On parchment surfaces:** `#3a2410` (dark ink) — applied via `.parchment-context` or explicit classes.
- **Secondary text on dark:** `on-surface-variant` (rgba(212,168,96,0.6)) — gold-tinted.

---

## 3. Typography: The Editorial Scale
We rely on **Newsreader** to provide a bespoke, scholarly elegance. The contrast between massive display sizes and tightly tracked labels creates a "Signature" look.

- **Display & Headlines:** Use `display-lg` (3.5rem) and `headline-lg` (2rem) with tight leading. These should feel like the titles of chapters in a grimoire.
- **Body Text:** `body-lg` (1rem) is our workhorse. Ensure line-height is generous (1.6x) to maintain the "Enchanted Archivist" focus on extreme legibility.
- **Labels:** We shift to **Work Sans** (`label-md`) for utility text. This subtle "san-serif" break signals to the user that they are interacting with a modern interface tool rather than reading the "manuscript" content.

---

## 4. Elevation & Depth: Tonal Layering
Depth is achieved through the two-zone contrast and warm shadow staining.

- **Two-Zone Layout:** Dark timber shell (sidebar + chat) contrasts with warm parchment content (schedule). This creates natural visual hierarchy.
- **Parchment Cards on Dark:** Content cards use `surface-container-lowest` (#f0dbb8) with warm ambient shadows (`0 8px 50px rgba(0,0,0,0.35), 0 0 30px rgba(220,150,50,0.06)`). The warm outer glow simulates firelight.
- **Wood Grain Texture:** Dark surfaces use `.wood-grain` class with directional SVG noise (baseFrequency 0.03×0.3) at 6% opacity.
- **Paper Grain Texture:** Parchment surfaces use `.paper-grain` class with fractal noise at 4% opacity.
- **Ghost Border:** `rgba(212,168,96,0.1)` inset box-shadow for subtle warm boundaries.
- **Vellum Overlay:** Dark timber glassmorphism (`rgba(44,24,16,0.85)` with 12px backdrop-blur) for mobile overlays.

## 4b. Campfire Animation (Landing Page)
- CSS-only flame using layered `::before`/`::after` pseudo-elements with `border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%`.
- Colors: gradient from firelight (#c87828) through gold (#d4a860).
- `@keyframes flicker` with 2-3s cycle for organic movement.
- `.campfire-glow` radial gradient for ambient light cast.
- Respects `prefers-reduced-motion` with static warm glow fallback.

---

## 5. Components: The Archivist’s Tools

### Buttons
- **Primary:** A solid block of `tertiary` (#c87828 firelight) with dark text (#1a1008). **Corner radius is 0px.** Sharp edges reinforced.
- **Secondary:** Bottom-border only using warm gold `rgba(212,168,96,0.3)`. Light text on dark.
- **Ghost:** Text in `rgba(212,168,96,0.6)` with `rgba(212,168,96,0.05)` hover background.

### Input Fields
- **Text Inputs:** No bounding boxes. Use a background of `surface_container_high` (#f0e8d0) with a 2px bottom-border of `primary_dim`. Labels must be in `label-sm` (Work Sans) to provide a "metadata" feel.

### Cards & Lists
- **The "No Divider" Rule:** Forbid the use of horizontal lines. Separate list items using the spacing scale (e.g., `spacing-4` / 1.4rem) or by alternating background tones between `surface` and `surface_container_low`.
- **Atmospheric Tooltips:** High-contrast `inverse_surface` (#100e08) with `inverse_on_surface` text. These should feel like small, heavy lead weights holding down the "paper" of the UI.

### Signature Component: The "Archivist Scroll"
A custom progress indicator for long-form content that uses an ink-wash gradient (`primary` to `primary_container`) to show reading depth, appearing as a vertical stain on the right edge of the viewport.

---

## 6. Do’s and Don'ts

### Do:
- **Use White Space as a Border:** Use `spacing-10` or `spacing-12` to separate major conceptual blocks.
- **Vary Tones for Importance:** Use `surface_bright` to draw the eye to the most important interactive zone.
- **Embrace Asymmetry:** Align text to a strong left axis, but allow "stamped" elements or images to sit slightly off-grid.

### Don’t:
- **No Rounded Corners:** `0px` is the standard. Circles are permitted only for user avatars.
- **No Pure Black:** Never use #000000. Use `on_surface` (#373220) for the look of aged, carbon-based ink.
- **No Vibrant Transitions:** Avoid "slick" sliding animations. Use subtle "fade-in" or "ink-spread" transitions (200ms-300ms ease-in-out).

---

## 7. Spacing Scale (Key References)
- **Micro-spacing:** `1` (0.35rem) for label-to-input relationships.
- **Rhythm:** `4` (1.4rem) for standard gutte
r and paragraph spacing.
- **Editorial Break:** `16` (5.5rem) for separating the "Header" from the "Folio" content.
