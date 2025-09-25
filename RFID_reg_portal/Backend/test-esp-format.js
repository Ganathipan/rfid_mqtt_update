const mqtt = require('mqtt');

console.log('Testing with ESP8266 format message...');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Publish message in the format ESP8266 sends
  const esp8266Message = JSON.stringify({
    portal: "EXITOUT", 
    rfid_card_id: "A1B2C3D4",
    label: "REGISTER"
  });
  
  client.publish('rfid/EXITOUT', esp8266Message);
  console.log('📤 Published ESP8266 format message:', esp8266Message);
  
  client.end();
  process.exit(0);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});