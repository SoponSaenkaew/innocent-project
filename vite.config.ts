import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function blueprintStoragePlugin(): Plugin {
  const blueprintsDir = path.resolve(process.cwd(), 'blueprints');
  if (!fs.existsSync(blueprintsDir)) {
    fs.mkdirSync(blueprintsDir, { recursive: true });
  }

  return {
    name: 'vite-plugin-blueprint-storage',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

        // 1. Save Blueprint directly into blueprints/ directory
        if (req.method === 'POST' && url.pathname === '/api/save-blueprint') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              let rawName = data.filename || `tank_${Date.now()}`;
              // Support Thai characters and standard alphanumeric in filenames
              let filename = rawName.replace(/[\\/:*?"<>|]/g, '_').trim();
              if (!filename.endsWith('.json')) filename += '.json';
              const filePath = path.join(blueprintsDir, filename);
              const payload = data.blueprint !== undefined ? data.blueprint : data;
              const content = JSON.stringify(payload, null, 2);
              fs.writeFileSync(filePath, content, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, filename, filePath }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        // 2. List all blueprints in blueprints/ directory
        if (req.method === 'GET' && url.pathname === '/api/list-blueprints') {
          try {
            const files = fs.readdirSync(blueprintsDir).filter((f) => f.endsWith('.json'));
            const list = files
              .map((f) => {
                const stat = fs.statSync(path.join(blueprintsDir, f));
                return { filename: f, mtime: stat.mtimeMs, size: stat.size };
              })
              .sort((a, b) => b.mtime - a.mtime);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, files: list }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        // 3. Load Blueprint from blueprints/ directory
        if (req.method === 'GET' && url.pathname === '/api/load-blueprint') {
          const filename = url.searchParams.get('name') || '';
          const cleanName = path.basename(filename);
          const filePath = path.join(blueprintsDir, cleanName);
          if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(content);
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'File not found' }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [blueprintStoragePlugin()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'esnext',
  },
});
