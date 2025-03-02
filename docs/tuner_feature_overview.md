# Guitar Tuner Mode: Data Flow & High-Level Walkthrough

## Data Flow Overview

```
Audio Input → PCM Processing → Pitch Detection → Note Identification → Display Feedback
```

## Key Components

1. **Mode State Manager**
   - Tracks whether app is in chord display mode or tuner mode
   - Handles mode transitions

2. **Voice Command Handler**
   - Processes "tuner mode" command to activate
   - Processes "tune to [NOTE]" to set target note
   - Processes "exit tuner" to return to chord mode

3. **Audio Pipeline**
   - Receives raw PCM audio chunks
   - Passes data to pitch detection algorithm

4. **Pitch Analyzer**
   - Calculates fundamental frequency from audio data
   - Converts frequency to musical note
   - Determines deviation from target note

5. **Tuner Display**
   - Formats and displays tuning information
   - Shows target note and detected note status

## Walkthrough

1. **Activation**
   - User says "tuner mode"
   - App sets internal state to tuner mode
   - Display switches from chord view to tuner view
   - Target note initialized to E

2. **Audio Processing**
   - App continuously receives PCM audio chunks from mic
   - When in tuner mode, chunks are routed to pitch analyzer
   - When no sound detected, display shows "<no note detected>"

3. **Pitch Detection**
   - When user plays a note:
     - Audio data analyzed to find fundamental frequency
     - Frequency converted to nearest musical note
     - Deviation from target calculated (in cents or similar measure)

4. **User Feedback**
   - Display shows:
     - Target note (e.g., "Target note: E")
     - Detected note with deviation (e.g., "E -12" or "E +5")
   - User adjusts instrument tuning based on feedback

5. **Target Note Change**
   - User says "tune to A"
   - Voice command handler sets new target note
   - Display updates to show new target
   - Pitch detection continues with new reference frequency

6. **Mode Exit**
   - User says "exit tuner"
   - App state returns to chord display mode
   - Normal chord visualization resumes

## Implementation Points

- Leverage existing `onAudioChunk` handler to receive audio data
- Add tuner mode flag to AugmentedChordsApp class
- Enhance transcription handler to recognize tuner commands
- Add simple frequency-to-note conversion logic
- Create minimal tuner display layout

This simplified approach focuses on the core functionality of detecting notes and providing tuning feedback, without complex visualizations or additional features. 