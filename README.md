#Music Score Assistant 

##🎵Introduction
Music Score Assistant is an innovative project designed to revolutionize music accessibility for visually impaired individuals. By leveraging tactile and auditory feedback, it allows users to experience and interact with musical scores in a unique, multi-sensory way, enabling them to "read" and play music simultaneously without relying on visual cues.

##💡 Key Features
  - Real-time Beat Feedback: Mobile devices and an ESP32 prototype vibrate to indicate tempo beats. The first beat of each measure receives distinct feedback for clear orientation.
    
  - Dynamic BPM-Based Vibration: The ESP32 prototype automatically adjusts vibration intensity and pattern in real-time, directly reflecting tempo (BPM) changes within the musical score.

  - Tactile and Auditory Note Communication: Musical notes are converted into vibrations and auditory feedback (via the ESP32's DAC), communicating pitch and duration in real-time.

  - MuseScore Integration: A custom MuseScore 3.x plugin efficiently extracts score data (MusicXML) directly from the editor.

  - Web Interface with Local File Support: Utilizes the powerful AlphaTab.js library to process MusicXML/XML files, handle playback, and facilitate communication. It supports both URL-specified files and local uploads.

  - Robust Multi-Device BLE Communication: Connects to multiple ESP32 prototypes via WebBluetooth, employing a sophisticated queueing system to ensure reliable and ordered transmission of vibration and note data.

  - Comprehensive Data Flow: A robust architecture ensures seamless data transmission from score creation to multi-sensory output.

##⚙️ How It Works: A Detailed Overview

The fundamental principle of Music Score Assistant is to transform the visual experience of reading a musical score into a rich combination of tactile (vibration) and auditory (sound) sensations.

1. Score Export (MuseScore Plugin):
A custom-developed MuseScore 3.x plugin serves as the initial entry point. Once activated, it exports the currently open musical score as a MusicXML file. This file is then seamlessly passed to a local web application for processing.


2.
Here's the README.md in English, incorporating details from the provided files and previous discussions, ready to be pasted on GitHub:

Music Score Assistant
✨ Introduction
Music Score Assistant is an innovative project designed to revolutionize music accessibility for visually impaired individuals. By leveraging tactile and auditory feedback, it allows users to experience and interact with musical scores in a unique, multi-sensory way, enabling them to "read" and play music simultaneously without relying on visual cues.

💡 Key Features
Real-time Beat Feedback: Mobile devices and an ESP32 prototype vibrate to indicate tempo beats. The first beat of each measure receives distinct feedback for clear orientation.

Dynamic BPM-Based Vibration: The ESP32 prototype automatically adjusts vibration intensity and pattern in real-time, directly reflecting tempo (BPM) changes within the musical score.

Tactile and Auditory Note Communication: Musical notes are converted into vibrations and auditory feedback (via the ESP32's DAC), communicating pitch and duration in real-time.

MuseScore Integration: A custom MuseScore 3.x plugin efficiently extracts score data (MusicXML) directly from the editor.

Web Interface with Local File Support: Utilizes the powerful AlphaTab.js library to process MusicXML/XML files, handle playback, and facilitate communication. It supports both URL-specified files and local uploads.

Robust Multi-Device BLE Communication: Connects to multiple ESP32 prototypes via WebBluetooth, employing a sophisticated queueing system to ensure reliable and ordered transmission of vibration and note data.

Cross-Device Compatibility: Also connects to mobile devices via WebSockets for versatile feedback delivery, including haptic vibrations and on-screen textual note descriptions.

Comprehensive Data Flow: A robust architecture ensures seamless data transmission from score creation to multi-sensory output.

⚙️ How It Works: A Detailed Overview
The fundamental principle of Music Score Assistant is to transform the visual experience of reading a musical score into a rich combination of tactile (vibration) and auditory (sound) sensations.

Score Export (MuseScore Plugin):
A custom-developed MuseScore 3.x plugin serves as the initial entry point. Once activated, it exports the currently open musical score as a MusicXML file. This file is then seamlessly passed to a local web application for processing.

Web Application (AlphaTab & Communication Hub):
The web application hosts an instance of the AlphaTab.js library, which parses and "plays" the MusicXML/XML score.

  - Tempo Beats and Dynamic BPM: The application precisely calculates tempo beats and dynamically adapts to BPM changes within the score. This information is crucial for controlling vibration patterns.

  - Note Playback: As notes are played in the score, their MIDI values and durations are extracted in real-time.

  - Communication Protocol:
        - WebBluetooth: For more direct and precise tactile/auditory feedback, data is also sent to one or more ESP32 prototypes via WebBluetooth. This communication is managed through dedicated queues for each connected device, ensuring robust and ordered delivery of commands for both vibrations (BPM periods) and notes (frequencies).

3.ESP32 Prototype Device:
This custom hardware device is specifically designed to receive Bluetooth Low Energy (BLE) commands from the web application. It translates incoming data into physical outputs:

  - Dynamic Vibration: For tempo beats, with vibration periods dynamically adjusted based on the received BPM.

  - Audible Notes: By converting MIDI note numbers into specific frequencies and playing them through a Digital-to-Analog Converter (DAC) and an amplifier.


##🛠️ Implementation Details

#MuseScore Plugin Side
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
