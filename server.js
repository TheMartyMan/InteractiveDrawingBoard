const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');


const server = http.createServer((req, res) => {
    let file;
    // Fájlok kiszolgálása
    switch (req.url) {
      case '/':
      case '/frontend.html':
        file = path.join(__dirname, 'frontend', 'frontend.html');
        break;
      case '/icon.png':
        file = path.join(__dirname, 'frontend', 'icon.png');
        break;
      case '/style.css':
        file = path.join(__dirname, 'frontend', 'style.css');
        break;
      case '/script.js':
        file = path.join(__dirname, 'frontend', 'script.js');
        break;
      default:
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Fájl nem található.');
        return;
    }
  
    let contentType = 'text/plain';
    if (file.endsWith('.html')) contentType = 'text/html';
    if (file.endsWith('.css')) contentType = 'text/css';
    if (file.endsWith('.js')) contentType = 'text/javascript';
  
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Hiba a fájl olvasása közben.');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      }
    });
  });

// A WebSocket szervert a HTTP szerverre csatoljuk
const wss = new WebSocket.Server({ server });


let clients = new Set();
let drawingHistory = [];
let clientColors = {};

wss.on('connection', (ws, req) => {

  // Egyedi azonosító a kliensnek
  const clientId = req.socket.remoteAddress + ":" + req.socket.remotePort;
  const color = getRandomColor();
  console.log(color + ' kliens csatlakozott');
  clientColors[clientId] = color;

  // Minden kliensnek saját szín (chathez)
  ws.send(JSON.stringify({ type: 'color', color: color }));

  clients.add(ws);

  // Új kliensnek elküldjük a teljes history-t
  ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));

  ws.on('message', (message) => {
    // Rajz és egyéb eszközök az üzenet alapján
    //console.log('Üzenet érkezett:', message);
    const parsedMessage = JSON.parse(message);

    if (parsedMessage.type === 'draw') {
      
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'draw', data: parsedMessage.data }));
        }
      });
    }

    if (parsedMessage.type === 'finalize') {
      const stroke = parsedMessage.data.stroke;
      drawingHistory.push(stroke);
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'finalize', data: { stroke } }));
        }
      });
    }

    if (parsedMessage.type === 'clear') {
      drawingHistory = [];
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'clear' }));
        }
      });
    }

    if (parsedMessage.type === 'undo') {
      const strokeId = parsedMessage.data.strokeId;
      drawingHistory = drawingHistory.filter(stroke => stroke.id !== strokeId);
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'undo', data: { strokeId } }));
        }
      });
    }

    if (parsedMessage.type === "fill") {
      const fillData = {
        type: "fill",
        x: parsedMessage.data.x,
        y: parsedMessage.data.y,
        color: parsedMessage.data.color
      };
      drawingHistory.push(fillData);
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'fill', data: fillData }));
        }
      });
    }

    if (parsedMessage.type === "chat") {
      parsedMessage.data.color = clientColors[clientId];
      clients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsedMessage));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log(color + ' kliens lecsatlakozott');
    delete clientColors[clientId];
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket hiba:', error);
  });
});

// Véletlenszerű szín generálása
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// A szerver a 3000-es porton hallgat
server.listen(3000, () => {
    console.log("Szerver fut: http://localhost:" + server.address().port);
  });
