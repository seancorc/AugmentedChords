import { TpaServer, TpaSession } from '@augmentos/sdk';
import * as readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { 
  ScraperResponse, 
  ProcessedSong,
  processSongData, 
  navigateNext,
  navigatePrevious,
  getCurrentLine,
  getNavigationInfo,
  jumpToSection
} from './utils';
import {
  TunerState,
  initTunerState,
  processTunerAudioChunk,
  handleTunerCommand,
  updateTunerDisplay,
  getTargetFrequency,
  formatTunerDisplay
} from './tuner';

// Convert exec to Promise-based
const execPromise = promisify(exec);

// Default song as a fallback (simple version of "Let It Be")
const DEFAULT_SONG: ScraperResponse = {
  "success": true,
  "song_title": "Let It Be",
  "artist": "The Beatles",
  "key": "C",
  "capo": undefined,  // Fix type error - use undefined instead of null
  "lines": [
    {
      "section": "Intro",
      "chords": ["C", "G", "Am", "Fmaj7", "F6"],
      "chord_positions": [0, 8, 16, 24, 32],
      "lyrics": null
    },
    {
      "section": "Intro",
      "chords": ["C", "G", "F", "C/E", "Dm7", "C"],
      "chord_positions": [0, 8, 16, 24, 32, 40],
      "lyrics": null
    },
    {
      "section": "Verse 1",
      "chords": ["C", "G", "Am", "Am/G", "Fmaj7", "F6"],
      "chord_positions": [0, 17, 30, 40, 48, 56],
      "lyrics": "When I find myself in times of trouble, Mother Mary comes to me"
    },
    {
      "section": "Verse 1",
      "chords": ["C", "G", "F", "C/E", "Dm7", "C"],
      "chord_positions": [0, 13, 20, 28, 36, 44],
      "lyrics": "Speaking words of wisdom, let it be"
    },
    {
      "section": "Verse 1",
      "chords": ["C", "G", "Am", "Am/G", "Fmaj7", "F6"],
      "chord_positions": [0, 13, 28, 40, 54, 62],
      "lyrics": "And in my hour of darkness, she is standing right in front of me"
    },
    {
      "section": "Verse 1",
      "chords": ["C", "G", "F", "C/E", "Dm7", "C"],
      "chord_positions": [0, 13, 20, 28, 36, 44],
      "lyrics": "Speaking words of wisdom, let it be"
    },
    {
      "section": "Chorus",
      "chords": ["Am", "G", "F", "C"],
      "chord_positions": [0, 12, 24, 36],
      "lyrics": "Let it be, let it be, let it be, let it be"
    },
    {
      "section": "Chorus",
      "chords": ["C", "G", "F", "C/E", "Dm7", "C"],
      "chord_positions": [0, 13, 23, 32, 40, 48],
      "lyrics": "Whisper words of wisdom, let it be"
    },
    {
      "section": "Verse 2",
      "chords": ["C", "G", "Am", "Am/G", "Fmaj7", "F6"],
      "chord_positions": [0, 13, 28, 40, 54, 62],
      "lyrics": "And when the broken hearted people, living in the world agree"
    },
    {
      "section": "Verse 2",
      "chords": ["C", "G", "F", "C/E", "Dm7", "C"],
      "chord_positions": [0, 13, 20, 28, 36, 44],
      "lyrics": "There will be an answer, let it be"
    },
    {
      "section": "Verse 2",
      "chords": ["C", "G", "Am", "Am/G", "Fmaj7", "F6"],
      "chord_positions": [0, 13, 28, 40, 54, 62],
      "lyrics": "For though they may be parted, there is still a chance that they will see"
    },
    {
      "section": "Verse 2",
      "chords": ["C", "G", "F", "C/E", "Dm7", "C"],
      "chord_positions": [0, 13, 20, 28, 36, 44],
      "lyrics": "There will be an answer, let it be"
    }
  ]
};

class AugmentedChordsApp extends TpaServer {
  private currentSong: ProcessedSong | null = null;
  private isShowingMessage = false; // Flag to track when displaying transitional messages
  private tunerState: TunerState; // Add tuner state
  private lastTunerUpdateTime = 0; // Track last update time for throttling

  constructor(options: any) {
    super(options);
    // Initialize tuner state
    this.tunerState = initTunerState();
  }

  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Setup keyboard input listener for the footswitch
    this.setupInputListener(session);

    // Wait for any system initialization messages to clear
    this.isShowingMessage = true; // Block input during startup
    setTimeout(() => {
      // Show welcome message
      session.layouts.showTextWall("AugmentedChords App Ready!\nSay 'play [song name]' to load a song");
      
      // Wait a moment before showing chords
      setTimeout(() => {
        // Initialize with default song
        this.currentSong = processSongData(DEFAULT_SONG);
        
        // Initial display of chords
        this.isShowingMessage = false; // Enable input after showing chords
        this.updateChordDisplay(session);
      }, 2000);
    }, 3500);

    // Handle events
    const cleanup = [
      session.events.onAudioChunk((data) => {
        // Process audio for tuner
        if (this.tunerState.isActive && !this.isShowingMessage) {
          // Use fixed sample rate as specified by AugmentOS team
          const actualSampleRate = 16000; // Fixed at 16kHz
          
          // Only log sample rate occasionally to avoid spam
          let now = Date.now();
          if (now - this.lastTunerUpdateTime > 2000) {
            console.log(`[AUDIO DEBUG] Using fixed sample rate: ${actualSampleRate}Hz`);
            
            // Calculate buffer details for debugging
            const bufferSize = data.arrayBuffer.byteLength;
            const bytesPerSample = 2; // Assuming 16-bit PCM
            const numSamples = bufferSize / bytesPerSample;
            const durationMs = (numSamples / actualSampleRate) * 1000;
            
            console.log(`[AUDIO DEBUG] Buffer size: ${bufferSize} bytes, 
              Format: 16-bit PCM, ${actualSampleRate}Hz, 
              Samples: ${numSamples}, 
              Duration: ${durationMs.toFixed(2)}ms`);
          }

          // Create a DataView to read the PCM data
          const dataView = new DataView(data.arrayBuffer);
          
          // Convert to float array for processing
          // Assuming 16-bit signed integer PCM data
          const floatArray = new Float32Array(dataView.byteLength / 2);
          for (let i = 0; i < floatArray.length; i++) {
            // Convert 16-bit PCM to float in range [-1, 1]
            floatArray[i] = dataView.getInt16(i * 2, true) / 32768.0;
          }
          
          // Process the audio with the tuner algorithm using the actual sample rate
          const updatedState = processTunerAudioChunk(floatArray, this.tunerState, actualSampleRate);
          
          // Update the tuner state with the processing results
          this.tunerState = updatedState;
          
          // Throttled display update to reduce traffic
          now = Date.now();
          if (this.tunerState.detectedFrequency !== null) {
            if (now - this.lastTunerUpdateTime > 500) {
              this.lastTunerUpdateTime = now;
              
              console.log(`[TUNER] Detected frequency: ${this.tunerState.detectedFrequency?.toFixed(2)} Hz, 
                Target: ${getTargetFrequency(this.tunerState.targetNote).toFixed(2)} Hz`);
              
              // Update the display with tuner information
              updateTunerDisplay(session, this.tunerState);
            }
          } else if (now - this.lastTunerUpdateTime > 1000) {
            // No frequency detected for over a second
            this.lastTunerUpdateTime = now;
            console.log("[TUNER] No pitch detected");
            
            // Update the display with tuner information
            updateTunerDisplay(session, this.tunerState);
          }
        }
      }),

      
      session.events.onTranscription((data) => {
        console.log('Transcription:', data);
        
        // Only process commands when the transcription is final
        if (data.isFinal) {
          const transcription = data.text.toLowerCase();
          
          // Check for tuner commands first
          const oldTunerActive = this.tunerState.isActive;
          
          // Process command and update tuner state
          this.tunerState = handleTunerCommand(transcription, this.tunerState);
          
          // If we just entered tuner mode
          if (!oldTunerActive && this.tunerState.isActive) {
            console.log('Entering tuner mode');
            this.isShowingMessage = true;
            
            session.layouts.showTextWall("Entering tuner mode...\nDefault target: E");
            
            setTimeout(() => {
              this.isShowingMessage = false;
              updateTunerDisplay(session, this.tunerState);
            }, 1500);
            return;
          }
          
          // If we just exited tuner mode
          if (oldTunerActive && !this.tunerState.isActive) {
            console.log('Exiting tuner mode');
            this.isShowingMessage = true;
            
            session.layouts.showTextWall("Exiting tuner mode...\nReturning to chord display");
            
            setTimeout(() => {
              this.isShowingMessage = false;
              this.updateChordDisplay(session);
            }, 1500);
            return;
          }
          
          // If in tuner mode and target note changed, just update the display
          if (this.tunerState.isActive) {
            updateTunerDisplay(session, this.tunerState);
            return;
          }
          
          // If not in tuner mode, process regular song commands
          
          // Check for song requests - look for "play" or "play song" followed by a song name
          const playCommandMatch = transcription.match(/(?:^|\.\s+|\!\s+|\?\s+)\b(?:play)(?:\s+song)?\s+(.+?)(?:\.|\?|!|$)/i);
          
          if (playCommandMatch) {
            const songName = playCommandMatch[1].trim();
            console.log(`Song request detected: "${songName}"`);
            
            // Show loading message
            this.isShowingMessage = true;
            session.layouts.showTextWall(`Searching for chords for "${songName}"...\nThis may take a minute`);
            
            // Call Python script to get song chords
            this.fetchSongChords(session, songName);
          } else if (transcription.includes("help") || transcription.includes("instructions")) {
            // Show help message
            this.isShowingMessage = true;
            session.layouts.showDoubleTextWall(
              "Voice Commands:\n- 'play [song name]'\n- 'go to [section name]'\n- 'tuner mode'\n- 'help'", 
              "Navigation:\n- Right arrow: Next line\n- Left arrow: Previous line"
            );
            
            setTimeout(() => {
              this.isShowingMessage = false;
              this.updateChordDisplay(session);
            }, 5000);
          } else {
            // Check for "go to [section]" command
            const sectionCommandMatch = transcription.match(/(?:^|\.\s+|\!\s+|\?\s+)\b(?:go\s+to)(?:\s+the)?\s+(.+?)(?:\.|\?|!|$)/i);
            if (sectionCommandMatch && this.currentSong) {
              const sectionName = sectionCommandMatch[1].trim();
              console.log(`Section jump request detected: "${sectionName}"`);
              
              // Try to jump to the requested section
              const updatedSong = jumpToSection(this.currentSong, sectionName);
              
              // Check if we actually jumped (did we find the section?)
              if (updatedSong.currentSectionIndex !== this.currentSong.currentSectionIndex) {
                this.currentSong = updatedSong;
                session.layouts.showTextWall(`Jumping to ${sectionName}...`);
                
                setTimeout(() => {
                  this.isShowingMessage = false;
                  this.updateChordDisplay(session);
                }, 1500);
              } else {
                // Section not found
                session.layouts.showTextWall(`Section "${sectionName}" not found`);
                
                setTimeout(() => {
                  this.isShowingMessage = false;
                  this.updateChordDisplay(session);
                }, 2000);
              }
            }
          }
        }
      }),

      // session.events.onError((error) => {
      //   console.error('Error:', error);
        
      //   // Display error to user
      //   this.isShowingMessage = true;
      //   session.layouts.showTextWall(`Error: ${error.message || 'Unknown error'}`);
        
      //   setTimeout(() => {
      //     this.isShowingMessage = false;
      //     if (this.tunerState.isActive) {
      //       updateTunerDisplay(session, this.tunerState);
      //     } else {
      //       this.updateChordDisplay(session);
      //     }
      //   }, 3000);
      // })
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));
  }

  /**
   * Fetch song chords using the Python script
   */
  private async fetchSongChords(session: TpaSession, songName: string): Promise<void> {
    try {
      console.log(`Executing Python script to fetch chords for "${songName}"...`);
      
      // Escape single quotes in the song name to prevent command injection
      const escapedSongName = songName.replace(/'/g, "'\\''");
      
      // Execute the Python script with the song name as an argument
      // Now using our fetch_chords_lyrics_scraper.py
      const { stdout, stderr } = await execPromise(`python3 ./fetch_chords_lyrics_scraper.py '${escapedSongName}'`);
      
      // Add detailed debugging to stderr only
      console.log(`Python script execution completed for "${songName}"`);
      
      if (stderr) {
        console.error('Python script stderr output (for debugging):');
        console.error(stderr);
      }
      
      // Parse the JSON output
      let rawData: ScraperResponse;
      
      try {
        rawData = JSON.parse(stdout.trim());
        console.log(`Successfully parsed JSON output for "${songName}"`);
      } catch (parseError) {
        console.error("Failed to parse JSON output:", parseError);
        console.error("Raw stdout:", stdout);
        
        // Create a fallback result
        rawData = {
          success: false,
          song_title: songName,
          artist: "",
          key: "Unknown",
          lines: []
        };
      }
      
      if (rawData.success && rawData.lines && rawData.lines.length > 0) {
        // Process the raw data into our structured format
        this.currentSong = processSongData(rawData);
        
        console.log(`Successfully loaded chords for "${this.currentSong.title}" in key of ${this.currentSong.key}. Found ${this.currentSong.sections.length} sections.`);
        
        // Show success message
        session.layouts.showTextWall(`Found chords for "${this.currentSong.title}"\nKey: ${this.currentSong.key}\nLoading...`);
        
        setTimeout(() => {
          this.isShowingMessage = false;
          this.updateChordDisplay(session);
        }, 2000);
      } else {
        // Script returned no results or error
        console.error('Failed to fetch chords:', rawData.success ? 'No chord data found' : rawData.error || 'Unknown error');
        
        session.layouts.showTextWall(`No chord data found for "${songName}"\nTry another song name`);
        
        setTimeout(() => {
          this.isShowingMessage = false;
          // If we have a current song, continue displaying it
          if (this.currentSong) {
            this.updateChordDisplay(session);
          }
        }, 3000);
      }
    } catch (error) {
      console.error('Error executing Python script:', error);
      
      // Show error message
      session.layouts.showTextWall(`Error looking up chords for "${songName}"\nPlease try again`);
      
      setTimeout(() => {
        this.isShowingMessage = false;
        // If we have a current song, continue displaying it
        if (this.currentSong) {
          this.updateChordDisplay(session);
        }
      }, 3000);
    }
  }

  /**
   * Setup a keyboard input listener to detect the footswitch input
   */
  private setupInputListener(session: TpaSession): void {
    // Set raw mode to get input without waiting for Enter key
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    process.stdin.on('data', (key: Buffer) => {
      const keyPress = key.toString();
      
      // Check for ONLY left and right arrow keys
      const isRightArrow = keyPress === '\u001B[C';
      const isLeftArrow = keyPress === '\u001B[D';
      
      // Exit if Ctrl+C is pressed
      if (keyPress === '\u0003') {
        process.exit();
      }
      
      // If we're showing a message, ignore navigation keys
      if (this.isShowingMessage) {
        return;
      }
      
      // If in tuner mode, handle special keyboard controls
      if (this.tunerState.isActive) {
        // Escape key - exit tuner mode
        if (keyPress === '\u001B') {
          console.log('Escape pressed, exiting tuner mode');
          
          this.tunerState.isActive = false;
          this.isShowingMessage = true;
          session.layouts.showTextWall("Exiting tuner mode...\nReturning to chord display");
          
          setTimeout(() => {
            this.isShowingMessage = false;
            this.updateChordDisplay(session);
          }, 1500);
        }
        return;
      }
      
      // Normal chord navigation mode
      if ((isRightArrow || isLeftArrow) && this.currentSong) {
        const inputSource = isRightArrow ? 'Right arrow' : 'Left arrow';
        console.log(`${inputSource} pressed`);
        
        if (isRightArrow) {
          // Navigate to next line
          this.currentSong = navigateNext(this.currentSong);
        } else {
          // Navigate to previous line
          this.currentSong = navigatePrevious(this.currentSong);
        }
        
        // Update the display with the new position
        this.updateChordDisplay(session);
      }
    });

    console.log('Input listener set up. Press Right arrow to advance, Left arrow to go back, or Ctrl+C to exit.');
  }
  
  /**
   * Update the chord display on the glasses
   */
  private updateChordDisplay(session: TpaSession): void {
    // If in tuner mode, don't update chord display
    if (this.tunerState.isActive) {
      updateTunerDisplay(session, this.tunerState);
      return;
    }
    
    if (!this.currentSong) {
      // No song loaded, show a message
      session.layouts.showTextWall("No song loaded. Say 'play [song name]' to load a song.");
      return;
    }
    
    // Get the current line to display
    const displayLine = getCurrentLine(this.currentSong);
    const navInfo = getNavigationInfo(this.currentSong);
    
    // Create the display content
    // Always show the section name with simplified navigation
    const topContent = `[${displayLine.sectionName}] ${navInfo}`;
    
    // Show on the glasses
    session.layouts.showTextWall(
      `${this.currentSong.title} - Key of ${this.currentSong.key}` + '\n' +
      `${this.currentSong.capo ? 'Capo: ' + this.currentSong.capo + 'th fret' : ''}` + '\n' +
      topContent + '\n' + displayLine.chordLine + '\n' + displayLine.lyricLine
    );
    
    console.log('Currently displaying:');
    console.log(`Title: ${this.currentSong.title} - Key of ${this.currentSong.key}${this.currentSong.capo ? ' - Capo: ' + this.currentSong.capo : ''}`);
    console.log(`Section: [${displayLine.sectionName}]`);
    console.log(`Chords: ${displayLine.chordLine}`);
    console.log(`Lyrics: ${displayLine.lyricLine}`);
    console.log(`Navigation: ${navInfo}`);
  }
}

// Start the server
// DEV CONSOLE URL: https://augmentos.dev/
const app = new AugmentedChordsApp({
  packageName: 'org.kese.augmentedchords', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, play nice
  port: 3000, // The port you're hosting the server on
  augmentOSWebsocketUrl: 'wss://staging.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);