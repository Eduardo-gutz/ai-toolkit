# HTML Patterns Reference

Common UI patterns as drop-in HTML + CSS snippets. Use these as starting points for typical components in a design prototype. All patterns:

- Use only semantic HTML elements
- Reference design tokens via `var(--...)` (no hardcoded values)
- Work without JavaScript
- Are mobile-first

Load this file when you need a specific component pattern and want a working starting point. Don't memorize these — refer to them as needed.

---

## Card with image placeholder, title, body, action

```html
<article class="card">
  <div class="card__media" role="img" aria-label="Description of the image"></div>
  <div class="card__body">
    <h3 class="card__title">Title</h3>
    <p class="card__text">Body text describing the card content.</p>
    <button class="btn btn--primary">Action</button>
  </div>
</article>
```

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.card__media {
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, var(--color-brand-primary), var(--color-state-success));
}
.card__body { padding: var(--space-4); }
.card__title { margin: 0 0 var(--space-2); font-size: var(--font-size-lg); }
.card__text { margin: 0 0 var(--space-4); color: var(--color-text-secondary); }
```

---

## Form with labels, validation states, and submit

```html
<form class="form" novalidate>
  <div class="form__field">
    <label for="email" class="form__label">Email</label>
    <input type="email" id="email" name="email" class="form__input" required aria-describedby="email-error">
    <span class="form__error" id="email-error" role="alert">Please enter a valid email.</span>
  </div>
  <button type="submit" class="btn btn--primary">Sign in</button>
</form>
```

```css
.form__field { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
.form__label { font-size: var(--font-size-sm); font-weight: 600; }
.form__input {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font: inherit;
  background: var(--color-bg);
}
.form__input:focus-visible { outline: 2px solid var(--color-brand-primary); outline-offset: 2px; }
.form__error { color: var(--color-state-error); font-size: var(--font-size-sm); }
```

---

## Navigation with active state

```html
<nav class="nav" aria-label="Main">
  <a href="#home" class="nav__link nav__link--active" aria-current="page">Home</a>
  <a href="#about" class="nav__link">About</a>
  <a href="#contact" class="nav__link">Contact</a>
</nav>
```

```css
.nav { display: flex; gap: var(--space-4); padding: var(--space-4); }
.nav__link { color: var(--color-text-secondary); text-decoration: none; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); }
.nav__link:hover { color: var(--color-text-primary); background: var(--color-surface); }
.nav__link--active { color: var(--color-text-primary); font-weight: 600; }
.nav__link:focus-visible { outline: 2px solid var(--color-brand-primary); outline-offset: 2px; }
```

---

## Loading skeleton (CSS-only shimmer, no JS)

```html
<div class="skeleton" aria-busy="true" aria-label="Loading content">
  <div class="skeleton__line skeleton__line--title"></div>
  <div class="skeleton__line"></div>
  <div class="skeleton__line"></div>
</div>
```

```css
.skeleton__line {
  height: 1em;
  background: linear-gradient(90deg, var(--color-surface) 0%, var(--color-border) 50%, var(--color-surface) 100%);
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-2);
  animation: skeleton-shimmer 1.5s var(--motion-easing) infinite;
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton__line { animation: none; }
}
```

---

## Empty state with CTA

```html
<section class="empty-state">
  <h2 class="empty-state__title">No items yet</h2>
  <p class="empty-state__text">Get started by creating your first item.</p>
  <button class="btn btn--primary">Create item</button>
</section>
```

```css
.empty-state {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--color-text-secondary);
}
.empty-state__title { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 var(--space-2); }
.empty-state__text { margin: 0 0 var(--space-6); }
```

---

## Error state with recovery

```html
<section class="error-state" role="alert">
  <h2 class="error-state__title">Something went wrong</h2>
  <p class="error-state__text">We couldn't load your data. Check your connection and try again.</p>
  <button class="btn btn--secondary">Retry</button>
</section>
```

```css
.error-state {
  padding: var(--space-6) var(--space-4);
  background: color-mix(in srgb, var(--color-state-error) 10%, transparent);
  border: 1px solid var(--color-state-error);
  border-radius: var(--radius-md);
  color: var(--color-state-error);
}
.error-state__title { margin: 0 0 var(--space-2); color: var(--color-state-error); }
.error-state__text { margin: 0 0 var(--space-4); color: var(--color-text-primary); }
```

---

## Button variants

```html
<button class="btn btn--primary">Primary action</button>
<button class="btn btn--secondary">Secondary</button>
<button class="btn btn--ghost">Tertiary</button>
<button class="btn btn--danger">Delete</button>
```

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background var(--motion-duration-fast) var(--motion-easing);
}
.btn--primary { background: var(--color-brand-primary); color: white; }
.btn--primary:hover { background: color-mix(in srgb, var(--color-brand-primary) 90%, black); }
.btn--secondary { background: var(--color-surface); color: var(--color-text-primary); border-color: var(--color-border); }
.btn--secondary:hover { background: var(--color-surface-2); }
.btn--ghost { background: transparent; color: var(--color-text-primary); }
.btn--ghost:hover { background: var(--color-surface); }
.btn--danger { background: var(--color-state-error); color: white; }
.btn--danger:hover { background: color-mix(in srgb, var(--color-state-error) 90%, black); }
.btn:focus-visible { outline: 2px solid var(--color-brand-primary); outline-offset: 2px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
```

---

## Image placeholder (CSS gradient, no `<img>`)

When the design needs an image but you can't use `<img src="https://...">`:

```html
<div class="media-placeholder" role="img" aria-label="Description of what the image shows"></div>
```

```css
.media-placeholder {
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-secondary) 100%);
  border-radius: var(--radius-md);
}
```

Or use an inline SVG:

```html
<svg class="media-placeholder" viewBox="0 0 400 225" role="img" aria-label="Logo">
  <rect width="400" height="225" fill="var(--color-surface)"/>
  <text x="200" y="115" text-anchor="middle" font-size="20" fill="var(--color-text-secondary)">Logo</text>
</svg>
```

---

## Container with consistent max-width

```html
<div class="container">
  <p>Centered, padded, max-width content area.</p>
</div>
```

```css
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-4);
}
@media (min-width: 768px) {
  .container { padding: var(--space-6) var(--space-8); }
}
```

---

## Grid of cards (responsive)

```html
<div class="grid">
  <article class="card">...</article>
  <article class="card">...</article>
  <article class="card">...</article>
</div>
```

```css
.grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .grid { grid-template-columns: repeat(2, 1fr); gap: var(--space-6); }
}
@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
```

---

## Skip-link (a11y)

```html
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <!-- rest of the page -->
</body>
```

```css
.skip-link {
  position: absolute;
  top: -40px;
  left: var(--space-4);
  background: var(--color-brand-primary);
  color: white;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-sm);
  text-decoration: none;
  z-index: 100;
}
.skip-link:focus { top: var(--space-4); }
```

---

## CSS-only state switcher (`:target` based)

For toggling between states (loading, empty, error, success) without JavaScript:

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

```css
[data-state] { display: none; }
[data-state].is-active,
[data-state]:target { display: block; }
```

The `.is-active` class is the initial visible state. Clicking a nav link navigates to `#<state>`, and the `:target` pseudo-class shows that section. Pure CSS, no JS.

---

## Tab-style content switcher (CSS-only)

Alternative to `:target` using hidden radio inputs:

```html
<div class="tabs">
  <input type="radio" name="tab" id="tab-1" class="tabs__radio" checked>
  <label for="tab-1" class="tabs__label">Tab 1</label>
  <input type="radio" name="tab" id="tab-2" class="tabs__radio">
  <label for="tab-2" class="tabs__label">Tab 2</label>

  <div class="tabs__panel" data-tab="1">Content for tab 1.</div>
  <div class="tabs__panel" data-tab="2">Content for tab 2.</div>
</div>
```

```css
.tabs__radio { position: absolute; opacity: 0; pointer-events: none; }
.tabs__label { padding: var(--space-2) var(--space-4); cursor: pointer; border-bottom: 2px solid transparent; }
.tabs__radio:checked + .tabs__label { border-bottom-color: var(--color-brand-primary); }
.tabs__panel { display: none; padding: var(--space-4) 0; }
.tabs__radio:nth-of-type(1):checked ~ .tabs__panel[data-tab="1"] { display: block; }
.tabs__radio:nth-of-type(3):checked ~ .tabs__panel[data-tab="2"] { display: block; }
```
