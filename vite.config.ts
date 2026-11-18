import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import pkg from './package.json';
import { defineConfig, configDefaults } from 'vitest/config';

const hash=createHash('sha256');
function fingerprint(dir:string){for(const item of fs.readdirSync(dir).sort()){const p=path.join(dir,item);if(fs.statSync(p).isDirectory())fingerprint(p);else if(!p.endsWith('version.json'))hash.update(p).update(fs.readFileSync(p));}}
fingerprint('src');fingerprint('public');hash.update(pkg.version);const buildId=hash.digest('hex').slice(0,16);
const identity={version:pkg.version,buildId,mapRevision:'voxel-halfgrid-v14',materialRevision:8};
export default defineConfig({
  define:{__BUILD_ID__:JSON.stringify(buildId)},
  plugins:[{name:'build-identity',configureServer(server){server.middlewares.use('/version.json',(_req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(identity));});},generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify(identity)});}}],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    exclude: [...configDefaults.exclude, 'backup/**', 'tmp/**'],
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/signal': {
        target: 'ws://127.0.0.1:18789',
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      input: {
        main: 'index.html',
        game: 'game.html',
      },
    },
  },
});
