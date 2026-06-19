# ColdBox Vite Plugin

<a href="https://github.com/ColdBox/coldbox-vite-plugin/actions"><img src="https://github.com/ColdBox/coldbox-vite-plugin/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://www.npmjs.com/package/coldbox-vite-plugin"><img src="https://img.shields.io/npm/dt/coldbox-vite-plugin" alt="Total Downloads"></a>
<a href="https://www.npmjs.com/package/coldbox-vite-plugin"><img src="https://img.shields.io/npm/v/coldbox-vite-plugin" alt="Latest Stable Version"></a>
<a href="https://www.npmjs.com/package/coldbox-vite-plugin"><img src="https://img.shields.io/npm/l/coldbox-vite-plugin" alt="License"></a>

## Introduction

[Vite](https://vitejs.dev) is a modern frontend build tool that provides an extremely fast development environment and bundles your code for production.

This plugin integrates Vite with a [ColdBox](https://www.coldbox.org/) backend, handling:

- Dev-server URL injection so ColdBox can load hot-module-replacement assets.
- Asset manifest generation for cache-busted production builds.
- Full-page reload when ColdBox views, layouts, or routes change.
- Support for both the **flat** (traditional CFML/ColdBox) and **BoxLang / tiered** application layouts.

The CFML/BoxLang side of the integration is provided by the [**coldbox-vite** ColdBox module](https://www.forgebox.io/view/coldbox-vite), which reads the dev-server URL from the hot file and renders the appropriate `<script>` / `<link>` tags.

---

## Requirements

| Dependency | Version |
|---|---|
| Node.js | ≥ 18 (≥ 20.19 when using Vite 8) |
| Vite | 3, 4, 5, 6, 7, or 8 |

---

## Installation

```bash
npm install --save-dev vite coldbox-vite-plugin
```

---

## Quick Start

Create `vite.config.js` in your project root:

```js
import { defineConfig } from "vite";
import coldbox from "coldbox-vite-plugin";

export default defineConfig({
    plugins: [
        coldbox("resources/assets/js/app.js"),
    ],
});
```

Add these scripts to `package.json`:

```json
"scripts": {
    "dev": "vite",
    "build": "vite build"
}
```

Then add the `coldbox-vite` module to your ColdBox app and call `vite()` from your layout to load the assets.

---

## Layouts

ColdBox supports two directory structures. Choose the section that matches your project.

### Flat Layout (Traditional ColdBox / CFML)

The web root **is** the project root. Handlers, views, and layouts live directly at the top level.

```
config/
├── ColdBox.cfc
├── Router.cfc
handlers/
views/
layouts/
includes/          ← built assets land here (web-accessible)
resources/
└── assets/
    ├── js/
    │   └── app.js
    └── css/
        └── app.css
```

**`vite.config.js`**:

```js
import { defineConfig } from "vite";
import coldbox, { refreshPaths } from "coldbox-vite-plugin";

export default defineConfig({
    plugins: [
        coldbox({
            // publicDirectory defaults to "includes"
            input: [
                "resources/assets/css/app.css",
                "resources/assets/js/app.js",
            ],
            refresh: true,  // reloads on views/layouts/Router.cfc changes
        }),
    ],
});
```

Built assets are written to `includes/build/`. The hot file is at `includes/hot`.

Add to `.gitignore`:

```gitignore
/includes/build
/includes/hot
```

---

### BoxLang / Tiered Layout

The web root is the `public/` subdirectory. Application code lives under `app/`.

```
app/
├── config/
│   ├── ColdBox.bx
│   └── Router.bx
├── handlers/
├── layouts/
└── views/
public/            ← web root
└── includes/      ← built assets land here (web-accessible)
resources/
└── assets/
    ├── js/
    │   └── app.js
    └── css/
        └── app.css
```

**`vite.config.js`**:

```js
import { defineConfig } from "vite";
import coldbox, { appRefreshPaths } from "coldbox-vite-plugin";

export default defineConfig({
    plugins: [
        coldbox({
            publicDirectory: "public/includes",
            input: [
                "resources/assets/css/app.css",
                "resources/assets/js/app.js",
            ],
            refresh: appRefreshPaths,  // reloads on app/views, app/layouts, app/config/Router.bx
        }),
    ],
});
```

Built assets are written to `public/includes/build/`. The hot file is at `public/includes/hot`.

Add to `.gitignore`:

```gitignore
/public/includes/build
/public/includes/hot
```

---

## Configuration Reference

```js
coldbox({
    input,             // required — entry point(s) to compile
    publicDirectory,   // default: "includes"
    buildDirectory,    // default: "build"
    ssr,               // SSR entry point(s); defaults to `input`
    ssrOutputDirectory,// default: "includes/build/ssr"
    refresh,           // default: false
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `input` | `string \| string[]` | — | Entry point path(s) relative to project root. **Required.** |
| `publicDirectory` | `string` | `"includes"` | Directory where compiled assets are written. Use `"public/includes"` for the BoxLang/tiered layout. |
| `buildDirectory` | `string` | `"build"` | Subdirectory inside `publicDirectory` for hashed build output. |
| `ssr` | `string \| string[]` | `input` | Entry point(s) for the SSR bundle. |
| `ssrOutputDirectory` | `string` | `"includes/build/ssr"` | Output directory for the SSR bundle. |
| `refresh` | `boolean \| string \| string[] \| RefreshConfig \| RefreshConfig[]` | `false` | Trigger a full-page reload when matched files change. |

---

## Full-Page Reload (`refresh`)

The `refresh` option wraps [vite-plugin-full-reload](https://github.com/ElMassimo/vite-plugin-full-reload). It accepts several forms:

```js
// Disable (default)
refresh: false

// Use the built-in paths for your layout:
refresh: true          // flat layout — equivalent to refreshPaths
refresh: appRefreshPaths   // BoxLang/tiered layout

// Custom glob pattern
refresh: "app/views/**"

// Multiple patterns
refresh: ["app/views/**", "app/layouts/**"]

// Full control
refresh: {
    paths: ["app/views/**"],
    config: { delay: 300 },
}

// Multiple configurations
refresh: [
    { paths: ["app/views/**"], config: { delay: 300 } },
    { paths: ["app/config/**"] },
]
```

### Exported path constants

```js
import coldbox, { refreshPaths, appRefreshPaths } from "coldbox-vite-plugin";

// refreshPaths — for flat layout:
// ["layouts/**", "views/**", "config/Router.cfc"]

// appRefreshPaths — for BoxLang / tiered layout:
// ["app/layouts/**", "app/views/**", "app/config/Router.bx"]
```

---

## Path Aliases

The plugin automatically registers an `@` alias pointing to `/resources/assets/js`:

```js
import MyComponent from "@/components/MyComponent.js";
```

Override it in `vite.config.js` if needed:

```js
export default defineConfig({
    plugins: [coldbox("resources/assets/js/app.js")],
    resolve: {
        alias: {
            "@": "/resources/assets/ts",
        },
    },
});
```

---

## SSR Configuration

```js
import { defineConfig } from "vite";
import coldbox from "coldbox-vite-plugin";

export default defineConfig({
    plugins: [
        coldbox({
            input: "resources/assets/js/app.js",
            ssr: "resources/assets/js/ssr.js",
            ssrOutputDirectory: "includes/build/ssr",
        }),
    ],
});
```

Add separate build scripts to `package.json`:

```json
"scripts": {
    "dev": "vite",
    "build": "vite build && vite build --ssr"
}
```

---

## Inertia Integration

Use `resolvePageComponent` from the bundled helper to replace the legacy `require()` pattern:

```js
import { createInertiaApp } from "@inertiajs/vue3";
import { resolvePageComponent } from "coldbox-vite-plugin/inertia-helpers";

createInertiaApp({
    resolve: (name) =>
        resolvePageComponent(
            `./Pages/${name}.vue`,
            import.meta.glob("./Pages/**/*.vue")
        ),
    setup({ el, app, props, plugin }) {
        createApp({ render: () => h(app, props) })
            .use(plugin)
            .mount(el);
    },
});
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `ASSET_URL` | CDN or absolute URL prefix prepended to asset paths in production. E.g. `https://cdn.example.com`. |

Set it in your `.env` file:

```env
ASSET_URL=https://cdn.example.com
```

Built assets will be referenced as `https://cdn.example.com/build/<hashed-file>`.

---

## Framework Integrations

### Vue

```js
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [
        coldbox("resources/assets/js/app.js"),
        vue(),
    ],
});
```

### React

```js
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [
        coldbox("resources/assets/js/app.jsx"),
        react(),
    ],
});
```

> **Note** JavaScript files that contain JSX must use the `.jsx` extension.

### Tailwind CSS

Install and configure PostCSS:

```bash
npx tailwindcss init -p
```

Import Tailwind in your CSS entry point:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Upgrading

See [UPGRADE.md](UPGRADE.md) for migration instructions from ColdBox Elixir.

---

## Contributing

Thank you for considering contributing to the ColdBox Vite plugin! Please open issues and pull requests on [GitHub](https://github.com/ColdBox/coldbox-vite-plugin).

---

## License

The ColdBox Vite plugin is open-sourced software licensed under the [MIT license](LICENSE.md).
