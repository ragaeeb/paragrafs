# Agent Guide

## Repository layout
- `src/transcript.ts` exposes the public API for marking tokens, formatting transcripts, and applying ground-truth edits. Expect helper utilities to live close to the functions they support.
- `src/utils/textUtils.ts` and `src/utils/transcriptUtils.ts` house smaller helpers (hint generation, timestamp formatting, diff alignment). Add new utilities here instead of scattering helpers across files.
- Tests live next to their subjects (for example `src/transcript.test.ts`). Whenever you add or modify a function in `src/`, update or extend the colocated test file to keep coverage current.
- Build and lint configuration sits at the repo root (`tsdown.config.ts`, `biome.json`, `tsconfig.json`). Keep them in sync with any new entry points or formatting rules you introduce.

## Tooling workflow
- Run `bun run build` before committing. It executes the upstream `tsdown` CLI using `tsdown.config.ts` to generate optimized ESM output plus type declarations.
- Run `bun run lint` to format and lint via Biome. Let Biome rewrite files instead of running custom formatters, and avoid bypassing its rules.
- Run `bun test` to execute the Bun-powered test suite with coverage. Add focused tests for any new behaviour you introduce.
- Run `bun update --latest` whenever dependencies need refreshing so `bun.lock` stays in sync with `package.json`.

## Coding conventions
- Follow the existing JSDoc style: document every exported function and describe non-trivial parameters or return values.
- Prefer pure, data-oriented helpers over classes. Functions should accept and return plain objects that match the types in `src/transcript.ts`.
- Use the `@/` path alias for imports originating from `src/` and avoid relative paths that climb out of the source tree.
- Keep indentation at four spaces and rely on Biome for spacing/quoting decisions. Do not reintroduce Prettier or ESLint configs.
- Avoid committing generated artifacts (`dist/`, coverage output, etc.). Only the TypeScript source, configs, and documentation should change in PRs.
