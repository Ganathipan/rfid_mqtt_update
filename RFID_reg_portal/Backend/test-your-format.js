const mqtt = require('mqtt');

console.log('Testing with your reader format: tag=EXITOUT, portal=reader');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Test message in your reader's format
  const yourReaderMessage = JSON.stringify({
    tag: "EXITOUT",        // Your reader sends tag as EXITOUT
    portal: "reader",      // Your reader sends portal as reader
    rfid_card_id: "CARD12345"
  });
  
  console.log('📤 Publishing message in your reader format:');
  console.log('  Topic: rfid/reader');
  console.log('  Message:', yourReaderMessage);
  
  client.publish('rfid/reader', yourReaderMessage);
  
  setTimeout(() => {
    console.log('✅ Test message sent');
    client.end();
    process.exit(0);
  }, 1000);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});