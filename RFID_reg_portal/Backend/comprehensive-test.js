const mqtt = require('mqtt');

console.log('=== COMPREHENSIVE MQTT DIAGNOSTIC ===');

// Test the exact same configuration as the backend
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1885';
console.log(`Testing MQTT URL: ${MQTT_URL}`);

const client = mqtt.connect(MQTT_URL);
let messagesSent = 0;
let messagesReceived = 0;

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  
  // Subscribe to the same topic as mqttHandler
  client.subscribe('rfid/#', (err) => {
    if (err) {
      console.error('❌ Subscribe failed:', err);
      return;
    }
    console.log('✅ Subscribed to rfid/#');
    
    // Test 1: Send to exact topic that ESP8266 uses
    setTimeout(() => {
      const testMessage1 = JSON.stringify({
        portal: "EXITOUT",
        rfid_card_id: "TEST001",
        label: "REGISTER"
      });
      console.log('\n--- TEST 1: ESP8266 Format ---');
      console.log('Publishing to: rfid/EXITOUT');
      console.log('Message:', testMessage1);
      client.publish('rfid/EXITOUT', testMessage1);
      messagesSent++;
    }, 1000);
    
    // Test 2: Send to generic rfid topic
    setTimeout(() => {
      const testMessage2 = JSON.stringify({
        portal: "EXITOUT",
        rfid_card_id: "TEST002", 
        label: "CLUSTER1",
        registration_id: "REG123"
      });
      console.log('\n--- TEST 2: Generic Format ---');
      console.log('Publishing to: rfid/reader1');
      console.log('Message:', testMessage2);
      client.publish('rfid/reader1', testMessage2);
      messagesSent++;
    }, 2000);
    
    // Test 3: Send to portal topic as per ESP code
    setTimeout(() => {
      const testMessage3 = JSON.stringify({
        portal: "portal1",
        rfid_card_id: "TEST003",
        label: "REGISTER"
      });
      console.log('\n--- TEST 3: Portal Format ---');
      console.log('Publishing to: rfid/portal1');
      console.log('Message:', testMessage3);
      client.publish('rfid/portal1', testMessage3);
      messagesSent++;
    }, 3000);
    
    // Check results
    setTimeout(() => {
      console.log('\n=== RESULTS ===');
      console.log(`Messages sent: ${messagesSent}`);
      console.log(`Messages received: ${messagesReceived}`);
      
      if (messagesReceived === 0) {
        console.log('❌ NO MESSAGES RECEIVED - Check if:');
        console.log('  1. MQTT broker is running on correct port');
        console.log('  2. Backend mqttHandler is running');
        console.log('  3. Topic subscription is correct');
      } else {
        console.log(`✅ Received ${messagesReceived}/${messagesSent} messages`);
      }
      
      client.end();
      process.exit(0);
    }, 5000);
  });
});

client.on('message', (topic, message) => {
  messagesReceived++;
  console.log(`\n📥 RECEIVED MESSAGE #${messagesReceived}:`);
  console.log(`Topic: ${topic}`);
  console.log(`Message: ${message.toString()}`);
  
  // Check if this would trigger EXITOUT logic
  try {
    const parsed = JSON.parse(message.toString());
    if (parsed.portal === 'EXITOUT') {
      console.log('🎯 This is an EXITOUT message - should be stacked!');
    } else {
      console.log(`ℹ️  This is a ${parsed.portal} message - normal processing`);
    }
  } catch (e) {
    console.log('❌ JSON parse error');
  }
});

client.on('error', (err) => {
  console.error('❌ MQTT Connection Error:', err);
  process.exit(1);
});

// Timeout safety
setTimeout(() => {
  console.log('❌ Test timeout - something is wrong');
  client.end();
  process.exit(1);
}, 10000);