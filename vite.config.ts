import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import wasm from 'vite-plugin-wasm';

function vouchZkAssets() {
  const root = path.resolve('contracts/managed/vouch-policy');
  return {
    name: 'vouch-zk-assets',
    configureServer(server: { middlewares: { use: (handler: (req: { url?: string }, res: { statusCode: number; end: (body?: string | Uint8Array) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/__vouch-zk\/(prover|verifier|zkir)\/([A-Za-z0-9]+)\.(prover|verifier|bzkir|zkir)$/);
        if (!match) return next();
        const file = path.join(root, match[1] === 'prover' || match[1] === 'verifier' ? 'keys' : 'zkir', `${match[2]}.${match[3]}`);
        if (!fs.existsSync(file)) { res.statusCode = 404; res.end('ZK asset not found'); return; }
        res.statusCode = 200; res.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      for (const [directory, files] of Object.entries({
        prover: ['authorizeTaskAgent.prover', 'authorizeResearchAgent.prover', 'authorizeDeveloperAgent.prover', 'authorizeCustomAgent.prover', 'requestTaskSpend.prover', 'requestResearchSpend.prover', 'requestDeveloperSpend.prover', 'requestCustomSpend.prover'],
        verifier: ['authorizeTaskAgent.verifier', 'authorizeResearchAgent.verifier', 'authorizeDeveloperAgent.verifier', 'authorizeCustomAgent.verifier', 'requestTaskSpend.verifier', 'requestResearchSpend.verifier', 'requestDeveloperSpend.verifier', 'requestCustomSpend.verifier'],
        zkir: ['authorizeTaskAgent.bzkir', 'authorizeTaskAgent.zkir', 'authorizeResearchAgent.bzkir', 'authorizeResearchAgent.zkir', 'authorizeDeveloperAgent.bzkir', 'authorizeDeveloperAgent.zkir', 'authorizeCustomAgent.bzkir', 'authorizeCustomAgent.zkir', 'requestTaskSpend.bzkir', 'requestTaskSpend.zkir', 'requestResearchSpend.bzkir', 'requestResearchSpend.zkir', 'requestDeveloperSpend.bzkir', 'requestDeveloperSpend.zkir', 'requestCustomSpend.bzkir', 'requestCustomSpend.zkir'],
      })) {
        for (const file of files) this.emitFile({ type: 'asset', fileName: `__vouch-zk/${directory}/${file}`, source: fs.readFileSync(path.join(root, directory === 'prover' || directory === 'verifier' ? 'keys' : 'zkir', file)) });
      }
    },
  };
}

export default defineConfig({
  root: 'frontend',
  publicDir: '../public',
  plugins: [react(), wasm(), vouchZkAssets()],
  server: {
    port: 5173,
    proxy: {
      '/api/': 'http://127.0.0.1:3000',
      '/health': 'http://127.0.0.1:3000',
      '/ready': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
  },
});
