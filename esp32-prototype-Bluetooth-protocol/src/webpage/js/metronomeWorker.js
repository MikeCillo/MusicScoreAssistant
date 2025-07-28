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
    currentIndex = 0; // Reset the index
  }
}

/**
 * Handles incoming messages from the main thread.
 */
self.onmessage = function (message) {
  if (message.data.type === 'start') {
    // If a 'start' command is received, clear any previous timer
    // to prevent overlaps, then initialize and start the beat sequence.
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    // Assign the received data directly to beatPauses
    beatPauses = message.data.pauses;
    currentIndex = message.data.startIndex || 0; // Start from the specified index or 0

    // Check if beatPauses is empty before starting
    if (beatPauses && beatPauses.length > 0) {
        scheduleNextBeat(); // Start playing the beats
    } else {
        console.warn("Worker: No 'pauses' data received or empty array for metronome.");
        self.postMessage({ type: 'finished' }); // Send a finished message if no beats
    }

  } else if (message.data.type === 'stop') {
    // If a 'stop' command is received, clear the current timer
    // to immediately halt the beat sequence.
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    currentIndex = 0; // Reset the index
    console.log("Worker: Termination requested, timer cleared.");
  }
};