// ─────────────────────────────────────────────────────────────────────────────
// Self-Test Electron App
//
// Embeds the ElectronHound Dashboard in a minimal Electron shell for
// dogfooding (self-testing).  A local HTTP server serves the Dashboard build
// output and mocks the backend API so the app is fully self-contained.
// ─────────────────────────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── Configuration ───────────────────────────────────────────────────────────
const PORT = parseInt(process.env.SELF_TEST_PORT || '3001', 10);
const DASHBOARD_DIST = path.resolve(__dirname, '../../apps/dashboard/dist');

// ── In-memory mock state ────────────────────────────────────────────────────
const mockTasks = [];
let nextTaskId = 1;

// ── MIME type map ───────────────────────────────────────────────────────────
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

// ── JSON response helper ────────────────────────────────────────────────────
function jsonResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

// ── SSE response helper ─────────────────────────────────────────────────────
function sseResponse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
}

function sseSend(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Create HTTP server ──────────────────────────────────────────────────────
function createServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // ── API: Health check ───────────────────────────────────────────────────
    if (pathname === '/api/health') {
      jsonResponse(res, 200, { status: 'ok', source: 'self-test' });
      return;
    }

    // ── API: List tasks ─────────────────────────────────────────────────────
    if (pathname === '/api/tasks' && req.method === 'GET') {
      jsonResponse(res, 200, { data: mockTasks });
      return;
    }

    // ── API: Create task ────────────────────────────────────────────────────
    if (pathname === '/api/tasks' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const task = {
            id: `self-test-${nextTaskId++}`,
            title: parsed.title || parsed.goal || 'Untitled Task',
            status: 'queued',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          mockTasks.unshift(task);
          jsonResponse(res, 201, task);
        } catch {
          jsonResponse(res, 400, { error: 'Invalid JSON body' });
        }
      });
      return;
    }

    // ── API: Get single task ────────────────────────────────────────────────
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && req.method === 'GET') {
      const task = mockTasks.find((t) => t.id === taskMatch[1]);
      if (task) {
        jsonResponse(res, 200, { task, steps: [] });
      } else {
        jsonResponse(res, 404, { error: 'Task not found' });
      }
      return;
    }

    // ── API: SSE task stream ────────────────────────────────────────────────
    if (pathname.startsWith('/api/stream/tasks/')) {
      const taskId = pathname.split('/api/stream/tasks/')[1];
      sseResponse(res);

      // Simulate step events over time to demonstrate the SSE timeline
      const phases = [
        { phase: 'observe', result: 'Dashboard loaded, task list visible' },
        { phase: 'plan', result: 'Click New Task button, fill form, submit' },
        { phase: 'execute', result: 'Task created successfully' },
        { phase: 'verify', result: 'Task appears in task list' },
      ];

      let stepIndex = 0;
      const interval = setInterval(() => {
        if (stepIndex >= phases.length) {
          sseSend(res, 'complete', { taskId, status: 'completed' });
          clearInterval(interval);
          res.end();
          return;
        }

        const step = phases[stepIndex];
        sseSend(res, 'step', {
          index: stepIndex,
          phase: step.phase,
          result: step.result,
          timestamp: new Date().toISOString(),
        });

        // Also update the task status
        const task = mockTasks.find((t) => t.id === taskId);
        if (task) {
          task.status = stepIndex === phases.length - 1 ? 'completed' : 'running';
          task.updatedAt = new Date().toISOString();
        }

        stepIndex++;
      }, 800);

      // Clean up on client disconnect
      req.on('close', () => {
        clearInterval(interval);
      });
      return;
    }

    // ── API: LLM providers config ───────────────────────────────────────────
    if (pathname === '/api/llm/providers') {
      jsonResponse(res, 200, {
        version: 1,
        providers: [],
        activeId: 'mock',
      });
      return;
    }

    // ── API: Batch operations ───────────────────────────────────────────────
    if (pathname === '/api/batches' && req.method === 'GET') {
      jsonResponse(res, 200, { data: [] });
      return;
    }

    // ── API: Schedules ──────────────────────────────────────────────────────
    if (pathname === '/api/schedules' && req.method === 'GET') {
      jsonResponse(res, 200, { data: [] });
      return;
    }

    // ── API: System health ──────────────────────────────────────────────────
    if (pathname === '/api/health/system') {
      jsonResponse(res, 200, {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: app.getVersion(),
      });
      return;
    }

    // ── API: Templates ──────────────────────────────────────────────────────
    if (pathname === '/api/templates' && req.method === 'GET') {
      jsonResponse(res, 200, { data: [] });
      return;
    }

    // ── API: Feedback ───────────────────────────────────────────────────────
    if (pathname === '/api/feedback' && req.method === 'GET') {
      jsonResponse(res, 200, { data: [] });
      return;
    }

    // ── API: Notifications ──────────────────────────────────────────────────
    if (pathname === '/api/notifications' && req.method === 'GET') {
      jsonResponse(res, 200, { data: [] });
      return;
    }

    // ── API: catch-all for unknown API routes ───────────────────────────────
    if (pathname.startsWith('/api/')) {
      jsonResponse(res, 200, { data: [] });
      return;
    }

    // ── Static file serving (Dashboard build output) ────────────────────────
    let filePath = path.join(DASHBOARD_DIST, pathname);

    // SPA fallback: serve index.html for non-file routes
    if (!path.extname(filePath) || pathname === '/') {
      filePath = path.join(DASHBOARD_DIST, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // Fallback to index.html for SPA routing
        fs.readFile(path.join(DASHBOARD_DIST, 'index.html'), (err2, indexData) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(data);
    });
  });

  return server;
}

// ── Electron window ─────────────────────────────────────────────────────────
let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load Dashboard from local HTTP server
  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle('ping', () => 'pong');

ipcMain.handle('quit', () => {
  app.quit();
});

ipcMain.handle('self-test:create-task', (_event, title) => {
  const task = {
    id: `self-test-${nextTaskId++}`,
    title: title || 'Self-Test Task',
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  mockTasks.unshift(task);
  return task;
});

ipcMain.handle('self-test:list-tasks', () => {
  return [...mockTasks];
});

// ── App lifecycle ───────────────────────────────────────────────────────────
let httpServer;

app.whenReady().then(() => {
  // Verify dashboard dist exists
  const indexHtml = path.join(DASHBOARD_DIST, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error(`[self-test] Dashboard build not found at ${DASHBOARD_DIST}`);
    console.error('[self-test] Run "pnpm --filter @eata/dashboard build" first.');
    app.quit();
    return;
  }

  // Start HTTP server, then create window
  httpServer = createServer();
  httpServer.listen(PORT, '127.0.0.1', () => {
    console.log(`[self-test] HTTP server listening on http://127.0.0.1:${PORT}`);
    console.log(`[self-test] Serving dashboard from ${DASHBOARD_DIST}`);
    createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (httpServer) {
    httpServer.close();
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
