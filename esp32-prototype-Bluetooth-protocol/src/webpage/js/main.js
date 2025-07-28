// main.js

// Load elements from the DOM
const wrapper = document.querySelector(".at-wrap");
const main = wrapper.querySelector(".at-main");
const urlParams = new URL(window.location.href).searchParams;
const urlFileName = urlParams.get("filename");
let connectedBleDevices = new Map();
let lastNoteSentTimestamp = 0;
const MIN_NOTE_INTERVAL_MS = 0; // Minimum interval between note sends in milliseconds
let lastSentNoteValue = null;

// --- VARIABLES FOR DYNAMIC BPM 
let lastCalculatedPeriodMs = -1; // Tracks the last calculated and sent vibration period
let tempoMapManual = []; // Map that will contain { tickStart: number, periodMs: number }

// Initialize alphatab
const settings = {
  file: urlFileName ?? "/file.xml", // Default file 
  player: {
    enablePlayer: true,
    enableCursor: true,
    enableUserInteraction: true,
    soundFont: "/dist/soundfont/sonivox.sf2", 
    scrollElement: wrapper.querySelector(".at-viewport"),
  },
};
let api = new alphaTab.AlphaTabApi(main, settings);
let timeSignaturePauses = []; // Still used by metronomeWorker for beat logic
let metronomeWorker = null;
api.masterVolume = 1; //AlphaTab's master volume

// Get file input element and hide if a file is specified in the URL
const inputElement = document.getElementById("input-file");
if (urlFileName) {
  document.getElementById("custom-input-file").style.display = "none";
}
// Add event listener for file uploads
inputElement.addEventListener("change", onUploadedFile, false);

/**
 * Handles the event when a user uploads a file.
 * Reads the uploaded file as an ArrayBuffer and loads it into AlphaTab.
 */
function onUploadedFile() {
  const file = this.files[0];
  let reader = new FileReader();
  reader.onload = function (e) {
    let arrayBuffer = new Uint8Array(reader.result);
    api.load(arrayBuffer);
  };
  reader.readAsArrayBuffer(file);
}

//----------- BLE LOGIC ------------

// Setup Bluetooth buttons and UUIDs
const connectButton = document.querySelector(".connect");
const disconnectButton = document.querySelector(".disconnect");
const deviceName = 'ESP32'; // Name of the target BLE device
const bleService = '19b10000-e8f2-537e-4f6c-d104768a1214'; // BLE Service UUID
const vibrationCharacteristicUUID = '19b10002-e8f2-537e-4f6c-d104768a1214'; // Characteristic UUID for vibration control
const notesCharacteristicUUID = '39114440-f153-414b-9ca8-cd739acad81c'; // Characteristic UUID for note/frequency data

// Connect Button (search for BLE Devices only if BLE is available)
connectButton.addEventListener("click", (event) => {
  if (isWebBluetoothEnabled()) {
    connectToDevice();
  }
});

// Disconnect Button
disconnectButton.addEventListener("click", disconnectDevice);

/**
 * Checks if the Web Bluetooth API is available in the current browser.
 * @returns {boolean} True if Web Bluetooth is enabled, false otherwise.
 */
function isWebBluetoothEnabled() {
  if (!navigator.bluetooth) {
    console.log("Web Bluetooth API is not available in this browser!");
    window.alert("Web Bluetooth API is not available in this browser!");
    return false;
  }
  return true;
}

/**
 * Initiates the connection process to a BLE device.
 * Requests a device, connects to its GATT server, and retrieves the necessary characteristics.
 */
function connectToDevice() {
  console.log("Initializing Bluetooth connection...");
  let deviceInstance;
  let gattServerInstance;

  navigator.bluetooth
  .requestDevice({
    filters: [{ services: [bleService] }], // Filter for devices advertising our service
    optionalServices: [bleService], // Request access to the service
  })
    .then((device) => {
      deviceInstance = device;
      console.log("Device selected:", deviceInstance.name, "(ID:", deviceInstance.id, ")");
      // Check if the device is already connected
      if (connectedBleDevices.has(deviceInstance.id) && connectedBleDevices.get(deviceInstance.id).connected) {
        throw new Error("Device already connected.");
      }
      // Add event listener for disconnection
      deviceInstance.addEventListener("gattserverdisconnected", onDisconnected);
      return deviceInstance.gatt.connect();
    })
    .then((gattServer) => {
      gattServerInstance = gattServer;
      return gattServerInstance.getPrimaryService(bleService);
    })
    .then((service) => {
      if (!service) throw new Error("Primary service not found.");
      // Get both vibration and notes characteristics in parallel
      return Promise.all([
        service.getCharacteristic(vibrationCharacteristicUUID).catch(err => { console.error("Error getting Vibration Characteristic:", err); return null; }),
        service.getCharacteristic(notesCharacteristicUUID).catch(err => { console.error("Error getting Notes Characteristic:", err); return null; }),
        Promise.resolve(service),
        Promise.resolve(gattServerInstance)
      ]);
    })
    .then(([vibrationCharInstance, notesCharInstance, serviceInstance, resolvedGattServer]) => {
      // Check if essential characteristics were found
      if (!vibrationCharInstance || !notesCharInstance) {
        if (resolvedGattServer && resolvedGattServer.connected) resolvedGattServer.disconnect();
        throw new Error("Essential characteristics (Vibration or Notes) not found. Ensure firmware is correct.");
      }
      
      // Store device information in the map
      const deviceInfo = {
        id: deviceInstance.id,
        name: deviceInstance.name,
        server: resolvedGattServer,
        service: serviceInstance,
        vibrationChar: vibrationCharInstance,
        notesChar: notesCharInstance,
        connected: true,
        isProcessingVibrationQueue: false,
        isProcessingNotesQueue: false,
        vibrationQueue: [],
        notesQueue: []
      };

      connectedBleDevices.set(deviceInstance.id, deviceInfo);
      console.log("Device added to list:", deviceInfo.name, ". Total devices:", connectedBleDevices.size);
    })
    .catch((error) => {
      console.error("Error during connection process for " + (deviceInstance ? deviceInstance.name : "a device") + ":", error.message);
      if (deviceInstance) deviceInstance.removeEventListener("gattserverdisconnected", onDisconnected);
    });
}

/**
 * Handles the device disconnection event.
 * Updates the device's connection status and clears its queues.
 * If all devices are disconnected, it pauses AlphaTab playback and stops the metronome worker.
 * @param {Event} event - The GATT server disconnected event.
 */
function onDisconnected(event) {
  const disconnectedDevice = event.target;
  console.warn("DISCONNECTED: Device", disconnectedDevice.name, "(ID:", disconnectedDevice.id, ") has disconnected.");

  if (connectedBleDevices.has(disconnectedDevice.id)) {
    const deviceInfo = connectedBleDevices.get(disconnectedDevice.id);
    deviceInfo.connected = false;
    deviceInfo.isProcessingVibrationQueue = false;
    deviceInfo.isProcessingNotesQueue = false;
    deviceInfo.vibrationQueue = [];
    deviceInfo.notesQueue = [];
    console.log("Device status and queues for", disconnectedDevice.name, "reset.");
  }

  let stillConnectedCount = 0;
  connectedBleDevices.forEach(dev => {
    if (dev.connected) stillConnectedCount++;
  });
  // If no devices are connected and AlphaTab is playing, pause it.
  if (stillConnectedCount === 0 && typeof api !== 'undefined' && api && api.playerState === alphaTab.synth.PlayerState.Playing) {
    console.log("All devices disconnected. Pausing playback.");
    if (typeof metronomeWorker !== 'undefined' && metronomeWorker) {
        metronomeWorker.postMessage({ type: 'stop' }); // Send stop message to worker
        metronomeWorker.terminate(); // Terminate the worker
        metronomeWorker = null;
    }
    api.playPause();
    // Clear visual loggers (if they exist)
    if (typeof noteLogger !== 'undefined' && noteLogger) noteLogger.innerHTML = "";
    if (typeof beatLogger !== 'undefined' && beatLogger) beatLogger.innerHTML = "";
  }
}

/**
 * Disconnects all currently connected BLE devices.
 * Clears the map of connected devices and pauses AlphaTab playback.
 */
function disconnectDevice() {
  console.log("Attempting to disconnect all devices...");
  connectedBleDevices.forEach((deviceInfo, deviceId) => {
    if (deviceInfo.server && deviceInfo.server.connected) {
      deviceInfo.server.disconnect();
    }
  });
  connectedBleDevices.clear();
  console.log("Connected devices map cleared.");

  // If AlphaTab is playing, pause it.
  if (typeof api !== 'undefined' && api && typeof api.playPause === 'function' && api.playerState === alphaTab.synth.PlayerState.Playing) {
    console.log("Pausing AlphaTab playback.");
    api.playPause();
  }
  // Clear visual loggers (if they exist)
  if (typeof noteLogger !== 'undefined' && noteLogger) {
    noteLogger.innerHTML = "";
  }
  if (typeof beatLogger !== 'undefined' && beatLogger) {
    beatLogger.innerHTML = "";
  }
  // Terminate the metronome worker
  if (typeof metronomeWorker !== 'undefined' && metronomeWorker) {
    console.log("Terminating metronomeWorker.");
    metronomeWorker.postMessage({ type: 'stop' }); // Send stop message to worker
    metronomeWorker.terminate(); // Terminate the worker
    metronomeWorker = null;
  }
}

// MIDI to Frequency conversion map for notes
const conversion = {
  48: 130.81, 49: 138.59, 50: 146.83, 51: 155.56, 52: 164.81, 53: 174.61, 54: 185.0, 55: 196.0,
  56: 207.65, 57: 220.0, 58: 233.08, 59: 246.94, 60: 261.63, 61: 277.18, 62: 293.67, 63: 311.13,
  64: 329.63, 65: 349.23, 66: 369.99, 67: 392.0, 68: 415.3, 69: 440.0, 70: 466.16, 71: 493.88,
  72: 523.25, 73: 554.37, 74: 587.33, 75: 622.25, 76: 659.36, 77: 698.46,
  78: 739.99, 79: 783.99, 80: 830.61, 81: 880.0, 82: 932.33, 83: 987.77,
};

/**
 * Converts a MIDI note number to its corresponding frequency in Hz.
 * Clamps the input to the range 48-83.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz.
 */
function convertMidiToFrequency(midi) {
  if (midi < 48) { return conversion[48]; }
  if (midi > 83) { return conversion[83]; }
  return conversion[midi];
}

/**
 * Sends a vibration period (in milliseconds) to a specific BLE device.
 * Adds the command to the device's vibration queue and initiates processing.
 * @param {object} deviceInfo - The device information object.
 * @param {number} periodMs - The vibration period in milliseconds (0 for stop).
 */
async function sendVibrationPeriodToBleDevices(deviceInfo, periodMs) {
    if (!deviceInfo || !deviceInfo.connected || !deviceInfo.vibrationChar) {
        console.warn(`Device ${deviceInfo ? deviceInfo.name : 'unknown'} not ready for vibration.`);
        return;
    }

    const data = new Uint16Array([periodMs]); // Create a 16-bit unsigned integer array
    const buffer = new Uint8Array(data.buffer); // Get the underlying byte buffer
    const payload = new Uint8Array([buffer[0], buffer[1]]); // Extract the two bytes

    const timestamp = Date.now();
    deviceInfo.vibrationQueue.push({ buffer: payload, timestamp: timestamp });
    processVibrationQueue(deviceInfo); // Start processing the queue
}

/**
 * Sends a note command (frequency value or 0 for stop) to all connected BLE devices.
 * Adds the command to each device's notes queue and initiates processing.
 * @param {number} value - The frequency value to send, or 0 to stop the note.
 */
function sendNoteCommandToBleDevices(value) {
    if (!connectedBleDevices || connectedBleDevices.size === 0) {
        console.log("No BLE devices connected.");
        return;
    }

    const timestamp = Date.now();

    connectedBleDevices.forEach((deviceInfo) => {
        if (!deviceInfo.connected) {
            console.log(`Device ${deviceInfo.name} not connected, skipping note send.`);
            return;
        }

        let dataBuffer;
        if (value === 0) {
            dataBuffer = new Uint8Array([0]); // Send single byte 0 for stop
        } else {
            const lsb = value & 0xFF; // Least significant byte
            const msb = (value >> 8) & 0xFF; // Most significant byte
            dataBuffer = new Uint8Array([lsb, msb]); // Send two bytes for frequency
        }

        // Check for duplicate commands to avoid redundant writes
        const lastNoteInQueue = deviceInfo.notesQueue[deviceInfo.notesQueue.length - 1];
        const isDuplicate = lastNoteInQueue &&
                            lastNoteInQueue.buffer.byteLength === dataBuffer.byteLength &&
                            Array.from(lastNoteInQueue.buffer).every((byte, i) => byte === dataBuffer[i]);

        if (!isDuplicate) {
            deviceInfo.notesQueue.push({ buffer: dataBuffer, timestamp: timestamp });
            processNotesQueue(deviceInfo); // Process the queue for this device
        } else {
            // console.log(`DEBUG: Duplicate note (${value}), not added to queue for ${deviceInfo.name}.`);
        }
    });
}

/**
 * Processes the notes queue for a specific BLE device.
 * Sends the next command in the queue via `writeValueWithoutResponse`.
 * Handles errors (e.g., network issues leading to disconnection).
 * @param {object} deviceInfo - The device information object.
 */
function processNotesQueue(deviceInfo) {
    // If already processing, queue is empty, or device is disconnected, do nothing
    if (deviceInfo.isProcessingNotesQueue || deviceInfo.notesQueue.length === 0 || !deviceInfo.connected) {
        return; 
    }

    deviceInfo.isProcessingNotesQueue = true; // Set flag to prevent re-entry
    const command = deviceInfo.notesQueue.shift(); // Get the next command from the queue
    const dataToSend = command.buffer; // The data (Uint8Array) to send

    const latency = Date.now() - command.timestamp; // Calculate latency from when command was queued

    console.log(`NOTES QUEUE for ${deviceInfo.name}: Size=${deviceInfo.notesQueue.length}, Latency=${latency}ms, Payload=${Array.from(dataToSend).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    deviceInfo.notesChar.writeValueWithoutResponse(dataToSend) // Send data without waiting for response
        .then(() => {
            // console.log(`LOG QUEUE: Note sent (no-resp) to ${deviceInfo.name}`);
        })
        .catch(error => {
            console.error(`LOG QUEUE: Error sending Note to ${deviceInfo.name}:`, error);
            // If a network error occurs, assume device disconnected and clear queue
            if (error.name === 'NetworkError') {
                deviceInfo.connected = false;
                deviceInfo.notesQueue = [];
                console.error(`Device ${deviceInfo.name} disconnected due to network error during note send.`);
            }
        })
        .finally(() => {
            deviceInfo.isProcessingNotesQueue = false; // Reset flag
            // Process next command in queue after a short delay (or immediately)
            setTimeout(() => processNotesQueue(deviceInfo), 0);
        });
}

/**
 * Processes the vibration queue for a specific BLE device.
 * Sends the next command in the queue via `writeValueWithoutResponse`.
 * Handles errors (e.g., network issues leading to disconnection).
 * @param {object} deviceInfo - The device information object.
 */
function processVibrationQueue(deviceInfo) {
  // If already processing, queue is empty, or device is disconnected, do nothing
  if (deviceInfo.isProcessingVibrationQueue || deviceInfo.vibrationQueue.length === 0 || !deviceInfo.connected) {
      return;
  }

  deviceInfo.isProcessingVibrationQueue = true; // Set flag to prevent re-entry
  const command = deviceInfo.vibrationQueue.shift(); // Get the next command from the queue
  const dataToSend = command.buffer; // The data (Uint8Array) to send

  const latency = Date.now() - command.timestamp; // Calculate latency from when command was queued

  console.log(`VIBRATION QUEUE for ${deviceInfo.name}: Size=${deviceInfo.vibrationQueue.length}, Latency=${latency}ms, Payload=${Array.from(dataToSend).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

  deviceInfo.vibrationChar.writeValueWithoutResponse(dataToSend) // Send data without waiting for response
      .then(() => {
          // console.log(`LOG QUEUE: Vibration sent to ${deviceInfo.name}`);
      })
      .catch(error => {
          console.error(`LOG QUEUE: Error sending Vibration to ${deviceInfo.name}:`, error);
          // If a network error occurs, assume device disconnected and clear queue
          if (error.name === 'NetworkError') {
              deviceInfo.connected = false;
              deviceInfo.vibrationQueue = [];
              console.error(`Device ${deviceInfo.name} disconnected due to network error during vibration send.`);
          }
      })
      .finally(() => {
          deviceInfo.isProcessingVibrationQueue = false; // Reset flag
          // Process next command in queue after a short delay (or immediately)
          setTimeout(() => processVibrationQueue(deviceInfo), 0);
      });
}

/**
 * Returns the current date and time in a formatted string.
 * @returns {string} The formatted date and time string.
 */
function getDateTime() {
  var currentdate = new Date();
  var day = ("00" + currentdate.getDate()).slice(-2);
  var month = ("00" + (currentdate.getMonth() + 1)).slice(-2);
  var year = currentdate.getFullYear();
  var hours = ("00" + currentdate.getHours()).slice(-2);
  var minutes = ("00" + currentdate.getMinutes()).slice(-2);
  var seconds = ("00" + currentdate.getSeconds()).slice(-2);
  var milliseconds = ("00" + currentdate.getMilliseconds()).slice(-3);
  var datetime =
    day +
    "/" +
    month +
    "/" +
    year +
    " at " +
    hours +
    ":" +
    minutes +
    ":" +
    seconds +
    ":" +
    milliseconds;
  return datetime;
}

//---------- END BLE LOGIC --------------

// Overlay logic for rendering status
const overlay = wrapper.querySelector(".at-overlay");
api.renderStarted.on(() => {
  overlay.style.display = "flex";
});
api.renderFinished.on(() => {
  overlay.style.display = "none";
});

// Track selector
/**
 * Creates a DOM element for a track item in the track list.
 * @param {object} track - The AlphaTab track object.
 * @returns {HTMLElement} The created track item element.
 */
function createTrackItem(track) {
  const trackItem = document
    .querySelector("#at-track-template")
    .content.cloneNode(true).firstElementChild;

  // Insert track name
  trackItem.querySelector(".at-track-name").innerText = track.name;

  // Dynamic FA icon choice based on track name
  const iconEl = trackItem.querySelector(".at-track-icon");
  if (iconEl) {
    const iconClass = getIconClassForTrack(track.name);
    iconEl.className = `at-track-icon fa ${iconClass}`;
  }

  // Associate the track data with the element
  trackItem.track = track;

  // Click to render only that track
  trackItem.onclick = (e) => {
    e.stopPropagation();
    api.renderTracks([track]);
  };

  return trackItem;
}

/**
 * Pre-calculates BPM changes for each section of the score and populates `tempoMapManual`.
 * Also prepares `timeSignaturePauses` for the metronome worker.
 * @param {object} score - The AlphaTab score object.
 */
function createMetronome(score) {
  timeSignaturePauses = []; // Reset list for metronomeWorker beats
  tempoMapManual = []; // Reset manual tempo map

  let lastTempo = 0; // Initialize with a value that will force the first update

  // Iterate over all masterBars to extract effective tempo changes
  score.masterBars.forEach((bar) => {
    let currentBpm = bar.tempoAutomation ? bar.tempoAutomation.value : lastTempo;
    if (currentBpm === 0) currentBpm = 120; // Fallback: avoid division by zero, use a default BPM

    // If tempo has changed compared to the last bar, record the new period
    if (currentBpm !== lastTempo) {
      const periodMs = Math.round(60000 / currentBpm); // Calculate period in milliseconds (60000ms/min / BPM)
      tempoMapManual.push({
        tickStart: bar.start, // Start position in ticks of this bar/section
        periodMs: periodMs,
      });
      lastTempo = currentBpm; // Update the last recorded tempo
    }

    // This part is for the metronomeWorker (JS timing), not directly for BLE BPM
    let barDuration =
      parseFloat(60 / parseInt(currentBpm)) * // Use the bar's currentBpm
      parseInt(bar.timeSignatureNumerator);
    if (parseInt(bar.timeSignatureNumerator) == 0) return;
    let beatsWaitTime = barDuration / parseInt(bar.timeSignatureNumerator);
    for (
      let index = 1;
      index <= parseInt(bar.timeSignatureNumerator);
      index++
    ) {
      if (index == 1) {
        timeSignaturePauses.push({
          waitTime: beatsWaitTime,
          isFirstBeat: true,
        });
      } else {
        timeSignaturePauses.push({
          waitTime: beatsWaitTime,
          isFirstBeat: false,
        });
      }
    }
  });

  // Add a final point to ensure vibration stops at the end of the song
  // or if there are no more specific tempo changes
  tempoMapManual.push({
      tickStart: score.duration, // Total score duration
      periodMs: 0 // Period 0 to stop vibration
  });
  console.log("Manual Tempo Map generated:", tempoMapManual);
}

const trackList = wrapper.querySelector(".at-track-list");
api.scoreLoaded.on((score) => {
  trackList.innerHTML = "";
  score.tracks.forEach((track) => {
    trackList.appendChild(createTrackItem(track));
  });
  createMetronome(score); // Recreate tempo map when a new score is loaded
});
api.renderStarted.on(() => {
  const tracks = new Map();
  api.tracks.forEach((t) => {
    tracks.set(t.index, t);
  });
  const trackItems = trackList.querySelectorAll(".at-track");
  trackItems.forEach((trackItem) => {
    if (tracks.has(trackItem.track.index)) {
      trackItem.classList.add("active");
    } else {
      trackItem.classList.remove("active");
    }
  });
});

/** Controls **/
api.scoreLoaded.on((score) => {
  wrapper.querySelector(".at-song-title").innerText = score.title;
  wrapper.querySelector(".at-song-artist").innerText = score.artist;
});

wrapper.querySelector(".at-controls .at-print").onclick = () => {
  api.print();
};

const zoom = wrapper.querySelector(".at-controls .at-zoom select");
zoom.onchange = () => {
  const zoomLevel = parseInt(zoom.value) / 100;
  api.settings.display.scale = zoomLevel;
  api.updateSettings();
  api.render();
};

const layout = wrapper.querySelector(".at-controls .at-layout select");
layout.onchange = () => {
  switch (layout.value) {
    case "horizontal":
      api.settings.display.layoutMode = alphaTab.LayoutMode.Horizontal;
      break;
    case "page":
      api.settings.display.layoutMode = alphaTab.LayoutMode.Page;
      break;
  }
  api.updateSettings();
  api.render();
};

// Player loading indicator
const playerIndicator = wrapper.querySelector(
  ".at-controls .at-player-progress"
);
api.soundFontLoad.on((e) => {
  const percentage = Math.floor((e.loaded / e.total) * 100);
  playerIndicator.innerText = percentage + "%";
});
api.playerReady.on(() => {
  playerIndicator.style.display = "none";
});

// Main player controls
/**
 * Gets the index of the current master bar based on the given tick position.
 * @param {number} currentTick - The current tick position in the score.
 * @returns {number} The index of the current master bar.
 */
function getCurrentBarIndex(currentTick) {
  // Find the index of the current bar based on the tick
  for (let i = api.score.masterBars.length - 1; i >= 0; i--) {
      if (api.score.masterBars[i].start <= currentTick) {
          return i;
      }
  }
  return 0; // If not found, return the first bar
}

// Visual metronome and note loggers (removed as per request, but variables still declared for safety)
const beatSignaler = document.getElementById("beat-signaler");
const beatLogger = document.getElementById("beat-logger");
const noteLogger = document.getElementById("note-logger");

/**
 * Highlights the beat signaler with a specific color (function kept for reference, but not used by original request).
 * @param {string} color - The color to set for the signaler.
 */
function highlightBeat(color) {
  // This function is no longer actively used as per the user's request to remove visual beat indicators.
  // It's kept here for completeness if there's a need to re-introduce visual feedback later.
  if (beatSignaler) {
    beatSignaler.style.color = color;
    beatSignaler.style.display = "block";
    setTimeout(function () {
      beatSignaler.style.display = "none";
    }, 100);
  }
}

const playPause = wrapper.querySelector(".at-controls .at-player-play-pause");
const stop = wrapper.querySelector(".at-controls .at-player-stop");

// --- PLAY/PAUSE AND METRONOME MANAGEMENT LOGIC (MODIFIED) ---
playPause.onclick = (e) => {
  if (e.target.classList.contains("disabled")) {
    return;
  }
  if (e.target.classList.contains("fa-play")) {
    // Terminate existing worker if present
    if (metronomeWorker) {
      metronomeWorker.postMessage({ type: 'stop' }); // Send stop message to worker
      metronomeWorker.terminate(); // Terminate the worker
      metronomeWorker = null;
    }

    // Reset calculated period state to force the first send
    lastCalculatedPeriodMs = -1;

    // Initialize and start the metronome worker
    metronomeWorker = new Worker("/js/metronomeWorker.js");
    // Clear visual beat logger (if it exists)
    if (beatLogger) beatLogger.innerHTML = "";
    // Send 'start' message to the worker with necessary data
    metronomeWorker.postMessage({
      type: 'start',
      startIndex: getCurrentBarIndex(api.tickPosition), // Initialize worker from current bar
      pauses: timeSignaturePauses, // Pass beat timing information
    });
    
    // Handle messages from the metronome worker
    metronomeWorker.onmessage = function (message) {
      // Handle worker messages (for visual beats and BPM calculation)
      if (message.data.type === 'finished') {
          // Optional: worker has finished its beat sequence
          console.log("MetronomeWorker has finished its sequence.");
          return;
      }

     

      // --- NEW LOGIC: CALCULATE AND SEND VIBRATION PERIOD HERE ---
      // Only send vibration commands if BLE devices are connected and AlphaTab is playing
      if (connectedBleDevices.size > 0 && api.playerState === alphaTab.synth.PlayerState.Playing) {
          const currentTick = api.tickPosition; // Current position in ticks from AlphaTab
          let newPeriodToSet = 0;

          // Find the correct period based on the current tickPosition
          // Iterate backwards through tempoMapManual to find the most recent tempo change
          for (let i = tempoMapManual.length - 1; i >= 0; i--) {
              if (currentTick >= tempoMapManual[i].tickStart) {
                  newPeriodToSet = tempoMapManual[i].periodMs;
                  break; // Found the most recent period, exit loop
              }
          }
          
          // If newPeriodToSet is 0, it means we are past the end or in an undefined tempo area,
          // so vibration should stop.

          // Send vibration command ONLY IF the period has changed
          if (newPeriodToSet !== lastCalculatedPeriodMs) {
              connectedBleDevices.forEach(deviceInfo => {
                  if (deviceInfo.connected) {
                      sendVibrationPeriodToBleDevices(deviceInfo, newPeriodToSet);
                  }
              });
              lastCalculatedPeriodMs = newPeriodToSet;
              console.log(`DEBUG: Metronome: Period updated to ${newPeriodToSet}ms (Tick: ${currentTick})`);
          }
      }
      // --- END NEW LOGIC ---
    };
    api.playPause(); // Start AlphaTab playback
  } else if (e.target.classList.contains("fa-pause")) {
    // Stop the devices (note and buzz)
    sendNoteCommandToBleDevices(0);

    // Send stop command for vibration
    connectedBleDevices.forEach(deviceInfo => {
        if (deviceInfo.connected) {
            sendVibrationPeriodToBleDevices(deviceInfo, 0);
        }
    });
    lastCalculatedPeriodMs = 0; // Reset last calculated period

    api.playPause(); // Pause AlphaTab playback
    // Clear visual loggers (if they exist)
    if (noteLogger) noteLogger.innerHTML = "";
    if (beatLogger) beatLogger.innerHTML = "";
    // Terminate the metronome worker
    if (metronomeWorker) {
      metronomeWorker.postMessage({ type: 'stop' }); // Send stop message to worker
      metronomeWorker.terminate(); // Terminate the worker
      metronomeWorker = null;
    }
  }
};

// --- STOP LOGIC (MODIFIED) ---
stop.onclick = (e) => {
  if (e.target.classList.contains("disabled")) {
    return;
  }
  // Terminate the metronome worker
  if (metronomeWorker) {
    metronomeWorker.postMessage({ type: 'stop' }); // Send stop message to worker
    metronomeWorker.terminate(); // Terminate the worker
    metronomeWorker = null;
  }
  // Clear visual loggers (if they exist)
  if (noteLogger) noteLogger.innerHTML = "";
  if (beatLogger) beatLogger.innerHTML = "";
  api.stop(); // Stop AlphaTab playback
  sendNoteCommandToBleDevices(0); // Send stop note command

  // Send stop command for vibration to all connected devices
  connectedBleDevices.forEach(deviceInfo => {
    if (deviceInfo.connected) {
        sendVibrationPeriodToBleDevices(deviceInfo, 0);
    }
  });
  lastCalculatedPeriodMs = 0; // Reset last calculated period
};

api.playerReady.on(() => {
  playPause.classList.remove("disabled");
  stop.classList.remove("disabled");
});
api.playerStateChanged.on((e) => {
  const icon = playPause.querySelector("i.fas");
  if (e.state === alphaTab.synth.PlayerState.Playing) {
    icon.classList.remove("fa-play");
    icon.classList.add("fa-pause");
  } else {
    icon.classList.remove("fa-pause");
    icon.classList.add("fa-play");
    // Also stop vibration if playback stops on its own (e.g., end of song)
    if (e.state === alphaTab.synth.PlayerState.Stopped || e.state === alphaTab.synth.PlayerState.Paused) {
        connectedBleDevices.forEach(deviceInfo => {
            if (deviceInfo.connected) {
                sendVibrationPeriodToBleDevices(deviceInfo, 0);
            }
        });
        lastCalculatedPeriodMs = 0;
    }
  }
});

// Song position display
/**
 * Formats a duration in milliseconds into a "MM:SS" string.
 * @param {number} milliseconds - The duration in milliseconds.
 * @returns {string} The formatted duration string.
 */
function formatDuration(milliseconds) {
  let seconds = milliseconds / 1000;
  const minutes = (seconds / 60) | 0;
  seconds = (seconds - minutes * 60) | 0;
  return (
    String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0")
  );
}

const songPosition = wrapper.querySelector(".at-song-position");
let previousTime = -1;
api.playerPositionChanged.on((e) => {
  const currentSeconds = (e.currentTime / 1000) | 0;
  if (currentSeconds == previousTime) {
    return;
  }

  songPosition.innerText =
    formatDuration(e.currentTime) + " / " + formatDuration(e.endTime);
});

api.activeBeatsChanged.on((args) => {
  
  let valueToPlay;

  if (args.activeBeats.length > 0 && args.activeBeats[0].noteValueLookup.size > 0) {
    const noteValues = Array.from(args.activeBeats[0].noteValueLookup.keys());
    
    // Ensure the first note value is a valid number before conversion
    if (typeof noteValues[0] === 'number' && !isNaN(noteValues[0])) {
      valueToPlay = convertMidiToFrequency(noteValues[0]);
      // If conversion results in invalid frequency, set to 0 (stop)
      if (typeof valueToPlay !== 'number' || isNaN(valueToPlay)) {
        console.warn("DEBUG: Invalid frequency from convertMidiToFrequency for MIDI:", noteValues[0], ". Setting STOP (0).");
        valueToPlay = 0; 
      }
    } else {
      console.warn("DEBUG: noteValues[0] is not a valid number:", noteValues[0], ". Setting STOP (0).");
      valueToPlay = 0;
    }
  } else {
    valueToPlay = 0; // No active notes, send stop command
  }

  const now = Date.now();

  if (typeof valueToPlay === 'number' && !isNaN(valueToPlay)) {
    if (valueToPlay === 0) { 
      // If it's a STOP command, send it only if the last command wasn't already STOP
      if (lastSentNoteValue !== 0) { 
        console.log("DEBUG: Sending STOP NOTE (0) via BLE.");
        sendNoteCommandToBleDevices(0);
        lastSentNoteValue = 0; // Update last sent note
        lastNoteSentTimestamp = now; // Update timestamp
      }
    } else if (valueToPlay > 0) { 
      if (now - lastNoteSentTimestamp > MIN_NOTE_INTERVAL_MS) { 
        console.log("DEBUG: Sending NOTE (" + valueToPlay + ") via BLE.");
        sendNoteCommandToBleDevices(valueToPlay);
        lastSentNoteValue = valueToPlay; // Update last sent note
        lastNoteSentTimestamp = now; // Update timestamp
      } else {
       
      }
    }
  } else {
    console.warn("DEBUG: activeBeatsChanged - Attempted to send a non-numeric/NaN value for note, skipped. Original value:", valueToPlay);
  }
});

// Count-in feature control // COUNTDOWN Before music start
const countIn = wrapper.querySelector('.at-controls .at-count-in');
countIn.onclick = () => {
  countIn.classList.toggle('active');
  if (countIn.classList.contains('active')) {
    api.countInVolume = 1; // Enable count-in volume
  } else {
    api.countInVolume = 0; // Disable count-in volume
  }
};

// Metronome feature control
const metronome = wrapper.querySelector('.at-controls .at-metronome');
metronome.onclick = () => {
  metronome.classList.toggle('active');
  
  // Enable or disable metronome sound
  if (metronome.classList.contains('active')) {
    api.metronomeVolume = 1;
  } else {
    api.metronomeVolume = 0;
  }
};

// Map of names to Font Awesome classes for track icons
/**
 * Returns the appropriate Font Awesome icon class based on the track name.
 * @param {string} name - The name of the track.
 * @returns {string} The Font Awesome icon class.
 */
function getIconClassForTrack(name) {
  const lower = name.toLowerCase();

  if (lower.includes("piano")) return "fa-music"; // Using fa-music as piano is not a direct FA icon
  if (lower.includes("guitar")) return "fa-guitar";
  if (lower.includes("drum")) return "fa-drum";
  if (lower.includes("violin")) return "fa-violin";
  if (lower.includes("bass")) return "fa-bass-guitar";
  if (lower.includes("vocal") || lower.includes("voice")) return "fa-microphone";
  if (lower.includes("flute")) return "fa-flute";
  if (lower.includes("sax")) return "fa-saxophone";
  if (lower.includes("trumpet")) return "fa-trumpet";
  // fallback default
  return "fa-music";
}

const trackList2 = wrapper.querySelector(".at-track-list"); 
api.scoreLoaded.on((score) => {
  // clear items
  trackList.innerHTML = "";
  // generate a track item for all tracks of the score
  score.tracks.forEach((track) => {
    trackList.appendChild(createTrackItem(track));
  });
});
api.renderStarted.on(() => {
  // collect tracks being rendered
  const tracks = new Map();
  api.tracks.forEach((t) => {
    tracks.set(t.index, t);
  });
  // mark the item as active or not
  const trackItems = trackList.querySelectorAll(".at-track");
  trackItems.forEach((trackItem) => {
    if (tracks.has(trackItem.track.index)) {
      trackItem.classList.add("active");
    } else {
      trackItem.classList.remove("active");
    }
  });
});