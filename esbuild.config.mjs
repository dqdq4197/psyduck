import * as esbuild from 'esbuild';

const commonOptions = {
  bundle: true,
  minify: false, // Set to true for production
  sourcemap: true, // For debugging
  platform: 'browser',
  target: 'es2022',
  logLevel: 'info',
};

esbuild.build({
  ...commonOptions,
  entryPoints: ['./src/popup.ts'],
  outfile: './dist/popup.js',
}).catch(() => process.exit(1));

esbuild.build({
  ...commonOptions,
  entryPoints: ['./src/background.ts'],
  outfile: './dist/background.js',
}).catch(() => process.exit(1));

esbuild.build({
  ...commonOptions,
  entryPoints: ['./src/content-script.ts'],
  outfile: './dist/content-script.js',
}).catch(() => process.exit(1));

console.log('esbuild: Build complete.');
