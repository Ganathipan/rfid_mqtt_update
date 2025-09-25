const mqtt = require('mqtt');

console.log('Testing release functionality with string registration IDs');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Test with your exact reader format
  const message = JSON.stringify({
    portal: "reader1",
    rfid_card_id: "TESTCARD123",
    label: "EXITOUT"
  });
  
  console.log('📤 Publishing test card:', message);
  client.publish('rfid/reader1', message);
  
  setTimeout(() => {
    console.log('✅ Test card sent');
    client.end();
    process.exit(0);
  }, 1000);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});