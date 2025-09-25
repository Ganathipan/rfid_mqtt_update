const mqtt = require('mqtt');

console.log('Testing with multiple registrations to verify sorting works');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Test with different registration IDs
  const messages = [
    { portal: "reader1", rfid_card_id: "14BCDD", label: "EXITOUT" },  // Will be reg 33
    { portal: "reader1", rfid_card_id: "ABC123", label: "EXITOUT" },  // Unknown reg
  ];
  
  messages.forEach((msg, index) => {
    setTimeout(() => {
      const message = JSON.stringify(msg);
      console.log(`📤 Publishing message ${index + 1}:`, message);
      client.publish('rfid/reader1', message);
    }, index * 1000);
  });
  
  setTimeout(() => {
    console.log('✅ All test messages sent');
    client.end();
    process.exit(0);
  }, messages.length * 1000 + 1000);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});