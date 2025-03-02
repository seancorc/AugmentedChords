# Smart Glasses Chord-Lyric Display Implementation Plan

This document outlines the implementation plan for displaying chord charts with lyrics on AugmentOS smart glasses.

## 1. Data Extraction Strategy

### Using Existing Scraper
- Leverage the working `fetch_chords_lyrics_scraper.py` for data extraction
- This script already successfully extracts:
  - Chords with their positions
  - Lyrics for each line
  - Section markers (Verse, Chorus, etc.)

### Integration Approach
- Keep the Python scraper focused only on data extraction
- Move post-processing logic to TypeScript for direct integration with the app
- Create a dedicated utils module in TypeScript to handle all smart glasses-specific processing

## 2. Data Structure

### Current JSON Schema from Scraper
```json
{
  "success": true,
  "song_title": "Stairway to Heaven",
  "artist": "Led Zeppelin",
  "key": "Am",
  "lines": [
    {
      "section": "Intro",
      "chords": ["Am", "Cmaj7/G#", "C/G", "D/F#"],
      "chord_positions": [0, 5, 13, 19],
      "lyrics": null
    },
    {
      "section": "Verse",
      "chords": ["Fmaj7", "Am", "Cmaj7/G#", "C/G", "D/F#"],
      "chord_positions": [0, 12, 20, 38, 46],
      "lyrics": "There's a lady who's sure all that glitters is gold"
    }
  ]
}
```

### TypeScript Interfaces
- Define clear TypeScript interfaces for the data structures
- Create interfaces for raw scraper data, processed song data, and display components
- Organize data into sections and lines for better navigation

## 3. TypeScript Processing Pipeline

### Line Breaking Logic
- Implement line-breaking logic in TypeScript for lyrics longer than display capacity (~50 chars)
- Ensure we break at word boundaries, not mid-word
- When breaking lines, recalculate chord positions for each segment
- Process all lines into display-ready chunks before sending to glasses

### Chunking Algorithm
1. Take each lyric line and its associated chords
2. If line length > max display chars (~50):
   - Find the nearest word boundary before the cutoff
   - Split the line there
   - Recalculate which chords belong to each chunk
   - Adjust chord positions for each chunk
3. Store the resulting chunks in sequence

### Chord Spacing Algorithm
- Create an algorithm to evenly space chords when no lyrics exist
- Ensure chord spacing is proportional to their relative positions when lyrics exist
- Handle complex chord naming (e.g., Cmaj7/G#) properly in the spacing algorithm

## 4. Display Implementation

### Rendering Engine
- Use `session.layouts` methods to render each line
- Create a consistent two-line display format:
  - Top line: Chords with proper positioning
  - Bottom line: Lyrics or "<no lyrics>" placeholder if lyrics are null
- Include section marker (Intro, Verse, etc.) when a new section begins

### Display Format Examples

For instrumental sections:
```
[Intro]
Am    Cmaj7/G#    C/G    D/F#
<no lyrics>
```

For vocal sections:
```
[Verse]
Fmaj7      Am        Cmaj7/G#
There's a lady who's sure all that...
```

### Text Formatting
- Use a fixed-width (monospace) font for predictable character spacing
- Make chords visually distinct (bold, different color, or highlight)
- Ensure sufficient contrast for readability on glasses display
- Consider edge cases like very long chord names or crowded chord sections

## 5. Navigation System

### State Management
- Maintain a "current position" object in TypeScript to track where the user is in the song
- Track both section index and line index within the section
- Break down all lyric/chord lines into display-sized chunks during initial processing
- Map each chunk to its position in the overall song structure

### Navigation Controls
- Right arrow: advance to next line chunk
- Left arrow: go back to previous line chunk
- Consider voice commands for section jumping ("go to chorus")
- End-of-song handling (loop or stop)

## 6. Integration with Current App

### Code Integration Points
- Update `fetchSongChords` method to call our working Python scraper
- Create a new `utils.ts` module for all processing functions
- Implement TypeScript functions for:
  - Processing raw scraper data into display-ready chunks
  - Formatting lines for display
  - Handling navigation between sections and lines
  - Managing the song state

### State Tracking Enhancements
- Track current section and line within that section
- Maintain backward/forward navigation history
- Add support for section jumping

## 7. Testing & Edge Cases

### Key Challenges to Address
- Songs with rapidly changing chords (chord density)
- Songs with unusual formatting (very long lines, no clear sections)
- Instrumental sections with complex chord progressions
- Non-standard chord notations or alternate tunings
- Ensuring chord-to-lyric alignment stays correct after breaking lines

### Quality Metrics
- Accuracy of chord placement relative to lyrics
- Readability on smart glasses display
- Navigation intuitiveness
- Processing speed from request to display

## 8. Implementation Phases

### Phase 1: TypeScript Utils Module
- Create the utils.ts module with interfaces and core processing functions
- Implement functions for transforming scraper data into display-ready format
- Develop line chunking and chord positioning logic

### Phase 2: Display Integration
- Modify index.ts to use the new utils module
- Update fetchSongChords to parse and process data from the Python scraper
- Implement the two-line display format
- Test the display formatting with various song examples

### Phase 3: Navigation & State Management
- Implement section and line-based navigation
- Add state tracking for current position in the song
- Create helper functions for next/previous navigation
- Add section identification and jumping capability

### Phase 4: Final Integration & Polish
- Connect all components into the main application
- Test with a variety of songs for edge cases
- Optimize for performance and readability
- Add any additional user experience enhancements 