# Music Score Assistant
Music Score Assistant is an innovative project designed to enhance music accessibility for blind individuals, allowing them to experience and interact with musical scores in a unique, multi-sensory way. By leveraging tactile and auditory feedback, the system enables users to "read" and play music concurrently without relying on visual cues.


Features
Real-time Beat Feedback: Vibrates mobile devices and a dedicated ESP32 prototype to indicate time beats, with distinct feedback for the first beat of each bar.

Dynamic BPM-based Vibration: Automatically adjusts the intensity and pattern of vibrations on the ESP32 prototype in real-time, based on tempo changes (BPM) within the musical score.

Tactile and Auditory Note Communication: Converts musical notes into vibrations and audible feedback (via ESP32's DAC) to communicate pitch and duration in real-time.

MuseScore Integration: A custom MuseScore 3.x plugin extracts score data (MusicXML) directly from the editor.

Web-based Interface with Local File Support: Utilizes the AlphaTab.js library to process MusicXML/XML files, manage playback, and facilitate communication, supporting both URL-specified files and local uploads.

Robust Multi-Device BLE Communication: Connects to multiple ESP32 prototypes via WebBluetooth, employing a queued system to ensure reliable transmission of vibration and note data.

Cross-Device Compatibility: Also connects to mobile devices via WebSockets for versatile feedback delivery.

Comprehensive Data Flow: A robust architecture ensures seamless data transmission from score creation to multi-sensory output.




💡 How It Works
The core idea is to transform the visual experience of reading a musical score into a combination of tactile (vibration) and auditory (sound) sensations.

1.Score Export (MuseScore Plugin):
A specially developed MuseScore 3.x plugin acts as the entry point. When run, it exports the currently open musical score into a MusicXML file. This file is then passed to a local web application.

2.Web Application (AlphaTab & Communication Hub):
The web application hosts an instance of the AlphaTab.js library, which is used to parse and "play" the MusicXML/XML score.

Time Beats & Dynamic BPM: The application precisely calculates time beats and dynamically adapts to changes in the score's BPM. This information is then used to control vibration patterns.

Note Playback: As notes are played in the score, their MIDI values and durations are extracted.

WebBluetooth: For more direct and precise tactile/auditory feedback, the data is also sent to one or more ESP32 prototype devices via WebBluetooth. This communication is managed through queues to ensure robust and ordered delivery of commands for both vibrations (BPM periods) and notes (frequencies).

3.ESP32 Prototype Device:
This custom hardware device is designed to receive Bluetooth Low Energy (BLE) commands from the web application. It translates the incoming data into physical outputs:

Dynamic Vibration: For time beats, with vibration periods adjusted dynamically based on the BPM received.

Audible Notes: By converting MIDI note numbers to frequencies and playing them through a Digital-to-Analog Converter (DAC) and an amplifier.




🛠️ Implementation Details

MuseScore Plugin Side
The MuseScore plugin's core functionality is to export the active score as MusicXML and launch the web interface.

function openGenerator(filePath, filename) {
  // Define the new file path for the exported MusicXML within the webpage directory
  var newFilePath = filePath + "/src/webpage/" + filename;
  
  // Attempt to write the current score to the specified MusicXML file
  if (!writeScore(curScore, newFilePath, "musicxml")) {
    alert.text = "Cannot export the current score, try again.";
    alert.open();
    return;
  }
  // Open a new web browser page pointing to the local AlphaTab instance,
  // passing the filename as a URL parameter
  Qt.openUrlExternally("http://localhost:8000?filename=" + filename);
  Qt.quit(); // Exit the plugin script
}

onRun: {
  var filename = "new-exported.musicxml";
  openGenerator(filePath, filename); // Execute the main logic when the plugin runs
}


Webpage Side (main.js)
The web application manages the rendering of the score, the communication protocols, and the user interface. This section highlights the key JavaScript logic.

Core Initialization and File Handling

The main script initializes AlphaTab, sets its master volume to 1 (allowing local sound playback), and handles both files specified via URL parameters and local file uploads.
// Load elements from the DOM
const wrapper = document.querySelector(".at-wrap");
const main = wrapper.querySelector(".at-main");
const urlParams = new URL(window.location.href).searchParams;
const urlFileName = urlParams.get("filename"); // File name from URL parameter
let connectedBleDevices = new Map(); // Map to store multiple connected BLE devices

// Initialize alphatab
const settings = {
  file: urlFileName ?? "/file.xml", // Default file or from URL
  player: {
    enablePlayer: true,
    enableCursor: true,
    enableUserInteraction: true,
    soundFont: "/dist/soundfont/sonivox.sf2", 
    scrollElement: wrapper.querySelector(".at-viewport"),
  },
};
let api = new alphaTab.AlphaTabApi(main, settings);
api.masterVolume = 1; // AlphaTab's master volume is now enabled for local sound
// ... (other initializations like inputElement, timeSignaturePauses, metronomeWorker)

BLE Communication Logic
The project utilizes Web Bluetooth for robust communication with the ESP32, including support for multiple devices and a queued command system.

// Setup Bluetooth buttons and UUIDs
const connectButton = document.querySelector(".connect");
const disconnectButton = document.querySelector(".disconnect");
const deviceName = 'ESP32'; // Name of the target BLE device
const bleService = '19b10000-e8f2-537e-4f6c-d104768a1214'; // BLE Service UUID
const vibrationCharacteristicUUID = '19b10002-e8f2-537e-4f6c-d104768a1214'; // Characteristic UUID for vibration period
const notesCharacteristicUUID = '39114440-f153-414b-9ca8-cd739acad81c'; // Characteristic UUID for note/frequency data

connectButton.addEventListener("click", (event) => {
  if (isWebBluetoothEnabled()) {
    connectToDevice(); // Initiates BLE connection
  }
});
disconnectButton.addEventListener("click", disconnectDevice); // Handles disconnection

// Function to connect to a BLE device
function connectToDevice() {
  // ... (implementation: requests device, connects, gets services/characteristics)
  // Stores connected devices in `connectedBleDevices` Map, each with its own queues.
}

// Function to handle device disconnection
function onDisconnected(event) {
  // ... (updates device status in map, clears its queues)
  // Pauses AlphaTab playback ONLY if ALL connected devices are disconnected.
}

// Function to disconnect all devices
function disconnectDevice() {
  // ... (iterates `connectedBleDevices` map, calls disconnect on each)
  // Clears the map and pauses AlphaTab playback.
}

// Function to send vibration period (BPM) to an ESP32 device
async function sendVibrationPeriodToBleDevices(deviceInfo, periodMs) {
  // `periodMs` is a Uint16 (0 to stop vibration)
  // Adds command to `deviceInfo.vibrationQueue` and starts `processVibrationQueue`.
}

// Function to send note frequency to all connected ESP32 devices
function sendNoteCommandToBleDevices(value) {
  // `value` is frequency (Uint16) or 0 (stop note)
  // Adds command to `notesQueue` of each device and starts `processNotesQueue`.
}

// Queue processing for notes (similar logic for vibrations)
function processNotesQueue(deviceInfo) {
  // Sends commands from `deviceInfo.notesQueue` using `writeValueWithoutResponse`.
  // Ensures commands are sent sequentially and handles errors.
}


MIDI to Frequency Conversion
The conversion map and convertMidiToFrequency function ensure MIDI note numbers are correctly translated into frequencies for the ESP32's DAC.

// MIDI to Frequency conversion map
const conversion = { /* ... map of MIDI notes to frequencies ... */ };

/**
 * Converts a MIDI note number to its corresponding frequency in Hz.
 * Clamps the input to the range 48-83.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz.
 */
function convertMidiToFrequency(midi) { /* ... implementation ... */ }


Metronome and Dynamic BPM Management (createMetronome and playPause events)
The createMetronome function now builds a tempoMapManual which tracks tempo changes across the score. The playPause event handler then uses this map and the api.tickPosition to dynamically send BPM updates (sendVibrationPeriodToBleDevices) to the ESP32.

let tempoMapManual = []; // Map that will contain { tickStart: number, periodMs: number }
let lastCalculatedPeriodMs = -1; // Tracks the last calculated and sent vibration period

// Function to pre-calculate BPM changes throughout the score
function createMetronome(score) {
  timeSignaturePauses = []; // (Still used by metronomeWorker for beat timing)
  tempoMapManual = []; // Reset for new score
  let lastTempo = 0;

  score.masterBars.forEach((bar) => {
    // ... (logic to determine currentBpm and calculate periodMs)
    if (currentBpm !== lastTempo) {
      const periodMs = Math.round(60000 / currentBpm);
      tempoMapManual.push({
        tickStart: bar.start,
        periodMs: periodMs,
      });
      lastTempo = currentBpm;
    }
    // ... (logic to populate timeSignaturePauses for metronomeWorker)
  });
  // Add a final entry to stop vibration at the end of the score
  tempoMapManual.push({ tickStart: score.duration, periodMs: 0 });
}

// Main play/pause control logic
playPause.onclick = (e) => {
  if (e.target.classList.contains("fa-play")) {
    // ... (existing worker termination, worker start)
    lastCalculatedPeriodMs = -1; // Reset to force first BPM send on play

    metronomeWorker.onmessage = function (message) {
      // ... (existing logic for visual beats)

      // NEW: Dynamic BPM sending logic based on AlphaTab's current position
      if (connectedBleDevices.size > 0 && api.playerState === alphaTab.synth.PlayerState.Playing) {
          const currentTick = api.tickPosition;
          let newPeriodToSet = 0;
          for (let i = tempoMapManual.length - 1; i >= 0; i--) {
              if (currentTick >= tempoMapManual[i].tickStart) {
                  newPeriodToSet = tempoMapManual[i].periodMs;
                  break;
              }
          }
          // Only send if the period has actually changed
          if (newPeriodToSet !== lastCalculatedPeriodMs) {
              connectedBleDevices.forEach(deviceInfo => {
                  if (deviceInfo.connected) {
                      sendVibrationPeriodToBleDevices(deviceInfo, newPeriodToSet);
                  }
              });
              lastCalculatedPeriodMs = newPeriodToSet;
          }
      }
    };
    api.playPause();
  } else if (e.target.classList.contains("fa-pause")) {
    // ... (pause logic)
    sendNoteCommandToBleDevices(0); // Stop notes on devices
    // Send stop vibration command to all devices
    connectedBleDevices.forEach(deviceInfo => {
        if (deviceInfo.connected) {
            sendVibrationPeriodToBleDevices(deviceInfo, 0);
        }
    });
    lastCalculatedPeriodMs = 0; // Reset last calculated period
    // ... (worker termination, UI clearing)
  }
};

// Stop button logic now also sends stop commands for notes and vibrations
stop.onclick = (e) => {
  // ... (worker termination, UI clearing, AlphaTab stop)
  sendNoteCommandToBleDevices(0);
  connectedBleDevices.forEach(deviceInfo => {
    if (deviceInfo.connected) {
        sendVibrationPeriodToBleDevices(deviceInfo, 0);
    }
  });
  lastCalculatedPeriodMs = 0;
};

api.playerStateChanged.on((e) => {
  // ... (play/pause icon change)
  // NEW: When playback stops (e.g., end of song), send stop vibration command
  if (e.state === alphaTab.synth.PlayerState.Stopped || e.state === alphaTab.synth.PlayerState.Paused) {
      connectedBleDevices.forEach(deviceInfo => {
          if (deviceInfo.connected) {
              sendVibrationPeriodToBleDevices(deviceInfo, 0);
          }
      });
      lastCalculatedPeriodMs = 0;
  }
});

api.activeBeatsChanged.on((args) => {
  let valueToPlay;
  if (args.activeBeats.length > 0 && args.activeBeats[0].noteValueLookup.size > 0) {
    const noteValues = Array.from(args.activeBeats[0].noteValueLookup.keys());
    if (typeof noteValues[0] === 'number' && !isNaN(noteValues[0])) {
      valueToPlay = convertMidiToFrequency(noteValues[0]);
      if (typeof valueToPlay !== 'number' || isNaN(valueToPlay)) {
        valueToPlay = 0; // Fallback to stop if frequency is invalid
      }
    } else {
      valueToPlay = 0; // Fallback to stop if note value is invalid
    }
  } else {
    valueToPlay = 0; // No active notes, send stop command
  }
  sendNoteCommandToBleDevices(valueToPlay); // Send note command to all devices
});

