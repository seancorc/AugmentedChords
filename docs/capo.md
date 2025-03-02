# Capo Information Implementation Plan

## Overview
This document outlines the plan for implementing the display of capo information from Ultimate Guitar tabs in the AugmentedChords application. The implementation will extract capo information (e.g., "Capo: 5th fret") from the Ultimate Guitar website and display it alongside the song title and key information.

## Components to Modify

### 1. Python Scraper (`fetch_chords_lyrics_scraper.py`)
The scraper needs to be modified to extract capo information from the Ultimate Guitar page.

#### Implementation Steps:
1. Locate where tab_view data is extracted (around line 110-120)
2. Add code to extract capo information from the tab_view object
3. Add the capo information to the returned JSON response object

```python
# Example implementation for the scraper
# Inside the fetch_chords_lyrics function where tab_view is processed

# Extract capo information if available
capo_information = None
if tab_view.get("meta", {}).get("capo") is not None:
    capo_information = tab_view.get("meta", {}).get("capo")

# Add capo to the result object
result = {
    "success": True,
    "song_title": song_title,
    "artist": artist_name,
    "key": key,
    "capo": capo_information,  # <-- Add capo information
    "lines": lines
}
```

### 2. TypeScript Interface Updates (`utils.ts`)

#### ScraperResponse Interface:
Add an optional capo field to the ScraperResponse interface

```typescript
export interface ScraperResponse {
  success: boolean;
  song_title: string;
  artist: string;
  key: string;
  capo?: string | number;  // <-- Add optional capo field
  error?: string;
  lines: {
    section: string;
    chords: string[];
    chord_positions: number[];
    lyrics: string | null;
  }[];
}
```

#### ProcessedSong Interface:
Add capo field to the ProcessedSong interface

```typescript
export interface ProcessedSong {
  title: string;
  artist: string;
  key: string;
  capo?: string | number;  // <-- Add optional capo field
  sections: Section[];
  currentSectionIndex: number;
  currentLineIndex: number;
}
```

#### Update processSongData function:
Modify the processSongData function to include capo information

```typescript
export function processSongData(rawData: ScraperResponse): ProcessedSong {
  // Existing code...
  
  return {
    title: rawData.song_title,
    artist: rawData.artist,
    key: rawData.key,
    capo: rawData.capo,  // <-- Add capo information
    sections: sections,
    currentSectionIndex: 0,
    currentLineIndex: 0
  };
}
```

### 3. Display Updates (`index.ts`)
Modify the `updateChordDisplay` method to include capo information in the display output.

```typescript
// In updateChordDisplay method (around line 516)
session.layouts.showTextWall(
  `${this.currentSong.title} - Key of ${this.currentSong.key}` + 
  `${this.currentSong.capo ? ' - Capo: ' + this.currentSong.capo : ''}` + '\n' +  '\n' +
  topContent + '\n' + displayLine.chordLine + '\n' + displayLine.lyricLine
);

// Also update console logging
console.log('Currently displaying:');
console.log(`Title: ${this.currentSong.title} - Key of ${this.currentSong.key}${this.currentSong.capo ? ' - Capo: ' + this.currentSong.capo : ''}`);
```

## Testing Plan
1. Test with songs known to have capo information (e.g., "Feathered Indians" by Tyler Childers - Capo: 5th fret)
2. Test with songs without capo information to ensure they display correctly without errors
3. Verify the capo information appears correctly in the UI

## Future Enhancements
- Format capo display more elegantly (e.g., "Capo: 5" → "Capo: 5th fret")
- Add capo information to the DEFAULT_SONG object if appropriate
- Consider adding capo information to the navigation bar display 