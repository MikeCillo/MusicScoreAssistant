# Music Score Assistant

## 🎵Introduction
Music Score Assistant is an innovative project developed by the **University of Salerno** in the **Musimathics laboratory**, designed to revolutionize music accessibility for visually impaired individuals. By leveraging tactile and auditory feedback, it allows users to experience and interact with musical scores in a unique, multi-sensory way, enabling them to "read" and play music simultaneously without relying on visual cues.

##

## 💡 Key Features
  - Real-time Beat Feedback: Mobile devices and an ESP32 prototype vibrate to indicate tempo beats. The first beat of each measure receives distinct feedback for clear orientation.
    
  - Dynamic BPM-Based Vibration: The ESP32 prototype automatically adjusts vibration intensity and pattern in real-time, directly reflecting tempo (BPM) changes within the musical score.

  - Tactile and Auditory Note Communication: Musical notes are converted into vibrations and auditory feedback (via the ESP32's DAC), communicating pitch and duration in real-time.

  - MuseScore Integration: A custom MuseScore 3.x plugin efficiently extracts score data (MusicXML) directly from the editor.

  - Web Interface with Local File Support: Utilizes the powerful AlphaTab.js library to process MusicXML/XML files, handle playback, and facilitate communication. It supports both URL-specified files and local uploads.

  - Robust Multi-Device BLE Communication: Connects to multiple ESP32 prototypes via WebBluetooth, employing a sophisticated queueing system to ensure reliable and ordered transmission of vibration and note data.

  - Comprehensive Data Flow: A robust architecture ensures seamless data transmission from score creation to multi-sensory output.

## ⚙️ How It Works: A Detailed Overview

The fundamental principle of Music Score Assistant is to transform the visual experience of reading a musical score into a rich combination of tactile (vibration) and auditory (sound) sensations.

### 1.Score Export (MuseScore Plugin):
A custom-developed MuseScore 3.x plugin serves as the initial entry point. Once activated, it exports the currently open musical score as a MusicXML file. This file is then seamlessly passed to a local web application for processing.

### 2.Web Application (AlphaTab & Communication Hub):
The web application hosts an instance of the AlphaTab.js library, which parses and "plays" the MusicXML/XML score.

  - Tempo Beats and Dynamic BPM: The application precisely calculates tempo beats and dynamically adapts to BPM changes within the score. This information is crucial for controlling vibration patterns.

  - Note Playback: As notes are played in the score, their MIDI values and durations are extracted in real-time.

  - Communication Protocol:
        - WebBluetooth: For more direct and precise tactile/auditory feedback, data is also sent to one or more ESP32 prototypes via WebBluetooth. This communication is managed through dedicated queues for each connected device, ensuring robust and ordered delivery of commands for both vibrations (BPM periods) and notes (frequencies).

### 3.ESP32 Prototype Device:
This custom hardware device is specifically designed to receive Bluetooth Low Energy (BLE) commands from the web application. It translates incoming data into physical outputs:

  - Dynamic Vibration: For tempo beats, with vibration periods dynamically adjusted based on the received BPM.

  - Audible Notes: By converting MIDI note numbers into specific frequencies and playing them through a Digital-to-Analog Converter (DAC) and an amplifier.


## 🛠️ Implementation Details

### MuseScore Plugin Side
The primary function of the MuseScore plugin is to export the active score as MusicXML and then launch the web interface, passing the filename as a URL parameter.

```js
function openGenerator(filePath, filename) {
  // Defines the new path for the exported MusicXML file within the webpage directory
  var newFilePath = filePath + "/src/webpage/" + filename;
  
  // Attempts to write the current score to the specified MusicXML file
  if (!writeScore(curScore, newFilePath, "musicxml")) {
    alert.text = "Could not export current score, please try again.";
    alert.open();
    return;
  }
  // Opens a new web browser page pointing to the local AlphaTab instance,
  // passing the filename as a URL parameter
  Qt.openUrlExternally("http://localhost:8000?filename=" + filename);
  Qt.quit(); // Exits the plugin script
}

onRun: {
  var filename = "new-exported.musicxml";
  openGenerator(filePath, filename); // Executes the main logic on plugin startup
}
```
### Webpage Side (main.js)
The web application handles score rendering, communication protocols, and the user interface. This section highlights the key JavaScript logic, demonstrating robust multi-device BLE communication and dynamic BPM management

### Core Initialization and File Handling
The main.js script initializes AlphaTab, sets its master volume to 1 (enabling local sound playback), and intelligently handles both files specified via URL parameters (from the MuseScore plugin) and local file uploads.

```js
// Load elements from the DOM
const wrapper = document.querySelector(".at-wrap");
const main = wrapper.querySelector(".at-main");
const urlParams = new URL(window.location.href).searchParams;
const urlFileName = urlParams.get("filename"); // File name from URL parameter
let connectedBleDevices = new Map(); // Map to store multiple connected BLE devices

// Initialize alphatab with settings, including the soundfont for local playback
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
api.masterVolume = 1; // AlphaTab's master volume is now ENABLED for local sound!
// ... (other initializations like inputElement, timeSignaturePauses, metronomeWorker)
```

### BLE Communication Logic: Multi-Device & Queued Commands
The project now uses Web Bluetooth for robust communication with the ESP32, including support for multiple devices and a queued command system to ensure reliable and ordered transmission.

```js
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
disconnectButton.addEventListener('click', disconnectDevice); // Handles disconnection

// Function to connect to a BLE device
function connectToDevice() {
  // ... (implementation: requests device, connects, gets services/characteristics)
  // Stores connected devices in the `connectedBleDevices` map, each with its own queues.
  // Each device entry in the map now includes: { device: BluetoothDevice, server: GATTServer, 
  //   vibrationChar: BluetoothRemoteGATTCharacteristic, 
  //   notesChar: BluetoothRemoteGATTCharacteristic,
  //   vibrationQueue: [], notesQueue: [], isProcessingVibrationQueue: false, isProcessingNotesQueue: false, connected: true }
}

// Function to handle device disconnection
function onDisconnected(event) {
  // ... (updates device status in map, clears its queues)
  // Important: AlphaTab playback is paused ONLY if ALL connected devices are disconnected.
}

// Function to disconnect all devices
function disconnectDevice() {
  // ... (iterates `connectedBleDevices` map, calls disconnect on each)
  // Clears the map and pauses AlphaTab playback.
}

// Function to send vibration period (BPM) to an ESP32 device
async function sendVibrationPeriodToBleDevices(deviceInfo, periodMs) {
  // `periodMs` is a Uint16 (0 to stop vibration)
  // Adds the command to `deviceInfo.vibrationQueue` and starts `processVibrationQueue`.
}

// Function to send note frequency to ALL connected ESP32 devices
function sendNoteCommandToBleDevices(value) {
  // `value` is the frequency (Uint16) or 0 (stops the note)
  // Adds the command to the `notesQueue` of EVERY connected device and starts `processNotesQueue` for each.
}

// Queue processing for notes (similar logic for vibrations)
function processNotesQueue(deviceInfo) {
    if (deviceInfo.isProcessingNotesQueue || deviceInfo.notesQueue.length === 0 || !deviceInfo.connected) {
        return; 
    }
    deviceInfo.isProcessingNotesQueue = true;
    const command = deviceInfo.notesQueue.shift();
    const dataToSend = command.buffer;

    deviceInfo.notesChar.writeValueWithoutResponse(dataToSend)
        .then(() => {
            // console.log(`LOG QUEUE: Note sent (no-resp) to ${deviceInfo.name}`);
        })
        .catch(error => {
            console.error(`LOG QUEUE: Error sending Note to ${deviceInfo.name}:`, error);
            if (error.name === 'NetworkError') {
                deviceInfo.connected = false;
                deviceInfo.notesQueue = [];
                console.error(`Device ${deviceInfo.name} disconnected due to network error during note send.`);
            }
        })
        .finally(() => {
            deviceInfo.isProcessingNotesQueue = false;
            setTimeout(() => processNotesQueue(deviceInfo), 0);
        });
}
```
### MIDI to Frequency Conversion
The conversion map and convertMidiToFrequency function ensure that MIDI note numbers are correctly translated into frequencies for the ESP32's DAC. This is critical for accurate auditory feedback.

```js
// MIDI to Frequency conversion map (truncated for brevity)
const conversion = { 
    48: 130.81, 49: 138.59, 50: 146.83, 51: 155.56, 52: 164.81, 53: 174.61, 
    54: 185.0, 55: 196.0, 56: 207.65, 57: 220.0, 58: 233.08, 59: 246.94,
    60: 261.63, 61: 277.18, 62: 293.67, 63: 311.13, 64: 329.63, 65: 349.23,
    66: 369.99, 67: 392.0, 68: 415.3, 69: 440.0, 70: 466.16, 71: 493.88,
    72: 523.25, 73: 554.37, 74: 587.33, 75: 622.25, 76: 659.36, 77: 698.46,
    78: 739.99, 79: 783.99, 80: 830.61, 81: 880.0, 82: 932.33, 83: 987.77
};

/**
 * Converts a MIDI note number to its corresponding frequency in Hz.
 * Clamps the input to the MIDI range 48-83 to ensure valid output.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz, or a clamped value if outside the valid range.
 */
function convertMidiToFrequency(midi) {
    if (midi < 48) { return conversion[48]; }
    if (midi > 83) { return conversion[83]; }
    return conversion[midi];
}
```
### Metronome and Dynamic BPM Handling (createMetronome and playPause events)
The createMetronome function now builds a tempoMapManual that meticulously tracks tempo changes in the score. The playPause event handler then uses this map and AlphaTab's api.tickPosition to dynamically send BPM updates (sendVibrationPeriodToBleDevices) to all connected ESP32 devices.

```js
let tempoMapManual = []; // Map that will contain { tickStart: number, periodMs: number }
let lastCalculatedPeriodMs = -1; // Tracks the last calculated and sent vibration period

// Function to pre-calculate BPM changes in the score for dynamic vibration
function createMetronome(score) {
  timeSignaturePauses = []; // (Still used by metronomeWorker for beat timing)
  tempoMapManual = []; // Reset for a new score
  let lastTempo = 0;

  score.masterBars.forEach((bar) => {
    // ... (logic to determine currentBpm based on bar.tempoAutomation.value)
    // If BPM changes, adds an entry to tempoMapManual
    if (currentBpm !== lastTempo) {
      const periodMs = Math.round(60000 / currentBpm); // Calculates vibration period in milliseconds
      tempoMapManual.push({
        tickStart: bar.start,
        periodMs: periodMs,
      });
      lastTempo = currentBpm;
    }
    // ... (logic to populate timeSignaturePauses for the metronomeWorker)
  });
  // Adds a final entry to stop vibration at the end of the score
  tempoMapManual.push({ tickStart: score.duration, periodMs: 0 });
}

// Main play/pause control logic
playPause.onclick = (e) => {
  if (e.target.classList.contains("disabled")) {
    return;
  }
  if (e.target.classList.contains("fa-play")) {
    // ... (existing worker termination, worker start)
    lastCalculatedPeriodMs = -1; // Reset to force first BPM send on start

    metronomeWorker.onmessage = function (message) {
      // ... (existing logic for visual beats and WebSocket messages to mobile app)

      // NEW: Dynamic BPM sending logic based on AlphaTab's current position
      if (connectedBleDevices.size > 0 && api.playerState === alphaTab.synth.PlayerState.Playing) {
          const currentTick = api.tickPosition;
          let newPeriodToSet = 0;
          // Find the appropriate vibration period based on the current tick position
          for (let i = tempoMapManual.length - 1; i >= 0; i--) {
              if (currentTick >= tempoMapManual[i].tickStart) {
                  newPeriodToSet = tempoMapManual[i].periodMs;
                  break;
              }
          }
          // Send the command only if the period has actually changed from the last sent value
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
    // Send stop vibration command (period 0) to all connected devices
    connectedBleDevices.forEach(deviceInfo => {
        if (deviceInfo.connected) {
            sendVibrationPeriodToBleDevices(deviceInfo, 0);
        }
    });
    lastCalculatedPeriodMs = 0; // Reset last calculated period
    // ... (worker termination, UI cleanup)
  }
};

// The Stop button logic now also sends stop commands for notes and vibrations
stop.onclick = (e) => {
  // ... (worker termination, UI cleanup, AlphaTab stop)
  sendNoteCommandToBleDevices(0); // Stop any playing note
  connectedBleDevices.forEach(deviceInfo => {
    if (deviceInfo.connected) {
        sendVibrationPeriodToBleDevices(deviceInfo, 0); // Stop vibrations
    }
  });
  lastCalculatedPeriodMs = 0; // Reset last calculated period
};

// Listens to AlphaTab's player state changes to ensure devices stop correctly
api.playerStateChanged.on((e) => {
  // ... (play/pause icon change)
  // NEW: When playback stops (e.g., end of song), send stop vibration command to devices
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
```


### The scoreLoaded event
This event fires every time a score is loaded. When it does, the createMetronome function is called. This function is crucial for building the timeSignaturePauses array, which is then used to control the playback of the time signature beats.

```js
api.scoreLoaded.on((score) => {
  trackList.innerHTML = "";
  score.tracks.forEach((track) => {
    trackList.appendChild(createTrackItem(track));
  });
  createMetronome(score);
});
```

### Web Worker (metronomeWorker.js)
The metronomeWorker.js file contains a Web Worker that runs in a separate thread. This worker is responsible for scheduling metronome beats, preventing the main UI thread from blocking. It receives a sequence of beat pauses (delays) from the main thread and sends a message back for each scheduled beat. It supports start and stop commands.

```js 
// metronomeWorker.js
// This Web Worker is responsible for scheduling metronome beats in a separate thread,
// preventing the main UI thread from blocking. It receives a sequence of beat pauses
// (delays) from the main thread and sends a message back for each scheduled beat.
// It supports start and stop commands.

let timerId = null; // To keep track of the currently running setTimeout
let beatPauses = []; // Array of beat pauses (objects with waitTime and isFirstBeat)
let currentIndex = 0; // Current index for beatPauses

/**
 * Recursive function that schedules the next beat.
 * It sends a message to the main thread and then, if there are more beats,
 * schedules the next send via setTimeout.
 */
function scheduleNextBeat() {
  // Check if there are still beats to process
  if (currentIndex < beatPauses.length) {
    const element = beatPauses[currentIndex];

    // Send the current beat to the main thread
    self.postMessage(element);

    // Schedule the next beat.
    // waitTime is in seconds, setTimeout expects milliseconds.
    timerId = setTimeout(() => {
      currentIndex++; // Move to the next beat
      scheduleNextBeat(); // Call itself for the next beat
    }, element.waitTime * 1000);
  } else {
    // All beats have been sent.
    self.postMessage({ type: 'finished' }); // Signal completion
    timerId = null; // Reset timerId when the sequence is finished
    currentIndex = 0;
  }
}
```


## ESP32 Side (Esp32_Firmware.ino)
The ESP32 firmware configures the device as a BLE server, listening for commands from the webpage to provide tactile and auditory feedback.

### Library Initialization and Global Variables
Essential libraries for BLE, DAC, and Ticker are included. Global variables manage the BLE server, characteristics, connection status, and hardware pins for the buzzer (vibration) and LED. The DAC module is initialized for audio output.

```c++
#include <Ticker.h>      // For timer management
#include <BLEDevice.h>   // For core BLE functionalities
#include <BLEServer.h>   // For BLE server role
#include <BLEUtils.h>    // For BLE utilities
#include <BLE2902.h>     // For BLE characteristic descriptor
#include <driver/dac.h>  // For ESP32 Digital-to-Analog Converter

// BLE Setup
BLEServer* pServer = NULL;
// Separate declarations for the two characteristics
BLECharacteristic* pNotesCharacteristic = NULL;    // For musical notes (frequencies)
BLECharacteristic* pVibrationCharacteristic = NULL; // For vibration signals (metronome)

bool deviceConnected = false;
bool oldDeviceConnected = false;

// DAC related variables (using native ESP-IDF DAC driver)
const dac_channel_t DAC_CHANNEL = DAC_CHANNEL_1; // GPIO25 is DAC Channel 1

// --- GLOBAL VARIABLES FOR VIBRATION AND TONE ---
const int buzzPin = 32;    // Pin for the vibration motor
volatile int current_vibration_period_ms = 0; // Period in milliseconds between vibrations (0 for stop)
Ticker vibrationTicker;    // Ticker to manage automatic metronome vibration

esp_timer_handle_t vibration_off_timer_handle; // Handle for the timer that turns off vibration
const int ledGreenPin = 5; // Pin for the status LED (green)

#define SINE_WAVE_SAMPLES 32 // Increased for better sound quality
uint8_t sine_wave_table[SINE_WAVE_SAMPLES];
volatile int current_sine_sample_idx = 0; // Current sample index
esp_timer_handle_t dac_timer_handle; // Handle for the DAC timer
volatile int current_note_freq = 0; // Current note frequency (volatile for ISR access)

// Custom BLE UUIDs for service and characteristics
#define SERVICE_UUID                  "19b10000-e8f2-537e-4f6c-d104768a1214"
#define NOTES_CHARACTERISTIC_UUID     "39114440-f153-414b-9ca8-cd739acad81c"
#define VIBRATION_CHARACTERISTIC_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"
```

### setup() and loop() functions
The setup() function configures ESP32 pins, initializes the DAC, sets up the BLE server, defines custom BLE services and characteristics, and starts device advertising. The loop() function continuously monitors the connection status, updates DAC output based on current_note_frequency, and manages the vibration pattern according to current_vibration_period_ms.

```c++
void setup() {
  Serial.begin(115200); // Initialize serial communication for debugging
  pinMode(buzzPin, OUTPUT); // Set buzzPin as output
  pinMode(ledGreenPin, OUTPUT); // Set ledGreenPin as output
  dac_output_enable(DAC_CHANNEL); // Enable the DAC module

  // Create the BLE device
  BLEDevice::init("ESP32"); // Initialize BLE with device name "ESP32"

  // Create the BLE server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks()); // Register server callbacks

  // Create the BLE service
  BLEService *pService = pServer->createService(SERVICE_UUID); // Create a custom BLE service

  // Create the Vibration Characteristic
  pVibrationCharacteristic = pService->createCharacteristic(
                       VIBRATION_CHARACTERISTIC_UUID,
                       BLECharacteristic::PROPERTY_WRITE_NR // Write without response property
                     );

  // Create the Notes Characteristic
  pNotesCharacteristic = pService->createCharacteristic(
                       NOTES_CHARACTERISTIC_UUID,
                       BLECharacteristic::PROPERTY_WRITE_NR // Write without response property
                     );

  // Register callbacks for the characteristics
  pVibrationCharacteristic->setCallbacks(new VibrationCharacteristicCallbacks());
  pNotesCharacteristic->setCallbacks(new NotesCharacteristicCallbacks());

  // Start the service
  pService->start();

  // Start advertising the BLE device
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0); // Set preferred advertising interval
  BLEDevice::startAdvertising();
  Serial.println("Waiting for a client connection to notify...");

  // Initialize sine wave table and DAC timer
  init_sine_wave_table();
  const esp_timer_create_args_t dac_timer_args = {
      .callback = &dac_timer_callback,
      .name = "dac_timer"
  };
  ESP_ERROR_CHECK(esp_timer_create(&dac_timer_args, &dac_timer_handle));

  // Initialize vibration off timer
  const esp_timer_create_args_t vibration_off_timer_args = {
      .callback = &vibration_off_callback,
      .name = "vibration_off_timer"
  };
  ESP_ERROR_CHECK(esp_timer_create(&vibration_off_timer_args, &vibration_off_timer_handle));

  // Create FreeRTOS queue for notes
  xNoteQueue = xQueueCreate(NOTE_QUEUE_LENGTH, NOTE_QUEUE_ITEM_SIZE);
  if (xNoteQueue == NULL) {
    Serial.println("Error creating note queue!");
  }

  // Create a FreeRTOS task for DAC output (optional, but good practice for continuous output)
  xTaskCreatePinnedToCore(
      dac_output_task,    // Task function
      "DACOutputTask",    // Name of task
      2048,               // Stack size (bytes)
      NULL,               // Parameter of the task
      1,                  // Priority of the task
      NULL,               // Task handle to keep track of created task
      0                   // Core to run on (0 or 1)
  );
}

void loop() {
  // Handle device disconnection
  if (!deviceConnected && oldDeviceConnected) {
    Serial.println("Device disconnected.");
    digitalWrite(ledGreenPin, LOW); // Turn off LED on disconnection
    // Also stop any ongoing vibration or sound on disconnection
    current_vibration_period_ms = 0; // Stop vibration
    current_note_freq = 0; // Stop note sound (handled by DAC task)
    vibrationTicker.detach(); // Stop vibration ticker
    
    delay(500); // Give time for BT stack to reset
    pServer->startAdvertising(); // Restart advertising
    Serial.println("Restarting advertising");
    oldDeviceConnected = deviceConnected;
  }
  // Handle device connection
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
    digitalWrite(ledGreenPin, HIGH); // Turn on LED on connection
    Serial.println("Device Connected");
  }

  // Handle dynamic vibration in loop based on `current_vibration_period_ms`
  if (current_vibration_period_ms > 0) {
      if (!vibrationTicker.active()) { // Start if not already active
          float ticker_delay_s = static_cast<float>(current_vibration_period_ms) / 1000.0f;
          if (ticker_delay_s > 0.001) { // Ensure a minimum delay to prevent rapid re-attachment
              vibrationTicker.attach(ticker_delay_s, triggerVibrationBeat);
          } else {
              // Period is too small, effectively stop vibration
              vibrationTicker.detach();
              digitalWrite(buzzPin, LOW);
              if (esp_timer_is_active(vibration_off_timer_handle)) {
                  esp_timer_stop(vibration_off_timer_handle);
              }
          }
      }
  } else {
      vibrationTicker.detach(); // Stop vibration ticker if period is 0
      digitalWrite(buzzPin, LOW); // Ensure buzzer is off
      if (esp_timer_is_active(vibration_off_timer_handle)) {
          esp_timer_stop(vibration_off_timer_handle);
      }
  }

  // Feed the watchdog to prevent reset
  esp_task_wdt_reset();
  delay(1); // Small delay to allow other tasks to run
}
```

### Characteristic Callbacks for Vibration and Notes
The onWrite functions within the VibrationCharacteristicCallbacks and NotesCharacteristicCallbacks classes are triggered when data is received via BLE. They parse the incoming bytes to update the vibration period and note frequency, respectively, dynamically controlling the ESP32's outputs.

```c++
class NotesCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    uint8_t* pData = pCharacteristic->getData();
    size_t length = pCharacteristic->getLength();

    if (length == 0) {
        Serial.println("Empty NOTE packet received.");
        return;
    }

    if (length == 2) {
        uint16_t received_freq = (static_cast<uint16_t>(pData[1]) << 8) |
                                 static_cast<uint16_t>(pData[0]);
        int noteToSend = received_freq;

        if (xNoteQueue != NULL) {
          if (xQueueSend(xNoteQueue, &noteToSend, 0) != pdPASS) { // Send to queue, no wait
            Serial.println("WARNING: Note queue full or send failed! Packet discarded.");
          }
        }
    } else if (length == 1 && pData[0] == 0x00) {
        int stopNote = 0;
        if (xNoteQueue != NULL) {
            if (xQueueSend(xNoteQueue, &stopNote, 0) != pdPASS) { // Send to queue, no wait
              Serial.println("WARNING: Stop send queue full or failed! Packet discarded.");
            }
        }
    } else {
        Serial.print("WARNING: NOTE packet with invalid length (");
        Serial.print(length);
        Serial.println(").");
        int stopNote = 0; // Send a stop command if invalid
        if (xNoteQueue != NULL) {
            xQueueSend(xNoteQueue, &stopNote, 0);
        }
    }
  }
};

class VibrationCharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    uint8_t* pData = pCharacteristic->getData();
    size_t length = pCharacteristic->getLength();

    if (length == 0) {
        Serial.println("Empty VIBRATION packet received.");
        return;
    }

    if (length == 2) {
        uint16_t received_period_ms = (static_cast<uint16_t>(pData[1]) << 8) |
                                      static_cast<uint16_t>(pData[0]);
        current_vibration_period_ms = received_period_ms;

        // Logic to start/stop/update vibration ticker is now in loop()
        if (current_vibration_period_ms == 0) {
            Serial.println("Vibration command: STOP received (period 0).");
        } else {
            Serial.print("Vibration command: ON received. Period set to ");
            Serial.print(current_vibration_period_ms);
            Serial.println(" ms.");
        }
    } else {
        Serial.print("WARNING: VIBRATION packet with invalid length (");
        Serial.print(length);
        Serial.println("). Expected 2 bytes for period.");
        current_vibration_period_ms = 0; // Stop vibration on invalid data
    }
  }
};
```
## 🚀 Execution Tutorial
This tutorial will guide you through deploying and running the Music Score Assistant project locally.


### Prerequisites
Ensure you have the following software and hardware ready:

  - MuseScore 3: Music notation software.

  - Docker and Docker Compose: For containerizing the web application and WebSocket server.

  - Free Ports: Ensure ports 8000 and 8080 are available on your local machine.

  - ESP32 MCU: The microcontroller for the prototype device.

  - Required Modules: Vibration module, audio amplifier module, 3.5mm audio jack module.

  - Arduino IDE: For compiling and flashing the ESP32 firmware.

## Repository Setup

### 1.Clone the Repository: Navigate to your preferred directory (e.g., ~/Documents/Musescore 3/Plugins if you intend to keep it alongside other MuseScore plugins) and clone the project:

```bash
$ cd ~/Documents/Musescore\ 3/Plugins # Example path, adjust as needed
$ git clone https://github.com/MikeCillo/MusicScoreAssistant.git
```
Note: The project's previous name was esp32-prototype-Bluetooth-protocol, ensure you clone MusicScoreAssistant. If you have already cloned and renamed locally, you are fine.


### 2.Build

#### 2.1 Build Docker Environment: 
Navidate to the root of the cloned MusicScoreAssistant directory and build the Docker images:

```bash
$ cd MusicScoreAssistant
$ docker-compose build
```

#### 2.2 Build and Flash ESP32 Firmware:

  - Open the ESP32 firmware project (Esp32_Firmware.ino) in Arduino IDE.

  - Compile the code and upload it to your microcontroller.

  - Refer to the specific readme guide within the ESP32 folder (if available) for detailed hardware assembly and flashing instructions.

Then, power on your ESP32 device.


# Running on Other Platforms


### For Windows, Linux, or manual execution:

#### 1. Start Docker Container: Navigate to the MusicScoreAssistant directory and start the Docker services in detached mode:

```bash
$ cd MusicScoreAssistant
$ docker-compose up -d
```
#### 2. Power on ESP32: Ensure your ESP32 device is powered on.






## 🤝 Contribution
This project welcomes contributions, suggestions, and feedback. Feel free to open issues or submit pull requests on the GitHub repository.



## 📄 Citation
Credits to CoderLine: AlphaTab is a powerful cross-platform music notation and guitar tablature rendering library, central to this project's functionality. It enables loading and displaying musical scores from various data sources, including Guitar Pro files and its built-in markup language, alphaTex.

