---
name: html-design-prototype
description: "ALWAYS use this skill when an agent needs to render a design as HTML for visual review. Triggers on: 'static HTML mockup', 'HTML prototype', 'show me what it looks like in HTML', 'mockup of a screen', 'mobile + desktop preview', 'design system demo', 'static page I can review', or any request for a single `.html` file with embedded CSS and no JavaScript. Output: ONE self-contained `.html` (semantic HTML + CSS custom properties on `:root` + responsive mobile/desktop + 4 states via CSS-only switcher). Specifically NOT for: real React/Vue/Next.js apps, A/B testing infrastructure, Figma-to-code conversion, static site generators (Astro/Hugo/Jekyll), form submission with real APIs, or lo-fi gray-box wireframes. This skill renders the design; the `coder` agent implements it. When `ui-ux-designer` emits its 📦 DELIVERABLE static HTML artifact, this skill produces it. When in doubt between this and a framework-specific skill, prefer this one if the user said 'no JavaScript' or 'static HTML'."
license: MIT
compatibility: opencode, claude-code, cursor, agentskills-compatible runtimes
---

# HTML Design Prototype

A skill that teaches any agent how to turn a design spec into a single, self-contained, static HTML file that visually represents a design — without functionality, without JavaScript, without build tools, without external dependencies. The output is one file the dev can open in a browser to see the design rendered.

## When to use this skill

Use it whenever the task is "I have a design (or a brief that implies a design) and I need to SEE it as HTML." Concretely:

- The dev says: "make me a mockup", "show me what it would look like", "give me a static HTML for X", "I need a high-fi prototype of this screen", "generate an HTML preview of this design", "dame el HTML", "muéstrame la UI en HTML", "hazme un prototipo"
- Another agent (e.g., `ui-ux-designer`) needs to emit its `📦 DELIVERABLE` static HTML artifact (`.context/design/<slug>.html`)
- The user provides tokens + layout + content and expects a rendered HTML file
- The design is meant to be reviewed visually before any code is written

Do **NOT** use this skill for:

- Real interactive apps (forms that submit, navigations, real state) — that's `coder` + a framework-specific skill
- Wireframes at very low fidelity (lo-fi sketches, gray boxes, paper prototypes) — that's a different tool
- Figma-imported designs needing a code translation — that's `figma-compose` for Kotlin/Android, or a Figma-to-HTML tool
- Image generation or visual design exploration — that's the `frontend-design` skill
- Image rendering, real photos, real data — this skill uses CSS placeholders only

## Inputs

The agent should expect ONE of:

1. **A canon file at `.context/design/<slug>.md`** (preferred). Read it first; tokens, palette, typography, spacing, radius, motion, list of views, and content come from there. The canon is the source of truth.
2. **An inline design spec in the prompt**: tokens (named or with hex values), layout description, content, viewport targets.
3. **A reference to a `ui-ux-designer` output**: if the caller already has the 8 blocks (`🎨 BRIEF`, `🧩 TOKENS`, `📐 LAYOUT`, etc.), use `🧩 TOKENS` and `📐 LAYOUT` as the spec.

If none of these are present, ask the caller. Do not invent a design.

## Output contract

**One file, no exceptions.** Single self-contained HTML file. The path is:

- `.context/design/<slug>.html` (default, matches the toolkit's canonical path used by `ui-ux-designer`)
- Or a path the caller specifies in the prompt (e.g., `./mockups/login.html`)

The file MUST contain:

1. **`<!DOCTYPE html>` declaration** — full HTML5 document.
2. **`<html lang="...">`** — set the `lang` attribute based on the content's primary language (e.g., `lang="es"` for Spanish content).
3. **`<meta charset="utf-8">` and `<meta name="viewport" content="width=device-width, initial-scale=1">`** — both required for proper rendering.
4. **`<title>`** — page title matching the design.
5. **A `<style>` block** in `<head>` with:
   - `:root { --color-... --space-... --font-... --radius-... --motion-... }` — design tokens as CSS custom properties.
   - Reset / base styles (`* { box-sizing: border-box; }`, `body { margin: 0; }`, font smoothing).
   - Layout utilities (`.container`, `.stack`, `.grid`).
   - Component styles (`.btn`, `.input`, `.card`, `.nav`, etc.) using the tokens via `var(--...)`.
   - Responsive media queries — **mobile-first** with `min-width` breakpoints at 768px (tablet) and 1024px (desktop).
   - `:focus-visible` styles for keyboard accessibility.
   - CSS-only state switcher using `:target` or hidden radio inputs (see Process step 6).
6. **Semantic HTML body** with:
   - Logical landmarks: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` as appropriate.
   - All views included (mobile + desktop shown via tabs, sections, or side-by-side at wide viewports).
   - All states visible (loading, empty, error, success) as separate `<section data-state="...">` elements.
   - Accessible: alt text on images, ARIA labels, focus styles, keyboard navigation, semantic heading hierarchy (`h1` > `h2` > `h3`).

The file MUST NOT contain:

- Any `<script>` tags or inline JavaScript (no event handlers, no `onclick`, no `<script type="module">`).
- Any external resources (no CDN, no Google Fonts, no Tailwind CDN, no `<link>` to other files, no `<img src="https://...">`).
- Any inline `style="..."` attributes on elements (move everything to the `<style>` block; tokens via custom properties).
- Any build-tool artifacts (no `dist/`, no `node_modules/`, no `package.json`, no transpilation).
- Any non-rendering content like tutorial comments (this is the FINAL output, not a how-to).

The file CAN contain (optional, but recommended):

- A small "view switcher" that toggles between mobile and desktop preview using CSS-only techniques.
- A "states switcher" that toggles between loading/empty/error/success using CSS-only techniques.
- Subtle "design notes" via collapsed `<details>` elements explaining non-obvious decisions (e.g., why a button uses a specific radius).

## Process

Follow this sequence. Each step builds on the previous.

### 1. Read the spec

- If a canon file exists (`.context/design/<slug>.md`), read it first. Token names, view list, content, and accessibility requirements come from there.
- If the prompt has inline spec, parse tokens (hex values or names), views, and content.
- If neither, ask. **Do not invent a design.**

### 2. Extract tokens

Convert the spec's tokens into CSS custom properties on `:root`. Use semantic names; never hardcode values in component styles.

```css
:root {
  /* Color */
  --color-bg: #ffffff;
  --color-surface: #f8f8f8;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #6b6b6b;
  --color-border: #e0e0e0;
  --color-brand-primary: #2563eb;
  --color-state-success: #16a34a;
  --color-state-warning: #f59e0b;
  --color-state-error: #dc2626;

  /* Typography */
  --font-display: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-body: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.5rem;
  --font-size-2xl: 2rem;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;

  /* Motion (used sparingly in static prototypes) */
  --motion-duration-fast: 150ms;
  --motion-duration-base: 250ms;
  --motion-easing: cubic-bezier(0.4, 0, 0.2, 1);
}
```

Use the spec's named tokens if provided; otherwise use sensible defaults. **Do not use Tailwind classes or any utility-class framework** — keep it pure CSS so the file is self-contained.

### 3. Build semantic structure

For each view, write semantic HTML first (no styling):

- Use real elements: `<button>` for buttons, `<a href="#">` for navigation, `<input>`, `<label>`, `<form>`, `<header>`, `<main>`, `<footer>`, `<nav>`, `<section>`, `<article>`.
- Wire up `aria-label`, `aria-labelledby`, `aria-describedby` where appropriate.
- Include all views in the file (mobile + desktop as separate sections or shown side-by-side at large viewports).
- Include all states as separate sections marked with `<section data-state="loading">` etc.

### 4. Style with tokens

Apply CSS using the custom properties. Use semantic class names (BEM-style or similar):

```css
.btn {
  padding: var(--space-3) var(--space-6);
  background: var(--color-brand-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: background var(--motion-duration-fast) var(--motion-easing);
}
.btn:hover { background: color-mix(in srgb, var(--color-brand-primary) 90%, black); }
.btn:focus-visible {
  outline: 2px solid var(--color-brand-primary);
  outline-offset: 2px;
}
```

### 5. Make it responsive

Mobile-first. Default styles target mobile (≤768px); scale up with `min-width`:

```css
.container { padding: var(--space-4); }
.card { display: block; }

@media (min-width: 768px) {
  .container { padding: var(--space-6) var(--space-8); max-width: 1200px; margin: 0 auto; }
  .card { display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-6); }
}

@media (min-width: 1024px) {
  .container { padding: var(--space-8) var(--space-12); }
}
```

At wide viewports, the browser shows the desktop layout. The same file works on both viewports.

### 6. Add state demos (CSS-only switcher)

States are sections. To let the dev switch between them without JavaScript, use the `:target` pseudo-class:

```css
[data-state] { display: none; }
[data-state].is-active,
[data-state]:target { display: block; }
```

Plus a simple nav at the top of the file:

```html
<nav class="state-nav" aria-label="Switch state">
  <a href="#loading" class="state-nav__link">Loading</a>
  <a href="#empty" class="state-nav__link">Empty</a>
  <a href="#error" class="state-nav__link">Error</a>
  <a href="#success" class="state-nav__link">Success</a>
</nav>

<main>
  <section data-state="loading" id="loading" class="is-active">...</section>
  <section data-state="empty" id="empty">...</section>
  <section data-state="error" id="error">...</section>
  <section data-state="success" id="success">...</section>
</main>
```

This works in any browser, no JS. The first state (`is-active` class) shows by default; clicking a nav link shows the corresponding state via `:target`.

### 7. Self-check before delivering

Before writing the file, verify:

- [ ] The file is ONE `.html` file. No separate CSS, no JS, no images, no fonts.
- [ ] All tokens used in CSS are defined as custom properties on `:root`.
- [ ] All interactive elements (`<button>`, `<a>`, `<input>`) have visible `:focus-visible` styles.
- [ ] The HTML is valid (no unclosed tags, no duplicate IDs).
- [ ] The page works at 320px, 768px, and 1280px viewports (mentally walk through the layout).
- [ ] The page uses no external resources (no `https://` links in the visible content, no `<link>` to other files, no CDN imports, no `<img src="https://...">`).
- [ ] The file size is under ~50KB (sanity check for "minimum").
- [ ] The title (`<title>`) describes the design.
- [ ] At least one `<main>` landmark and a valid heading hierarchy (`h1` > `h2` > `h3`).
- [ ] Zero `<script>` tags and zero inline event handlers in the entire file.
- [ ] All states (loading, empty, error, success) are visible via the CSS-only switcher.

If any check fails, fix it before writing.

## Common patterns

Common UI patterns (card, form, nav, skeleton, empty/error states, button variants, image placeholder, container, grid, skip-link, state switcher, tab switcher) are documented in `@references/html-patterns.md` with drop-in HTML + CSS snippets. Load that file when you need a starting point for a specific component — don't try to recall patterns from memory, and don't reinvent them inline. All patterns use semantic HTML, reference tokens via `var(--...)`, and work without JavaScript.

## Anti-patterns to reject

| The dev says… | You respond | Why |
|---|---|---|
| "Add a tiny script to handle the menu toggle" | "The state switcher uses `:target` CSS only, no JS. If a more complex interaction is needed, this is the wrong skill — use `coder` + a framework." | Violates "no JavaScript" rule. |
| "Just inline a `<link rel='stylesheet'>` to a CDN" | "External resources are not allowed. Move all CSS to the `<style>` block in the head, use system fonts or a `font-family` stack." | Violates "no external resources" rule. |
| "Add `style="color: #2563eb"` on this button" | "Inline styles are forbidden in this skill. Add a class to the `<style>` block and reference the token via `var(--color-brand-primary)`." | Violates "tokens via custom properties" rule. |
| "Use Tailwind classes for speed" | "No utility-class frameworks. The file must be self-contained CSS. Add the styles to the `<style>` block using tokens." | Tailwind adds an external dependency. |
| "Use an `<img src='https://placehold.co/...'>` for the placeholder" | "No external image URLs. Use a CSS gradient or inline SVG placeholder instead." | Violates "no external resources" rule. |
| "Skip the empty state, the user will figure it out" | "All four states (loading, empty, error, success) are part of the output contract. Skip the brief, not the states." | Part of the non-negotiable structure. |
| "I'll add the responsive styles later, just do desktop first" | "Mobile-first is part of the output contract. The file must include `min-width` media queries so it works at 375px and 1280px." | Responsive is non-negotiable. |
| "Don't worry about focus styles, this is just a mockup" | "Focus-visible styles are part of the accessibility baseline. Even mockups should be keyboard-navigable so reviewers can use them." | A11y is part of the contract. |
| "Hardcode the brand color, the design is one-off" | "Even for one-offs, declare `--color-brand-primary: #...` on `:root` and reference it. Hex values only appear inside `:root`, never in component styles." | Maintains the single-source-of-truth pattern. |

## Constraints (non-negotiable)

1. **One file, no exceptions.** The output is always one `.html` file.
2. **No JavaScript.** Not even `<script>` tags, not even inline event handlers, not even `onclick=`.
3. **No external resources.** No CDN, no Google Fonts, no `<link>` to other files, no `<img src="https://...">`. If a design needs an image, use a CSS gradient or an inline `<svg>`.
4. **Semantic HTML.** Use real elements (`<button>`, `<nav>`, `<main>`, `<header>`). Never use `<div onclick>` for buttons.
5. **Tokens only via CSS custom properties.** No hardcoded hex values in component styles. Use `var(--...)` everywhere. The only place hex appears is inside `:root`.
6. **Mobile-first responsive.** Default to mobile, scale up with `min-width` media queries.
7. **Accessibility baseline.** Focus visible, alt text, ARIA labels, semantic structure, color contrast ≥4.5:1 for text.
8. **No build tools.** No `<script type="module">`, no imports, no JSX, no transpilation. The file opens in a browser as-is.
9. **CSS-only state switcher.** States (loading/empty/error/success) are visible via `:target` or hidden radio inputs, never JavaScript.
10. **File size under ~50KB.** If the design forces you past this, simplify the content (use placeholders for repeated text) before adding more markup.

## What this skill does NOT do

- **Real interactivity.** Forms don't submit, buttons don't navigate, no client-side state. For that, use the `coder` agent + a framework-specific skill.
- **Image rendering.** No `<img src="https://...">` — if the design needs images, the caller provides them as data URIs or the agent uses CSS gradients or inline SVG placeholders.
- **Authentication, real data, real API calls.** Pure visual mockup.
- **Figma translations.** For converting Figma designs to code, use `figma-compose` (Kotlin) or a Figma-to-HTML tool.
- **Animations that require JS.** Hover states with CSS are fine. CSS-only keyframe animations (e.g., skeleton shimmer) are fine. Anything that needs `setTimeout` or `addEventListener` is not.

## When stuck

- **No spec at all**: ask the caller. Don't invent.
- **Spec is in a different format** (e.g., Figma export, image, hand-drawn sketch): say so and recommend a different skill or workflow.
- **Caller wants real interactivity**: redirect to `coder` for a real implementation. This skill is for static mockups.
- **Design is too complex for a single file**: split into multiple files, but each file follows these same rules. Note: this is a fallback, not the default.
- **Caller asks for a specific framework** (React, Vue, etc.): that's a different skill (`react-nextjs`, `react-native-expo`, etc.). This skill is framework-free.

## Integration notes

- This skill is referenced by `ui-ux-designer` (in its Phase 7 DELIVERABLE) to produce the static HTML artifact (`.context/design/<slug>.html`). The `ui-ux-designer` agent invokes this skill to convert its `🧩 TOKENS` + `📐 LAYOUT` blocks into a real HTML file.
- This skill is **standalone** — any agent can use it directly with an inline spec, even outside the `ui-ux-designer` flow.
- The output of this skill is one of four artifacts in the `ui-ux-designer` deliverable: the static HTML, alongside the canon (`.md`), interactive prototype (`-prototype.html`, with JS), and component library (`-library.md`).
