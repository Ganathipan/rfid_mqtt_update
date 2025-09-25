const mqtt = require('mqtt');
const pool = require('../db/pool');
require('dotenv').config(); // Ensure environment variables are loaded

// MQTT Configuration
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const MQTT_TOPIC = 'rfid/#';
const DEFAULT_LABEL = 'CLUSTER1';

console.log(`[MQTT] Attempting to connect to: ${MQTT_URL}`);

// Connect to MQTT broker with options
const client = mqtt.connect(MQTT_URL, {
  reconnectPeriod: 5000,
  connectTimeout: 10000
});

client.on('connect', () => {
  console.log(`[MQTT] Connected to broker at ${MQTT_URL}`);
  
  // Subscribe to rfid/# topic
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('[MQTT] Failed to subscribe to topic:', MQTT_TOPIC, err);
    } else {
      console.log(`[MQTT] Subscribed to topic: ${MQTT_TOPIC}`);
    }
  });
});

client.on('message', async (topic, message) => {
  try {
    // Parse the JSON payload
    const payload = JSON.parse(message.toString());
    const { portal, rfid_card_id, label } = payload;
    
    if (!portal || !rfid_card_id) {
      console.warn('[MQTT] Invalid payload - missing portal or rfid_card_id:', payload);
      return;
    }
    
    // Use label from payload, fallback to DEFAULT_LABEL if not provided
    const finalLabel = label || DEFAULT_LABEL;
    
    console.log(`[MQTT] Tap: {portal: "${portal}", rfid_card_id: "${rfid_card_id}", label: "${finalLabel}"}`);
    
    // Insert into logs table
    const query = `
      INSERT INTO logs (log_time, rfid_card_id, portal, label)
      VALUES (NOW(), $1, $2, $3)
    `;
    
    await pool.query(query, [rfid_card_id, portal, finalLabel]);
    console.log(`[MQTT] ✅ Successfully logged RFID tap: ${rfid_card_id} at ${portal}`);
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('[MQTT] Invalid JSON payload:', message.toString());
    } else if (error.code) {
      console.error('[MQTT] Database error:', error.code, error.message);
    } else {
      console.error('[MQTT] Unexpected error processing message:', error.message);
    }
  }
});

client.on('error', (err) => {
  console.error('[MQTT] Connection error:', err.message || err);
  console.error('[MQTT] Error details:', {
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    address: err.address,
    port: err.port
  });
});

client.on('offline', () => {
  console.warn('[MQTT] Client went offline');
});

client.on('reconnect', () => {
  console.log('[MQTT] Attempting to reconnect...');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[MQTT] Shutting down MQTT client...');
  client.end();
  process.exit(0);
});

module.exports = client;