import { build } from 'vite';

const result = await build({
  configFile: './vite.config.ts',
  logLevel: 'info'
});

console.log('Build completed');
