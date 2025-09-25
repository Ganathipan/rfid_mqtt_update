const express = require('express');
const cors = require('cors');
const statsRoutes = require('./services/statsRoutes');
require('dotenv').config();

// Initialize MQTT handler for realtime RFID ingestion
require('./realtime/mqttHandler');

const tagsRouter = require('./routes/tags');
const gameLiteRouter = require('./routes/gameLite');
const reader1ClusterKioskRouter = require('./routes/reader1ClusterKiosk');
const venueStateRouter = require('./routes/venueState');
const readerConfigRouter = require('./routes/readerConfig');
const exitoutRouter = require('./routes/exitoutRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// health check
app.get('/health', (_req, res) =>
  res.json({ ok: true, ts: new Date().toISOString() })
);

// Routes
app.get('/', (req, res) => {
  res.send('✅ RFID Tracking API Running');
});
app.use('/api', statsRoutes);
app.use('/api', venueStateRouter);
app.use('/api', readerConfigRouter);

// mount main router
app.use('/api/tags', tagsRouter);
app.use('/api/game-lite', gameLiteRouter);
app.use('/api', reader1ClusterKioskRouter);
app.use('/api/exitout', exitoutRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ RFID backend listening on port ${port} (try http:// 10.30.9.163:${port})`);
});
