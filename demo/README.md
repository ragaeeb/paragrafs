# paragrafs demo (Svelte + Vite)

This is a minimal static demo app for the `paragrafs` library. It’s designed to be deployed to Surge.

## Local development

From the repo root:

```bash
bun run build
cd demo
bun install
bun run dev
```

## Deploy to Surge

From the repo root:

```bash
bun run demo:deploy
```

This deploys `demo/dist` to `paragrafs.surge.sh`.
