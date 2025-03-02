import { TpaServer, TpaSession } from '@augmentos/sdk';
import * as readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';

// Convert exec to Promise-based
const execPromise = promisify(exec);

// Default song chords as a fallback
const DEFAULT_SONG_CHORDS = [
  "C Am G C",       // Measure 1
  "F G C Em",       // Measure 2
  "Am F C G",       // Measure 3
  "F G7 C C7",      // Measure 4
  "F Fm C A7",      // Measure 5
  "Dm G7 C Am",     // Measure 6
  "F G Am Em",      // Measure 7
  "F G7 C -",       // Measure 8
  "Am E7 Am C7",    // Measure 9
  "F G7 C -"        // Measure 10
];

class AugmentedChordsApp extends TpaServer {
  private currentStartIndex = 0;
  private isShowingMessage = false; // Flag to track when displaying transitional messages
  private songChords = [...DEFAULT_SONG_CHORDS]; // Start with the default song
  private currentSongTitle = "Default Song";
  private currentSongKey = "C"; // Default key for the default song

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
        // Initial display of chords
        this.isShowingMessage = false; // Enable input after showing chords
        this.updateChordDisplay(session);
      }, 2000);
    }, 3500);

    // Handle events
    const cleanup = [
      session.events.onTranscription((data) => {
        console.log('Transcription:', data);
        
        // Only process commands when the transcription is final
        if (data.isFinal) {
          // Check for song requests - look for "play" or "play song" followed by a song name
          const transcription = data.text.toLowerCase();
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
            session.layouts.showTextWall("Voice Commands:\n- 'play [song name]'\n- 'help'\n\nNavigation:\n- Right arrow: Next\n- Left arrow: Previous");
            
            setTimeout(() => {
              this.isShowingMessage = false;
              this.updateChordDisplay(session);
            }, 5000);
          }
        }
      }),

      // session.events.onPhoneNotifications((data) => {
      //   console.log('Phone notification:', data);
      // }),

      // session.events.onGlassesBattery((data) => {
      //   console.log('Glasses battery:', data);
      // }),

      session.events.onError((error) => {
        console.error('Error:', error);
        
        // Display error to user
        this.isShowingMessage = true;
        session.layouts.showTextWall(`Error: ${error.message || 'Unknown error'}`);
        
        setTimeout(() => {
          this.isShowingMessage = false;
          this.updateChordDisplay(session);
        }, 3000);
      })
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
      // Use the Python interpreter from the virtual environment
      const { stdout, stderr } = await execPromise(`./venv/bin/python ./fetch_chords.py '${escapedSongName}'`);
      
      // Add detailed debugging to stderr only
      console.log(`Python script execution completed for "${songName}"`);
      
      if (stderr) {
        console.error('Python script stderr output (for debugging):');
        console.error(stderr);
      }
      
      // Parse the JSON output - the stdout should now be ONLY clean JSON
      let result;
      
      try {
        // With the stderr redirection fix, we should get clean JSON in stdout
        result = JSON.parse(stdout.trim());
        console.log(`Successfully parsed JSON output for "${songName}"`);
      } catch (parseError) {
        console.error("Failed to parse JSON output:", parseError);
        console.error("Raw stdout:", stdout);
        
        // Create a fallback result
        result = {
          success: false,
          error: "Failed to parse result from Python script",
          title: songName,
          song: songName,
          artist: "",
          key: "Unknown",
          chords: []
        };
      }
      
      if (result.success && result.chords && result.chords.length > 0) {
        // Script success - update the song data
        this.songChords = result.chords;
        
        // Get song title and key
        this.currentSongTitle = result.song || songName;
        this.currentSongKey = result.key || "Unknown";
        
        this.currentStartIndex = 0; // Reset to beginning of song
        
        console.log(`Successfully loaded chords for "${this.currentSongTitle}" in key of ${this.currentSongKey}. Found ${this.songChords.length} measures.`);
        
        // Show success message
        session.layouts.showTextWall(`Found chords for "${this.currentSongTitle}"\nKey: ${this.currentSongKey}\nLoading...`);
        
        setTimeout(() => {
          this.isShowingMessage = false;
          this.updateChordDisplay(session);
        }, 2000);
      } else {
        // Script returned no results or error
        console.error('Failed to fetch chords:', result.error || 'No chord data found');
        
        session.layouts.showTextWall(`No chord data found for "${songName}"\nTry another song name`);
        
        setTimeout(() => {
          this.isShowingMessage = false;
          this.updateChordDisplay(session);
        }, 3000);
      }
    } catch (error) {
      console.error('Error executing Python script:', error);
      
      // Show error message
      session.layouts.showTextWall(`Error looking up chords for "${songName}"\nPlease try again`);
      
      setTimeout(() => {
        this.isShowingMessage = false;
        this.updateChordDisplay(session);
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
      
      // Check for navigation inputs: "]" character from footswitch, right arrow, or left arrow
      if (keyPress === ']' || keyPress === '\u001B[C' || keyPress === 'Right' || keyPress === '\u001B[D' || keyPress === 'Left') {
        const inputSource = keyPress === ']' ? 'Footswitch' : 
                           (keyPress === '\u001B[C' || keyPress === 'Right') ? 'Right arrow' : 'Left arrow';
        
        console.log(`${inputSource} pressed`);
        
        // Ignore input if we're showing a message
        if (this.isShowingMessage) {
          console.log('Ignoring input - currently showing a message');
          return;
        }
        
        // Determine direction - forward for "]" and right arrow, backward for left arrow
        const isForward = keyPress === ']' || keyPress === '\u001B[C' || keyPress === 'Right';
        
        if (isForward) {
          console.log('Advancing forward');
          
          // Move to the next measure if possible
          if (this.currentStartIndex < this.songChords.length - 1) {
            // We can advance as long as we haven't reached the last measure
            this.currentStartIndex++;
            this.updateChordDisplay(session);
          } else {
            // We've reached the end of the song - loop back to beginning
            this.isShowingMessage = true; // Block input during end-of-song message
            session.layouts.showTextWall("End of song - looping back");
            
            // Reset to beginning but wait before displaying to avoid timing issues
            this.currentStartIndex = 0;
            
            // Delay showing first measures to give end message time to display
            setTimeout(() => {
              this.isShowingMessage = false; // Re-enable input after showing chords
              this.updateChordDisplay(session);
            }, 2000);
          }
        } else {
          console.log('Going backward');
          
          // Move to the previous measure if possible
          if (this.currentStartIndex > 0) {
            this.currentStartIndex--;
            this.updateChordDisplay(session);
          } else {
            // We're at the beginning - show a message
            this.isShowingMessage = true;
            session.layouts.showTextWall("Beginning of song");
            
            // Re-enable input after showing the message
            setTimeout(() => {
              this.isShowingMessage = false;
              this.updateChordDisplay(session);
            }, 1500);
          }
        }
      }
      
      // Allow Ctrl+C to exit
      if (keyPress === '\u0003') {
        process.exit();
      }
    });

    console.log('Input listener set up. Press "]", Right arrow to advance, Left arrow to go back, or Ctrl+C to exit.');
  }
  
  /**
   * Update the chord display on the glasses
   */
  private updateChordDisplay(session: TpaSession): void {
    // Get the current visible measures (up to 4)
    const visibleMeasures = this.songChords.slice(
      this.currentStartIndex, 
      Math.min(this.currentStartIndex + 4, this.songChords.length)
    );
    
    // Format measures with numbering for better visibility
    const formattedMeasures = visibleMeasures.map((measure, index) => {
      const measureNumber = this.currentStartIndex + index + 1;
      return `Measure ${measureNumber}: ${measure}`;
    });
    
    // Create title with song name and key
    const titleSection = `${this.currentSongTitle} - Key of ${this.currentSongKey} (${this.currentStartIndex + 1}/${this.songChords.length})`;
    
    // Display the first two measures in the top section (or fewer if not available)
    const topSection = formattedMeasures.slice(0, Math.min(3, formattedMeasures.length)).join('\n');
    
    // Display the next two measures in the bottom section (or fewer if not available)
    const bottomSection = formattedMeasures.length > 3 
      ? formattedMeasures.slice(3, 4).join('\n')
      : "End of song";
    
    // Show on the glasses (indefinitely)
    session.layouts.showReferenceCard(
      titleSection,
      topSection + "\n" + bottomSection
    );
    
    console.log('Currently displaying:', titleSection);
    console.log('Measures:', formattedMeasures);
  }
}

// Start the server
// DEV CONSOLE URL: https://augmentos.dev/
const app = new AugmentedChordsApp({
  packageName: 'org.kese.augmentedchords', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, play nice
  port: 3000, // The port you're hosting the server on
  augmentOSWebsocketUrl: 'wss://dev.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);