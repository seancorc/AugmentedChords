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

// Convert exec to Promise-based
const execPromise = promisify(exec);

// Default song as a fallback (simple version of "Let It Be")
const DEFAULT_SONG: ScraperResponse = {
  "success": true,
  "song_title": "Let It Be",
  "artist": "The Beatles",
  "key": "C",
  "lines": [
    {
      "section": "Intro",
      "chords": ["C", "G", "Am", "F"],
      "chord_positions": [0, 8, 16, 24],
      "lyrics": null
    },
    {
      "section": "Verse",
      "chords": ["C", "G", "Am", "F"],
      "chord_positions": [0, 17, 24, 33],
      "lyrics": "When I find myself in times of trouble"
    },
    {
      "section": "Verse",
      "chords": ["C", "G", "F", "C"],
      "chord_positions": [0, 13, 20, 30],
      "lyrics": "Mother Mary comes to me"
    },
    {
      "section": "Verse",
      "chords": ["C", "G", "Am", "F"],
      "chord_positions": [0, 13, 20, 27],
      "lyrics": "Speaking words of wisdom, let it be"
    },
    {
      "section": "Chorus",
      "chords": ["F", "Em", "Dm", "C"],
      "chord_positions": [0, 6, 14, 21],
      "lyrics": "Let it be, let it be, let it be, let it be"
    },
    {
      "section": "Chorus",
      "chords": ["C", "G", "F", "C"],
      "chord_positions": [0, 13, 20, 30],
      "lyrics": "Whisper words of wisdom, let it be"
    }
  ]
};

class AugmentedChordsApp extends TpaServer {
  private currentSong: ProcessedSong | null = null;
  private isShowingMessage = false; // Flag to track when displaying transitional messages

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
            session.layouts.showDoubleTextWall(
              "Voice Commands:\n- 'play [song name]'\n- 'go to [section name]'\n- 'help'", 
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
      
      // If we're showing a message or don't have a song loaded, ignore navigation keys
      if (this.isShowingMessage || !this.currentSong) {
        return;
      }
      
      if (isRightArrow || isLeftArrow) {
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
      `${this.currentSong.title} - Key of ${this.currentSong.key}` + '\n' +  '\n' +
      topContent + '\n' + displayLine.chordLine + '\n' + displayLine.lyricLine
    );
    
    console.log('Currently displaying:');
    console.log(`Title: ${this.currentSong.title} - Key of ${this.currentSong.key}`);
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
  augmentOSWebsocketUrl: 'wss://dev.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);