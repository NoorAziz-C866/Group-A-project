/**
* @author Noor Aziz
*  
* this is the server side file
* Humidity sensor code source: https://github.com/Taher1322/Raspberry_Pi_YT_Tutorial/commit/49e710ea1ff0f702f1f8184cf7e3f4122d10263f
* Ultrasonic sensor code source: source: https://github.com/fivdi/pigpio#measure-distance-with-a-hc-sr04-ultrasonic-sensor
* Socketio code source: https://socket.io/docs/v4/
* 
*/


import { Server } from "socket.io";          //server socket library
import pigpio from 'pigpio'                 //library for servo and ultrasonic
import sensor from 'node-dht-sensor'        //humidity sensor library
import { Gpio } from 'onoff'                //library for servo and ultrasonic


const min_angle = -90 //servo angle
const min_usec = 500  //servo
const max_angle = 90  //servo angle
const max_usec = 2500  //servo

const MICROSECDONDS_PER_CM = 1e6/34321;    //calculating microseconds per centimeters for ultrasonic
var serverDistance=0   //ultrasonic var that hold the distance

const trigger = new pigpio.Gpio(6,  {mode: Gpio.OUTPUT})  //setting ultrasonic trigger pin
const echo = new pigpio.Gpio(5, {mode: Gpio.INPUT, alert: true})   //setting ultrasonic echo pin
const servo = new pigpio.Gpio(17, { mode: pigpio.Gpio.OUTPUT })  //setting servo pin number

trigger.digitalWrite(0);   //ultrasonic


//setting servo angle function
async function setAngle(angle) {   
  const duty_usec = Math.floor(((angle - min_angle) / (max_angle - min_angle)) * (max_usec - min_usec) + min_usec)
  servo.servoWrite(duty_usec);
}



// --- COMMON CODE --- Deciding the last activity whether it's local or remote and setting the servo angle correspondingly
let lastData = {
  compost: { remote: 0, local: 0, angle: min_angle },    //remote compost time, local compost time and angle value
  water:   { remote: 0, local: 0, angle: max_angle },    //remote watering time, local watering time and angle value
}
const humidityLimit = 60     //setting humidity limit
const distanceLimit = 10     //setting distance limit
const timeout = 30 * 1000    //setting maximun time for the dial to go back to angle 0 after detecting an activity

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
const watchHCSR04 = () => { 
  let startTick; 
 
  echo.on('alert', (level, tick) => { 
    if (level == 1) { 
      startTick = tick; 
    } else { 
      const endTick = tick; 
      const diff = (endTick >> 0) - (startTick >> 0); // Unsigned 32 bit arithmetic 
      serverDistance=diff / 2 / MICROSECDONDS_PER_CM
    } 
  }); 
}; 
 
watchHCSR04(); 
setInterval(() => { 
  trigger.trigger(100, 1); // Set trigger high for 10 microseconds 
}, 1000);
//end of ultrasonic part




const io = new Server(3500);       //setting socket port number
console.log('server established')  

var ServerSensorValues={}   //dictionary variable that stores the values of ServerSensorValues and send them to the client



//a function that reads the humidity sensor values, set the values of ServerSensorValues
function read_sensor () {
  console.log('SENSOR: Read...')
  sensor.read(11, 4, function(err, serverTemparature, serverHumidity) {
    if (!err) {
      ServerSensorValues = { serverTemparature, serverHumidity, serverLight, serverDistance}  //same key name with same key value
      console.log(`temp: ${ServerSensorValues.serverTemparature}°C, humidity: ${ServerSensorValues.serverHumidity}%, light: ${ServerSensorValues.serverLight}, distance: ${ServerSensorValues.serverDistance} cm`) //displaying sensor reading on server's console

       //checking if server humidity and distance exceed the limits, then save the time of these actions
      if (ServerSensorValues.serverHumidity > humidityLimit) {
        lastData.water.local = Date.now();
      }

      if (ServerSensorValues.serverDistance <= distanceLimit) {
        lastData.compost.local = Date.now();
      }
    } else {
      console.log(`SENSOR-ERROR: ${err}`)
    }
  })
}



io.on("connection", (socket) => {       //establishing socket connection
  console.log('CONNECTION: ' + socket.id)

  // send a message to the client
  socket.emit("hello from server", socket.id);  //the message contains server's socket id
  servo.servoWrite(0)                  //setting duty cycle
  console.log('SENSOR: Starting...')
  
   setInterval(read_sensor, 1000)      //repeat the read_sensor() function every 1 second

  // receive a message from the client that contains sensors' readings of the client
  socket.on("hello from client", data => {
    console.log('hello from client', data)            //displaying the data received from the client on server's console
    socket.emit("the signal from server to client", ServerSensorValues)    //sending sensor readings from servor side sensors to the client

//checking if client humidity and distance exceed the limits, then save the time of these actions
    if (data.clientHumidity > humidityLimit) {
      lastData.water.remote = Date.now();
    }

    if (data.clientDistance <= distanceLimit) {
      lastData.compost.remote = Date.now();
    }

  })

})
