const mqtt = require('mqtt');

console.log('Simulating EXITOUT reader tap with correct configuration...');
const client = mqtt.connect('mqtt://localhost:1885');

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker on port 1885');
  
  // Simulate what the ESP8266 would send after fetching config from /api/reader-config/8
  // The ESP8266 fetches config on boot and uses the portal value
  const exitoutSimulation = JSON.stringify({
    portal: "EXITOUT",        // ← This comes from the database config we just fixed
    rfid_card_id: "A1B2C3D4", // ← This comes from the physical RFID card
    label: "EXITOUT"          // ← This is the readerID from the config
  });
  
  // ESP8266 publishes to "rfid/" + portal, so it will publish to "rfid/EXITOUT"
  const topic = "rfid/EXITOUT";
  
  console.log(`📤 Publishing to topic: ${topic}`);
  console.log(`📤 Message: ${exitoutSimulation}`);
  
  client.publish(topic, exitoutSimulation);
  
  // Wait a moment then check the API
  setTimeout(async () => {
    console.log('\n🔍 Checking ExitOut stack...');
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('http://localhost:4000/api/exitout/stack');
      const data = await response.json();
      console.log('📊 Stack after simulation:', JSON.stringify(data, null, 2));
      
      if (data.stack && data.stack.length > 0) {
        console.log('\n🎉 SUCCESS! The EXITOUT tap was added to the stack!');
        console.log('✅ The system is now working correctly.');
        console.log('📱 When a real RFID card is tapped on the EXITOUT reader,');
        console.log('   it will appear in the ExitOut dashboard.');
      } else {
        console.log('\n❌ The tap was not added to the stack. Check logs.');
      }
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