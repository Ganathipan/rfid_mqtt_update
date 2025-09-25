const mqtt = require('mqtt');

console.log('Testing with your actual reader format: portal=reader, label=EXITOUT');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Test message matching your database log format
  const yourActualMessage = JSON.stringify({
    portal: "reader",           // Your reader sends portal as "reader"
    rfid_card_id: "709DBC",    // The actual card ID from your log
    label: "EXITOUT"           // Your reader sends label as "EXITOUT"
  });
  
  console.log('📤 Publishing message matching your database log:');
  console.log('  Topic: rfid/reader');
  console.log('  Message:', yourActualMessage);
  
  client.publish('rfid/reader', yourActualMessage);
  
  setTimeout(() => {
    console.log('✅ Test message sent - should be stacked now!');
    client.end();
    process.exit(0);
  }, 1000);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});