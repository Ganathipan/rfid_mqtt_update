const mqtt = require('mqtt');

console.log('Testing EXITOUT MQTT functionality...');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Publish EXITOUT test message
  const exitoutMessage = JSON.stringify({
    portal: "EXITOUT", 
    rfid_card_id: "TEST123",
    label: "CLUSTER1",
    registration_id: "REG001"
  });
  
  client.publish('rfid/reader1', exitoutMessage);
  console.log('📤 Published EXITOUT test message:', exitoutMessage);
  
  // Wait a bit then check the API endpoint
  setTimeout(async () => {
    console.log('🔍 Checking stack via HTTP...');
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('http://localhost:4000/api/exitout/stack');
      const data = await response.json();
      console.log('📊 Stack response:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error checking stack:', error.message);
    }
    
    client.end();
    process.exit(0);
  }, 2000);
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err.message);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Test timeout - broker may not be running');
  client.end();
  process.exit(1);
}, 10000);