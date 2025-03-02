# Intro Repeat Indicator Implementation Plan

## Overview
This document outlines the plan for implementing the display of repeat indicators (e.g., "x2", "x4") that appear after chord sequences in Ultimate Guitar tabs. This is particularly important for instrumental sections like Intros where a chord sequence might need to be repeated a specific number of times.

## Components to Modify

### 1. Python Scraper (`fetch_chords_lyrics_scraper.py`)
The scraper needs to be modified to recognize and extract repeat indicators like "x2" from chord sequences, especially in instrumental sections.

#### Implementation Steps:
1. Update the `process_intro_section` function to look for and extract repeat indicators
2. Add a similar capability to the `process_regular_section` function
3. Add the repeat information to the line object in the JSON response

```python
def process_intro_section(section_lines, section_pattern, chord_pattern, lines):
    """Process an intro section which often has a special format."""
    logger.info("Processing Intro section with special handling")
    
    for line in section_lines:
        line = line.strip()
        
        # Skip empty lines and the section marker itself
        if not line or re.search(section_pattern, line):
            continue
        
        # Check if this is a line with chord markers
        if '[ch]' in line:
            # Extract all chords from the line
            chords = re.findall(chord_pattern, line)
            
            if chords:
                # Check for repeat indicators after the chords (like "x2", "x4")
                repeat_info = None
                # Look for patterns like "x2", "x4" etc. after the chord sequence
                repeat_match = re.search(r'\s*(x\d+)', line.split('[/ch]')[-1])
                if repeat_match:
                    repeat_info = repeat_match.group(1)
                
                # Calculate positions - for bar-formatted intro lines, use evenly spaced positions
                chord_positions = [i * 10 for i in range(len(chords))]  # Evenly space chords
                
                # Add the intro chord line with repeat info
                lines.append({
                    "section": "Intro",
                    "chords": chords,
                    "chord_positions": chord_positions,
                    "lyrics": None,  # Intro is typically instrumental
                    "repeat_info": repeat_info  # <-- Add repeat information
                })
                logger.info(f"Added Intro line with chords: {chords}" + 
                           (f" and repeat info: {repeat_info}" if repeat_info else ""))
```

### 2. TypeScript Interface Updates (`utils.ts`)

#### ScraperResponse Interface:
Add an optional repeat_info field to the line objects in the ScraperResponse interface

```typescript
export interface ScraperResponse {
  success: boolean;
  song_title: string;
  artist: string;
  key: string;
  error?: string;
  lines: {
    section: string;
    chords: string[];
    chord_positions: number[];
    lyrics: string | null;
    repeat_info?: string;  // <-- Add optional repeat_info field
  }[];
}
```

#### ChordLyricLine Interface:
Add repeat_info to the ChordLyricLine interface

```typescript
export interface ChordLyricLine {
  chords: string[];
  chord_positions: number[];
  lyrics: string | null;
  repeat_info?: string;  // <-- Add optional repeat_info field
}
```

#### Update processSongData function:
Modify the processSongData function to include repeat information in the processed song data

```typescript
export function processSongData(rawData: ScraperResponse): ProcessedSong {
  const sections: Section[] = [];
  let currentSection: Section | null = null;
  
  // Process each line from the raw data
  rawData.lines.forEach(line => {
    // If this is a new section, or the first line
    if (!currentSection || currentSection.name !== line.section) {
      // If we already have a section, add it to our sections array
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Create a new section
      currentSection = {
        name: line.section,
        lines: []
      };
    }
    
    // Add this line to the current section
    currentSection.lines.push({
      chords: line.chords,
      chord_positions: line.chord_positions,
      lyrics: line.lyrics,
      repeat_info: line.repeat_info  // <-- Include repeat_info
    });
  });
  
  // Add the last section if it exists
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // Return the processed song data
  return {
    title: rawData.song_title,
    artist: rawData.artist,
    key: rawData.key,
    sections: sections,
    currentSectionIndex: 0,
    currentLineIndex: 0
  };
}
```

### 3. Update formatLineForDisplay function (utils.ts)
Modify the formatLineForDisplay function to include repeat information in the display

```typescript
export function formatLineForDisplay(line: ChordLyricLine, isNewSection: boolean = false, sectionName: string): DisplayLine {
  let chordLine = "";
  let lyricLine = "";

  // Get the max chord position, plus the length of the last chord
  const lastChordIndex = line.chord_positions.length - 1;
  const maxPos = lastChordIndex >= 0 
    ? line.chord_positions[lastChordIndex] + line.chords[lastChordIndex].length
    : 0;

  // If it's just a chord line with no lyrics (common in intros/outros)
  if (!line.lyrics) {
    // Create a chord-only line with proper spacing
    for (let i = 0; i < line.chords.length; i++) {
      const pos = line.chord_positions[i];
      const chord = line.chords[i];
      
      // Fill in any spaces needed before this chord
      while (chordLine.length < pos) {
        chordLine += " ";
      }
      
      // Add the chord
      chordLine += chord;
    }
    
    // Add repeat information if present (like "x2")
    if (line.repeat_info) {
      chordLine += " " + line.repeat_info;
    }
    
    // For lyrics, just use a blank line
    lyricLine = "";
  } else {
    // Create a line with both chords and lyrics...
    // [existing chord/lyric formatting code]
    
    // Add repeat information to chord line if present
    if (line.repeat_info && !line.lyrics) {
      chordLine += " " + line.repeat_info;
    }
  }

  return {
    chordLine,
    lyricLine,
    isNewSection,
    sectionName
  };
}
```

## Testing Plan
1. Test with songs that have repeat indicators in intro sections (e.g., chord sequence followed by "x2")
2. Verify that the repeat indicators are correctly captured and displayed
3. Test with songs that don't have repeat indicators to ensure they display correctly
4. Test with more complex cases like multiple repeat indicators in different sections

## Future Enhancements
- Highlight or format the repeat indicators differently for better visibility
- Add support for more complex repeat notations (e.g., "x2-4" for play 2-4 times)
- Consider adding a setting to have the app automatically repeat sections based on repeat indicators
- Add visual cues (e.g., guitar tab notation for repeats like |: :|) 