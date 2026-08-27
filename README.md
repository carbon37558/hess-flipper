# Hess Flipper

An adult-friendly Hess's Law chemistry puzzle: **flip → scale → add → cancel → match**.

Play the production build at [hess-flipper.pages.dev](https://hess-flipper.pages.dev/).

## Development

Requires Node.js 22 or newer.

```bash
pnpm install
pnpm dev
```

The source-of-truth question database is `data/hess_flipper_questions.xlsx`. Every dev/build run validates the workbook and generates `src/generated/questions.json`; the browser never reads Excel at runtime.

## Quality checks

```bash
pnpm validate
pnpm test
pnpm typecheck
pnpm build
```

## Cloudflare Pages

- Build command: `pnpm build`
- Build output directory: `dist`
- Node version: `22`
