/* ============================================================
   OBD2 Dashboard — Node.js Server for Render
   - Receives JSON from ESP32 via HTTP POST /data
   - Serves the dashboard HTML
   - Pushes live data to browsers via WebSocket
   ============================================================ */

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Simple API key to prevent strangers from posting fake data
// Change this and set it as an env variable on Render
const API_KEY = process.env.API_KEY || 'my_secret_esp32_key';

// Latest OBD data (kept in memory)
let latestData = { error: 'no_data_yet' };
let lastReceived = null;

app.use(express.json());

// ---- Serve dashboard HTML ----
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- ESP32 posts data here ----
app.post('/data', (req, res) => {
  // Check API key
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const data = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'invalid data' });
  }

  latestData   = data;
  lastReceived = Date.now();

  console.log('[ESP32]', JSON.stringify(data));

  // Broadcast to all connected browsers
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  res.json({ ok: true });
});

// ---- Status endpoint ----
app.get('/status', (req, res) => {
  res.json({
    clients:      wss.clients.size,
    lastReceived: lastReceived,
    ageMs:        lastReceived ? Date.now() - lastReceived : null,
    data:         latestData
  });
});

// ---- WebSocket: send latest data on connect ----
wss.on('connection', (ws) => {
  console.log('[WS] Browser connected, total:', wss.clients.size);
  ws.send(JSON.stringify(latestData));

  ws.on('close', () => {
    console.log('[WS] Browser disconnected, total:', wss.clients.size);
  });
});

// ---- Mark as stale if ESP32 stops sending ----
setInterval(() => {
  if (lastReceived && Date.now() - lastReceived > 5000) {
    if (!latestData.error) {
      latestData = { error: 'esp32_offline' };
      const payload = JSON.stringify(latestData);
      wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send(payload);
      });
    }
  }
}, 3000);

server.listen(PORT, () => {
  console.log(`OBD2 Server running on port ${PORT}`);
});
