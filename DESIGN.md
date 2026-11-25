---
name: Rail
description: Bar management software for operators, a dense navy-and-amber dashboard that reads like a night manager's clipboard.
colors:
  primary: "#1E40AF"
  primary-on-dark: "#7EA6FF"
  cta-amber: "#D97706"
  cta-amber-ink: "#1A1206"
  amber-text: "#92400E"
  brand-blue: "#3B82F6"
  canvas: "#F8FAFC"
  card: "#FFFFFF"
  ink-navy: "#1E3A8A"
  mist: "#E9EEF6"
  slate-text: "#475569"
  hairline: "#DBEAFE"
  control-edge: "#7C93B5"
  destructive: "#DC2626"
  sidebar-navy: "#0E1729"
  sidebar-text: "#DCE5F5"
  sidebar-active: "#1B2A45"
  dark-canvas: "#0B1220"
  dark-card: "#131C2E"
  dark-ink: "#E8EDF7"
typography:
  display:
    fontFamily: "Fira Code, ui-monospace, monospace"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Fira Code, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Fira Code, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Fira Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Fira Code, ui-monospace, monospace"
    fontSize: "0.6875rem"
    fontWeight: 600
    letterSpacing: "0.18em"
rounded:
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  pill: "20.8px"
spacing:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-destructive:
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.xl}"
    padding: "16px 0"
  input:
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "4px 10px"
  badge:
    rounded: "{rounded.pill}"
    height: "20px"
    padding: "2px 8px"
  sidebar:
    backgroundColor: "{colors.sidebar-navy}"
    textColor: "{colors.sidebar-text}"
---

# Design System: Rail

## Overview

**Creative North Star: "The Night Manager's Clipboard"**

Rail is a working tool for someone standing behind a bar at the end of a long night. The system is built to be read quickly, with one hand, on a phone, in dim light: large tabular figures, short plain-English labels, and clearly bounded cards. It is confident and approachable rather than austere. Stat cards get a small tinted icon chip, empty states explain what to connect, and quick actions are labelled by what they do, not by where they live.

The structure is a deep-navy shell around a pale cool-grey canvas. White cards sit on the canvas separated by a hairline ring, not heavy shadow. Fira Code gives headings and figures a ledger-like precision that reads as deliberate typography; Fira Sans carries everything else. Amber is the single signal color and is spent sparingly, on the primary call to action and on eyebrow labels. Density is high by design (a dashboard-grade spacing scale), but touch targets rise to 44px on narrow screens so the density never costs the floor user a missed tap.

**Key Characteristics:**
- Navy shell, light cool canvas, white hairline-ringed cards; a full dark theme with its own verified values.
- Monospace headings and tabular numerals: "numbers are the product".
- One amber accent, used as a signal, never as decoration.
- Contrast is verified, not assumed: every text pair is 4.5:1 or better, every control boundary 3:1.
- Dense on desktop, 44px touch targets and 16px inputs on mobile.
- Prints cleanly: Z reports and pay runs print in black on white with chrome removed.

## Colors

A cool blue-grey field with a deep navy structure and one warm amber signal. Hex values below are the normative source in the frontmatter.

### Primary
- **Data Navy** (#1E40AF): the primary action color, focus ring, and chart series 1. Fills primary buttons with white text (8.72:1).
- **Lit Periwinkle** (#7EA6FF): the primary in dark mode and the active item color in the sidebar. It replaces Data Navy wherever the surface is dark.

### Secondary
- **Signal Amber** (#D97706): the brand call-to-action fill, always paired with near-black ink (#1A1206, 5.82:1), never white (white-on-amber is 3.19:1 and fails).
- **Amber Text** (#92400E): amber as text on a light surface (eyebrow labels), 6.78:1. In dark mode amber text lifts to #FBBF24.
- **Signal Blue** (#3B82F6): a secondary brand hue for charts and illustrative accents only.

### Neutral
- **Cool Canvas** (#F8FAFC): the page background.
- **Card White** (#FFFFFF): cards and popovers.
- **Ink Navy** (#1E3A8A): body text and headings on light surfaces (9.90:1 on canvas). Text in this system is navy, not black.
- **Mist** (#E9EEF6): hover surfaces, muted fills, secondary and accent slots.
- **Slate Text** (#475569): muted and supporting copy (7.24:1).
- **Hairline** (#DBEAFE): decorative dividers only.
- **Control Edge** (#7C93B5): borders that carry meaning (inputs, controls), 3.14:1 per WCAG 1.4.11.
- **Destructive Red** (#DC2626): errors and destructive actions; the destructive button is a tint, not a solid fill.
- **Shell Navy** (#0E1729), **Shell Text** (#DCE5F5) and **Shell Active** (#1B2A45): the sidebar.
- **Dark Canvas** (#0B1220), **Dark Card** (#131C2E), **Dark Ink** (#E8EDF7): the dark theme surfaces.

### Named Rules
**The One Signal Rule.** Amber is the only warm hue. It marks the one action or label that deserves attention on a screen; it is never a hover color or a fill for decoration.

**The Two-Tier Border Rule.** Decorative dividers use Hairline. Anything whose edge matters to a user (inputs, selects, controls) uses Control Edge. Never use the hairline for an interactive boundary.

**The Navy Text Rule.** Body and heading text is navy. Pure black text appears only in print.

## Typography

**Display / Heading Font:** Fira Code (with ui-monospace fallback), ligatures off
**Body Font:** Fira Sans (with system-ui fallback), weights 400 / 500 / 600 / 700
**Label/Mono Font:** Fira Code

**Character:** A technical, ledger-like heading voice over a friendly humanist body. The pairing gives headings a distinct texture from copy, so a page's structure is legible at a glance.

### Hierarchy
- **Display** (700, ~2.25rem, 1.1): the dashboard greeting and page titles; set tight (-0.025em).
- **Headline** (700, ~1.5rem, 1.2): page-level headings and large stat numbers.
- **Title** (600, 0.875rem, 1.3): card titles ("Inventory Health", "Recent Activity").
- **Body** (400, 0.875rem, 1.5): all UI copy. Inputs are 16px on mobile to prevent iOS zoom, 0.875rem from the md breakpoint up.
- **Label / Eyebrow** (600, 0.6875rem, +0.18em, uppercase): section kickers such as "QUICK ACTIONS" and "NEEDS ATTENTION", in amber text.

### Named Rules
**The Tabular Rule.** Tables and anything marked `.tabular` use tabular figures so columns of currency, stock counts and Z totals align.

**The Headings-Are-Mono Rule.** h1 through h6 are Fira Code; body copy is never set in the mono face.

## Layout

A fixed left sidebar (grouped into Overview, Stock, People & Pay, Money, Ordering, Setup) beside a scrolling content column inside a rounded inset panel. The content column is a flex column, so a page's root becomes its content; pages cap at roughly 5xl to 7xl and centre. Cards sit in 4-up stat rows and 2-column panels on desktop and collapse to 2-up and single columns on mobile.

Below 768px the sidebar gives way to a bottom navigation bar (4rem plus the safe-area inset) with a floating action button above it. Pages reserve generous bottom clearance (9rem plus safe-area inset) so the last card is never trapped under the bar or button. Spacing follows a dense dashboard scale (2 / 4 / 8 / 12 / 16 / 24 / 32px), used in tight 8 to 16px gaps inside cards and 24px between sections.

## Elevation & Depth

Hybrid, leaning flat. Cards rest on a one-pixel hairline ring (foreground at 10% opacity) with no shadow at rest. Depth appears on interaction: a `.lift` hover swaps in a larger shadow and a stronger border, and never a transform that moves layout. The sidebar's deep navy against the pale canvas carries the main figure-ground hierarchy.

### Shadow Vocabulary
- **Subtle lift** (`0 1px 2px rgb(15 23 42 / 0.05)`): resting emphasis on a card.
- **Card** (`0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.05)`): raised cards and buttons.
- **Overlay** (`0 10px 15px -3px rgb(15 23 42 / 0.10), 0 4px 6px -4px rgb(15 23 42 / 0.06)`): hover lift, dropdowns, dialogs.
- **Feature** (`0 20px 25px -5px rgb(15 23 42 / 0.14), 0 8px 10px -6px rgb(15 23 42 / 0.08)`): reserved, rarely used.

### Named Rules
**The No-Shift Hover Rule.** Hover states change shadow and border only; no hover moves, scales or resizes a layout.

## Shapes

Softly rounded, never pill-shaped except for badges. The base radius is 8px; controls and buttons use 8px, cards use the next step up (about 11px), small chips and inner elements step down to roughly 5 to 6px, and badges are fully pill-shaped (about 21px). Icon chips on stat cards are rounded squares. Cards are bounded by a hairline ring rather than a hard border. There is no clipping or angular geometry in the app shell.

## Components

### Buttons
- **Shape:** 8px radius, 32px tall by default (24 / 28 / 36 for xs / sm / lg), icon variants are square.
- **Primary:** Data Navy fill, white text, 10px horizontal padding. The one amber call-to-action fill is a separate brand token (Signal Amber with near-black ink).
- **Hover / Focus:** fill steps to 80% opacity on anchors; a 3px focus ring at 50% of the ring color plus a visible 2px outline at 2px offset; a pressed state nudges down 1px.
- **Secondary / Ghost / Outline:** Mist fills and borders on hover; outline uses the hairline border (Control Edge in dark mode).
- **Destructive:** a red tint (10% fill, red text), not a solid red block.
- **Mobile:** every button, link-button and role=button is at least 44 by 44px below 768px.

### Chips and Badges
- **Style:** 20px tall pill, 12px text, transparent border, small icons at 12px.

### Cards / Containers
- **Corner Style:** about 11px (rounded-xl).
- **Background:** Card White on Cool Canvas; Dark Card in dark mode.
- **Shadow Strategy:** hairline ring at rest, lift on hover only where the card is interactive.
- **Internal Padding:** 16px vertical, 16px horizontal on content, 12px for the small size.
- **Stat Card (signature):** a tinted rounded-square icon chip (blue, red, green, purple or amber tint at low saturation), then a large mono figure in a matching hue, a bold label, and a muted sub-line.

### Inputs / Fields
- **Style:** 32px tall, 8px radius, Control Edge border, transparent fill; 16px text on mobile, 0.875rem from md.
- **Focus:** border shifts to the ring color with a 3px ring at 50% opacity.
- **Error / Disabled:** invalid state turns the border destructive with a soft red ring; disabled drops to 50% opacity on a muted fill.
- **Labels:** every visible label is programmatically tied to its field; the shared Label component links itself to the next control when no `htmlFor` is given.

### Navigation
- **Sidebar:** Shell Navy, grouped sections with small caps group labels, items with an icon and label, the active item on Shell Active with Lit Periwinkle accenting; collapsible via a toggle rail.
- **Mobile bottom bar:** four primary destinations plus More, with a floating action button above it.
- **Header:** a thin bar with the sidebar toggle, the RAIL wordmark in mono, the bar name, and utility icons (display, notifications, account).

### Tabs
- A segmented control track with 3px padding; Settings uses a horizontal line-variant tab strip that scrolls on narrow screens.

## Do's and Don'ts

### Do:
- **Do** pair Signal Amber with near-black ink (#1A1206); never put white text on amber.
- **Do** use Amber Text (#92400E) for amber on light surfaces and #FBBF24 in dark mode.
- **Do** keep control boundaries at Control Edge (3:1) and decorative dividers at Hairline.
- **Do** set numbers in tabular figures and headings in Fira Code with ligatures off.
- **Do** keep hover effects to shadow and border changes; keep touch targets at 44px on mobile and inputs at 16px.
- **Do** reserve 9rem plus the safe-area inset at the bottom of mobile pages so the floating button never covers content.
- **Do** say what is missing: an empty state names what to connect rather than showing a zero.

### Don't:
- **Don't** use amber for hover states or purely decorative fills; it is the one signal color.
- **Don't** use the hairline color for an input or control edge.
- **Don't** let a hover transform shift layout.
- **Don't** hard-code colors; use the semantic tokens so the dark theme and print styles keep working.
- **Don't** set body copy in the mono face, or headings in Fira Sans.
- **Don't** nest a second `<main>` inside the app layout.
