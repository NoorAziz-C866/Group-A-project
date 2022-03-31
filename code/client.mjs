/**
* @author Noor Aziz
*  
* this is the client side file
* 
* Humidity sensor code source: https://github.com/Taher1322/Raspberry_Pi_YT_Tutorial/commit/49e710ea1ff0f702f1f8184cf7e3f4122d10263f
* Ultrasonic sensor code source: source: https://github.com/fivdi/pigpio#measure-distance-with-a-hc-sr04-ultrasonic-sensor
* Socketio code source: https://socket.io/docs/v4/
*
*/


import { io } from "socket.io-client"      //client socket library
import sensor from 'node-dht-sensor'       //humidity sensor library
import pigpio from 'pigpio'                //library for servo and ultrasonic
import { Gpio } from 'onoff'               //library for servo and ultrasonic



const min_angle = -90 //servo angle
const min_usec = 500 //servo
const max_angle = 90 //servo angle
const max_usec = 2500 //servo
const servo = new pigpio.Gpio(17, { mode: pigpio.Gpio.OUTPUT }) //setting servo pin number


  //setting servo angle
  async function setAngle(angle) { 
    const duty_usec = Math.floor(((angle - min_angle) / (max_angle - min_angle)) * (max_usec - min_usec) + min_usec) //servo
    servo.servoWrite(duty_usec); //servo
}

const MICROSECDONDS_PER_CM = 1e6/34321;  //calculating microseconds per centimeters for ultrasonic
var clientDistance=0   //ultrasonic
const trigger = new pigpio.Gpio(6,  {mode: Gpio.OUTPUT})   //setting ultrasonic trigger pin
const echo = new pigpio.Gpio(5, {mode: Gpio.INPUT, alert: true})   //setting ultrasonic echo pin



// --- COMMON CODE --- Deciding the last activity whether it's local or remote and setting the servo angle correspondingly
let lastData = {
  compost: { remote: 0, local: 0, angle: min_angle },       //remote compost time, local compost time and angle value
  water:   { remote: 0, local: 0, angle: max_angle },       //remote watering time, local watering time and angle value
}
const humidityLimit = 60       //setting humidity limit
const distanceLimit = 10       //setting distance limit
const timeout = 30 * 1000      //setting maximun time for the dial to go back to angle 0 after detecting an activity

function updateOutput() {
  let angle = (min_angle + max_angle) / 2;

  // Find the most recent remote event and time
  let mostRecentRemoteEvent = null;
  let mostRecentRemoteTime = null;
  for (const evt in lastData) {
    if (mostRecentRemoteEvent == null || lastData[evt].remote > mostRecentRemoteTime) {
      mostRecentRemoteEvent = evt;
      mostRecentRemoteTime = lastData[evt].remote;
    }
  }

  // Calculate how long ago it was
  const now = Date.now()
  const remoteEventTimeAgo = now - mostRecentRemoteTime

  // If the remote event happened recently, we will set the angle
  if (remoteEventTimeAgo <= timeout) {
    //mostRecentRemoteEvent // 'compost'/'water'
    // ...but only if we haven't done the same action more recently (locally)
    if (lastData[mostRecentRemoteEvent].local < lastData[mostRecentRemoteEvent].remote) {
      // Set the angle, decay towards zero
      angle = lastData[mostRecentRemoteEvent].angle * (1 - (remoteEventTimeAgo / timeout))
    }
  }

  console.log(`ANGLE: Remote '${mostRecentRemoteEvent}' ${Math.floor(remoteEventTimeAgo / 1000)}s ago (ours was ${Math.floor((now - lastData[mostRecentRemoteEvent].local) / 1000)}s ago) ==> ${angle.toFixed(1)} deg`)
  setAngle(angle);
}

setInterval(updateOutput, 1000);
// --- END OF COMMON CODE ---




//ultrasonic serction
trigger.digitalWrite(0)    
const watchHCSR04 = () => { 
  let startTick; 
 
  echo.on('alert', (level, tick) => { 
    if (level == 1) { 
      startTick = tick; 
    } else { 
      const endTick = tick; 
      const diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic 
      clientDistance=diff / 2 / MICROSECDONDS_PER_CM 
    } 
  }); 
}; 
 
watchHCSR04(); 
setInterval(() => { 
  trigger.trigger(100, 1); // Set trigger high for 10 microseconds 
}, 1000);
//end of ultrasonic part



const socket = io("ws://groupa.local:3500")  //listening to port 3500 of server pi which its name is goupa
console.log('client established')
var clientSensorValues={}         //dictionary variable that stores the values that comes from the client sensors



//a function that reads the humidity sensor values, set the values of clientSensorValues and send them to the server
 function read_sensor ()
{    
  sensor.read(11, 4, function(err, clientTemperature, clientHumidity) {  //sensing humidity readings
    if (!err) {
      clientSensorValues = { clientTemperature, clientHumidity, clientLight, clientDistance } //same key name with same key value
      console.log(`temp: ${clientSensorValues.clientTemperature}°C, humidity: ${clientSensorValues.clientHumidity}%, light: ${clientSensorValues.clientLight}, distance: ${clientSensorValues.clientDistance}`); //displaying sensor readings

      //checking if client humidity and distance exceed the limits, then save the time of these actions
      if (clientSensorValues.clientHumidity > humidityLimit) {
        lastData.water.local = Date.now();
      }
  
      if (clientSensorValues.clientDistance <= distanceLimit) {
        lastData.compost.local = Date.now();
      }
  
      socket.emit("hello from client", clientSensorValues) //sending client sensor data to the server
    } else {
      console.log(`SENSOR-ERROR: ${err}`)
    }
  })
}


//receive a message from the server, just to make sure the connection is done, this message contains socket id
socket.on("hello from server", data => {    
  console.log('hello from server', data) //data here is the id of the coming socket from the server
  console.log('SENSOR: Starting...')
  setInterval(read_sensor, 1000)         //repeat the read_sensor() function every 1 second
});




socket.on("the signal from server to client", data => {         //receiving sensor data sent from the server
  console.log('signal sent from server:',data)                  // printing the receiver server data on console
  
  //checking if server humidity and distance exceed the limits, then save the time of these actions
  if (data.serverHumidity > humidityLimit) {
    lastData.water.remote = Date.now();
  }

  if (data.serverDistance <= distanceLimit) {
    lastData.compost.remote = Date.now();
  }


})
