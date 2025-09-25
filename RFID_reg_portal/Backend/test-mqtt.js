const mqtt = require('mqtt');

console.log('Testing MQTT connection...');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  
  // Publish test message
  const testMessage = JSON.stringify({
    portal: "portal1", 
    tag: "TEST123"
  });
  
  client.publish('rfid/portal1', testMessage);
  console.log('📤 Published test message:', testMessage);
  
  // Subscribe to see if we get it back
  client.subscribe('rfid/#');
  console.log('👂 Subscribed to rfid/#');
});

client.on('message', (topic, message) => {
  console.log('📥 Received message:', {
    topic: topic,
    message: message.toString()
  });
  
  // Exit after first message
  setTimeout(() => {
    console.log('✅ Test completed successfully!');
    client.end();
    process.exit(0);
  }, 1000);
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