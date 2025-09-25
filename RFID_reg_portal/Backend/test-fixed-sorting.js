const mqtt = require('mqtt');

console.log('Testing with registration ID as number (like your real data)');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Test with your actual format
  const message = JSON.stringify({
    portal: "reader1",
    rfid_card_id: "132752",
    label: "EXITOUT"
  });
  
  console.log('📤 Publishing message:');
  console.log(`Message: ${message}`);
  
  client.publish('rfid/reader1', message);
  
  setTimeout(() => {
    console.log('✅ Test completed');
    client.end();
    process.exit(0);
  }, 1000);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});