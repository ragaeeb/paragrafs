import { defineConfig } from 'tsdown/config';

export default defineConfig({
    clean: true,
    dts: true,
    entry: ['src/index.ts', 'src/ground-truth.ts', 'src/subtitles.ts'],
    format: ['esm'],
    minify: true,
    sourcemap: true,
    target: 'esnext',
});
