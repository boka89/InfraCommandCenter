# Design system: "The Night Chart"

## Overview

**Creative North Star: "The Night Chart."** The portal reads like a national weather-warning service for the infrastructure. The ground is a calm, blue-slate night chart; the only loud vocabulary is the warning ramp (0 no warning, 1 be aware, 2 be prepared, 3 take action), applied to every scope — region, site, building — and to every alarm. Cold-front blue carries actions, selection and focus. It is an Operate surface: standard navigation and controls, dense, built for big screens and long evenings, usable on a phone. Anti-references: purple/violet gradient banners, glowing dots, card-in-card hero metrics, emoji as icons.

## Colors

### Primary
- **Cold-Front Blue** (#6aa5ec text / #2f6fc0 fill): links, the primary button, the active nav item's icon, selection (#1c3350), focus rings, the timeline markers, Planner progress. Never used for status.

### Warning ramp (status only)
- **Level 0 Green** (#57a663), **Level 1 Yellow** (#e6bf2c), **Level 2 Orange** (#ee8b2b), **Level 3 Red** (#e2483d). Chips are solid with dark ink (red with white). Text uses lifted inks on dark (#7fc48a, #f0d260, #f5a55a, #f07a70) and darkened inks on light. Tiles at level 1–3 take an 11–13% wash and a 45–50% border of the level colour.

### Neutral
- **Night Ground** (#0d141b) page; **Night Rail** (#0a1016) sidebar and board columns; **Chart Surface** (#131c25) cards; **Chart Surface 2** (#18232e) inputs, chips; **Raised Sheet** (#1c2834) drawers and popovers; **Hairline** (#233141) / **Strong Hairline** (#2e3e50) seams; **Frost** (#e6ecf2) text, **Mist** (#a6b3c0) secondary, **Haze** (#8392a1) tertiary.
- Day chart (light theme): ground #f3f5f7, surface #fff, text #14202b, accent #2463b4.

### Named Rules
**The Warning Rule.** Green, yellow, orange and red mean warning levels and nothing else. Site colours (from structure.yaml) appear only as a small swatch, never as a fill.
**The Shape Rule.** Status is never colour alone: up is a circle, warning a triangle, down a diamond, stopped a ring, unknown a dashed ring; level chips carry their numeral.

## Typography

**UI font:** Barlow (self-hosted, 400–700), tabular figures everywhere. **Label font:** Barlow Semi Condensed 500/600 for table heads, stat labels, chips, form labels, column heads (uppercase, +0.05em). **Data mono:** system monospace for IPs, IDs, code only.

### Hierarchy
- **Headline** (600, 22px, 1.2): page title in the page header.
- **Title** (600, 15px, 1.3): card and group headings.
- **Figure** (600, 20px, 1.15): key figures in the page header; 22px in KPI cells.
- **Body** (400, 14px, 1.45): everything else; prose blocks capped at 75–90ch.
- **Label** (600, 12px, +0.05em, uppercase, semi-condensed): stat labels, table heads, form labels, h3.

Ultrawide (≥3000px) raises the base to 16–17px; no fluid type.

## Layout

Fixed 232px rail (260px ≥3000px) with scope picker, nav, alarms badge, Hermes, user. Main area full width, 22×28px padding (26×44 ≥2000px). Page header = title + one line + a single row of key figures, separated by a hairline — no banner. Grids gap 10–14px; the warning map uses auto-fit tiles ≥280px. Under 860px the rail becomes a sticky top bar with a scrolling nav.

## Elevation & Depth

Flat and tonal. Cards and tiles separate by hairline seams and surface steps, not shadows. Only floating layers (drawer, scope popover) lift: `box-shadow: 0 10px 30px rgba(0,0,0,.45)` dark / `rgba(20,32,43,.16)` light.

## Shapes

Radii: 3px marks, 5px controls and task cards, 8px cards and tiles, pill for chips. No one-sided borders or inset stripes; priority and state are leading marks (P1/P2/P3 tags, level chips).

## Components

### Buttons
- **Primary:** solid cold-front fill, white text, 5px, 7×14px, icon + label; hover darkens.
- **Ghost:** transparent, hairline border, mist text; hover tints. Destructive ghosts use the red ink and sit apart from their neighbours.

### Level chip / warning tile (signature)
- Chip: 18px rounded square with the level numeral + label in semi-condensed caps. Tile: site name + swatch, level chip, worst reason, counts, building chips that rescope on click.

### Cards / Containers
Chart surface, 8px, 1px hairline, 14×16px, no shadow.

### Inputs
Chart Surface 2, strong hairline, 5px; focus = 2px cold-front outline.

### Navigation
Rail items: drawn 1.6-stroke SVG icon + label; active = selection-blue tint, blue icon, 600 weight. Page tabs: 2px cold-front underline.

### Meteogram
Thin 1.5px line over a 12% band with hour gridlines (6 columns) and a baseline hairline.

## Do's and Don'ts

- **Do** express urgency through the warning level, worst first.
- **Do** draw icons from the shared ICON_PATHS set (24-grid, 1.6 stroke).
- **Don't** use gradients, glows, coloured shadows, or purple/violet.
- **Don't** use emoji or unicode glyphs as icons.
- **Don't** add side stripes to rounded boxes; use a leading mark or full border.
- **Don't** use warning colours decoratively or for site identity.
