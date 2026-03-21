# Design System Document: The Enchanted Archivist

## 1. Overview & Creative North Star
**Creative North Star: The Living Manuscript**
This design system rejects the sterile, "app-like" aesthetic of modern SaaS in favor of a high-end editorial experience. It is designed to feel like a rare, weathered artifact found in a sun-drenched library—a "Living Manuscript" that balances the atmospheric soul of ancient parchment with the rigorous legibility of a modern scholarly journal.

The system breaks the "template" look through **intentional asymmetry** and **tonal depth**. Rather than using rigid grids and dividers, we define space through "ink-wash" backgrounds and layered paper textures. It is an "Enchanted Archivist" personality: authoritative, timeless, and slightly mysterious, yet meticulously organized.

---

## 2. Colors: The Sepia Palette
The palette moves away from synthetic vibrant tones toward a "dirty," desaturated spectrum of organic pigments—ink, gold, and dried botanical stains.

### Surface & Tonal Architecture
- **Base Surface (`surface` #fff9ed):** The primary canvas. It should never feel like a flat hex code; apply a subtle, non-tiling paper grain texture at 3-5% opacity.
- **Surface Tiers:** Use `surface_container_low` (#faf3e3) for large layout blocks and `surface_container_highest` (#ebe2c7) for localized points of interest.
- **The "No-Line" Rule:** Explicitly prohibit 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. A sidebar is not "bordered"; it is simply a vertical slab of `surface_dim` (#e3dabb) resting against the `surface` (#fff9ed) main stage.

### Accents & Emphasis
- **Primary Ink (`primary` #5f5e5e):** A faded charcoal. Use this for structural elements that need to feel like they were printed by an 18th-century press.
- **The Stained Accent (`secondary` #9b4342):** A "dried blood" red. Use sparingly for critical errors or high-importance alerts.
- **The Gilded Accent (`tertiary` #745b29):** A "vintage gold." This is our primary interaction color for call-to-actions, signifying value and discovery.

---

## 3. Typography: The Editorial Scale
We rely on **Newsreader** to provide a bespoke, scholarly elegance. The contrast between massive display sizes and tightly tracked labels creates a "Signature" look.

- **Display & Headlines:** Use `display-lg` (3.5rem) and `headline-lg` (2rem) with tight leading. These should feel like the titles of chapters in a grimoire.
- **Body Text:** `body-lg` (1rem) is our workhorse. Ensure line-height is generous (1.6x) to maintain the "Enchanted Archivist" focus on extreme legibility.
- **Labels:** We shift to **Work Sans** (`label-md`) for utility text. This subtle "san-serif" break signals to the user that they are interacting with a modern interface tool rather than reading the "manuscript" content.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are forbidden. We achieve depth through the **Layering Principle**.

- **Atmospheric Stacking:** To create a "card," place a `surface_container_lowest` (#ffffff) object onto a `surface_container` (#f5edda) background. This creates a soft, natural "lift" mimicking a fresh sheet of paper laid atop a weathered desk.
- **Ambient Shadows:** For floating elements (menus/modals), use a "Shadow Stain." The shadow color must be a tinted version of `on_surface` (#373220) at 5% opacity with a massive 40px-60px blur. It should look like an ambient occlusion glow, not a plastic shadow.
- **The Ghost Border:** If a boundary is strictly required for accessibility, use `outline_variant` (#bab298) at 15% opacity. It must be felt, not seen.
- **Ink-Wash Glassmorphism:** For overlays, use `surface_container_low` with a 12px backdrop-blur. This simulates a "vellum" effect, allowing the "ink" of the content below to bleed through softly.

---

## 5. Components: The Archivist’s Tools

### Buttons
- **Primary:** A solid block of `tertiary` (#745b29) with `on_tertiary` text. **Corner radius is 0px.** Sharp edges are mandatory to reinforce the "cut paper" aesthetic.
- **Secondary:** An "Ink-Outline" style using a 1px `outline` (#817b64) but only on the bottom edge, mimicking a signature line.
- **Tertiary:** Pure text in `secondary` (#9b4342) with a subtle "ink-bleed" hover state (slight opacity increase).

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
