const mqtt = require('mqtt');

console.log('=== DEBUGGING YOUR READER FORMAT ===');
console.log('Expected: portal="reader", label="EXITOUT"');

const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Subscribe to see what messages are being processed
  client.subscribe('rfid/#', (err) => {
    if (err) {
      console.error('❌ Subscribe failed:', err);
      return;
    }
    console.log('✅ Subscribed to rfid/# for debugging');
    
    setTimeout(() => {
      // Test your reader's actual format
      const message = JSON.stringify({
        portal: "reader",
        rfid_card_id: "709DBC",
        label: "EXITOUT"
      });
      
      console.log('\n📤 Publishing test message:');
      console.log(`Topic: rfid/reader`);
      console.log(`Message: ${message}`);
      
      client.publish('rfid/reader', message);
      
      // Wait to see if we get it back
      setTimeout(() => {
        console.log('\n🔍 Test completed. Check backend logs for processing details.');
        client.end();
        process.exit(0);
      }, 2000);
      
    }, 1000);
  });
});

client.on('message', (topic, message) => {
  console.log(`\n📥 Message received back:`);
  console.log(`Topic: ${topic}`);
  console.log(`Message: ${message.toString()}`);
  
  try {
    const parsed = JSON.parse(message.toString());
    console.log(`Parsed portal: "${parsed.portal}"`);
    console.log(`Parsed label: "${parsed.label}"`);
    console.log(`Should be EXITOUT: ${parsed.label === 'EXITOUT'}`);
  } catch (e) {
    console.log('❌ JSON parse error');
  }
});

client.on('error', (err) => {
  console.error('❌ MQTT Error:', err);
  process.exit(1);
});