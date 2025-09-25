const mqtt = require('mqtt');

// MQTT Configuration - same as in mqttHandler.js
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1885';
const MQTT_TOPIC = 'rfid/#';

console.log(`[DEBUG] Connecting to MQTT broker: ${MQTT_URL}`);
console.log(`[DEBUG] Subscribing to topic: ${MQTT_TOPIC}`);

const client = mqtt.connect(MQTT_URL, {
  reconnectPeriod: 5000,
  connectTimeout: 10000
});

client.on('connect', () => {
  console.log(`[DEBUG] ✅ Connected to MQTT broker`);
  
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) {
      console.error('[DEBUG] ❌ Failed to subscribe:', err);
    } else {
      console.log(`[DEBUG] ✅ Subscribed successfully`);
      console.log(`[DEBUG] 👂 Listening for messages...`);
    }
  });
});

client.on('message', (topic, message) => {
  console.log(`[DEBUG] 📥 RAW MESSAGE RECEIVED:`);
  console.log(`  Topic: ${topic}`);
  console.log(`  Message: ${message.toString()}`);
  
  try {
    const parsed = JSON.parse(message.toString());
    console.log(`  Parsed JSON:`, parsed);
    console.log(`  Portal: "${parsed.portal}"`);
    console.log(`  RFID Card: "${parsed.rfid_card_id}"`);
    console.log(`  Is EXITOUT: ${parsed.portal === 'EXITOUT'}`);
  } catch (e) {
    console.log(`  ❌ JSON Parse Error: ${e.message}`);
  }
  console.log(`---`);
});

client.on('error', (err) => {
  console.error('[DEBUG] ❌ MQTT Error:', err);
});

client.on('offline', () => {
  console.log('[DEBUG] ⚠️  Client offline');
});

// Keep running
console.log('[DEBUG] Debug monitor running... Press Ctrl+C to stop');