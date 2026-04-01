/* ============================================================
   OBD2 + GPS Dashboard — Node.js Server for Render
   Receives JSON from ESP32/A9G via HTTP POST
   Serves live dashboard with OBD2 + GPS map
   ============================================================ */

const express = require('express');
const http    = require('http');
const WebSocket = require('ws');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
const PORT   = process.env.PORT || 3000;
const API_KEY= process.env.API_KEY || 'my_secret_esp32_key';

let latestData   = { error: 'no_data_yet' };
let lastReceived = null;

app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ESP32/A9G posts data here
app.post('/data', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY)
    return res.status(401).json({ error: 'unauthorized' });

  const data = req.body;
  if (!data || typeof data !== 'object')
    return res.status(400).json({ error: 'invalid' });

  latestData   = data;
  lastReceived = Date.now();
  console.log('[DATA]', JSON.stringify(data));

  const payload = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(payload); });
  res.json({ ok: true });
});

app.get('/status', (req, res) => {
  res.json({ clients: wss.clients.size, lastReceived, data: latestData });
});

wss.on('connection', ws => {
  console.log('[WS] Client connected, total:', wss.clients.size);
  ws.send(JSON.stringify(latestData));
  ws.on('close', () => console.log('[WS] Client disconnected, total:', wss.clients.size));
});

// Mark stale if no data for 8s
setInterval(() => {
  if (lastReceived && Date.now() - lastReceived > 8000 && !latestData.error) {
    latestData = { error: 'esp32_offline' };
    const p = JSON.stringify(latestData);
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(p); });
  }
}, 3000);

server.listen(PORT, () => console.log(`OBD2+GPS Server on port ${PORT}`));
