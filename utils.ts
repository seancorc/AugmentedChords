/**
 * Utils for processing chord-lyric data for smart glasses display
 */

// Interface for raw data coming from the Python scraper
export interface ScraperResponse {
  success: boolean;
  song_title: string;
  artist: string;
  key: string;
  error?: string; // Add optional error property
  lines: {
    section: string;
    chords: string[];
    chord_positions: number[];
    lyrics: string | null;
  }[];
}

// Interface for a chord-lyric line
export interface ChordLyricLine {
  chords: string[];
  chord_positions: number[];
  lyrics: string | null;
}

// Interface for a song section
export interface Section {
  name: string;
  lines: ChordLyricLine[];
}

// Interface for a processed song ready for display
export interface ProcessedSong {
  title: string;
  artist: string;
  key: string;
  sections: Section[];
  currentSectionIndex: number;
  currentLineIndex: number;
}

// Interface for formatted display
export interface DisplayLine {
  chordLine: string;
  lyricLine: string;
  isNewSection: boolean;
  sectionName: string; // Always include section name, not optional
}

/**
 * Process raw data from the scraper into a structured form for display
 */
export function processSongData(rawData: ScraperResponse): ProcessedSong {
  // Group lines by section
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  // Group by section
  for (const line of rawData.lines) {
    // If section changed or first line
    if (!currentSection || currentSection.name !== line.section) {
      // Add previous section if it exists
      if (currentSection) {
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        name: line.section,
        lines: []
      };
    }
    
    // Add line to current section
    currentSection.lines.push({
      chords: line.chords,
      chord_positions: line.chord_positions,
      lyrics: line.lyrics
    });
  }
  
  // Add the last section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // Process each section to chunk long lines
  const processedSections = sections.map(section => {
    const processedLines: ChordLyricLine[] = [];
    
    for (const line of section.lines) {
      // Process this line into chunks if needed
      const chunks = chunkLine(line);
      processedLines.push(...chunks);
    }
    
    return {
      name: section.name,
      lines: processedLines
    };
  });
  
  return {
    title: rawData.song_title,
    artist: rawData.artist,
    key: rawData.key,
    sections: processedSections,
    currentSectionIndex: 0,
    currentLineIndex: 0
  };
}

/**
 * Process long lines into chunks for display constraints
 */
export function chunkLine(line: ChordLyricLine, maxLength: number = 42): ChordLyricLine[] {
  // Get the total length needed for the chord line
  let maxChordPos = 0;
  if (line.chords.length > 0 && line.chord_positions.length > 0) {
    const lastIdx = line.chord_positions.length - 1;
    maxChordPos = line.chord_positions[lastIdx] + line.chords[lastIdx].length;
  }
  
  // Calculate total line length
  const totalLength = Math.max(maxChordPos, line.lyrics ? line.lyrics.length : 0);
  
  // If the line fits within the limit, return it unchanged
  if (totalLength <= maxLength) {
    return [line];
  }
  
  // Handle instrumental lines (no lyrics)
  if (!line.lyrics) {
    return splitInstrumentalLine(line, maxLength);
  }
  
  // Now we need to split this line into multiple chunks
  const chunks: ChordLyricLine[] = [];
  
  // First, find the best break point for lyrics
  let lyricBreakPoint = maxLength;
  if (line.lyrics.length > maxLength) {
    lyricBreakPoint = findWordBreakPoint(line.lyrics, maxLength);
  }
  
  // Create first chunk with chords up to the break point
  const firstChunkChords: string[] = [];
  const firstChunkPositions: number[] = [];
  
  for (let i = 0; i < line.chords.length; i++) {
    const pos = line.chord_positions[i];
    if (pos < lyricBreakPoint) {
      firstChunkChords.push(line.chords[i]);
      firstChunkPositions.push(pos);
    } else {
      // This chord will go to the next chunk
      break;
    }
  }
  
  // Add first chunk
  chunks.push({
    chords: firstChunkChords,
    chord_positions: firstChunkPositions,
    lyrics: line.lyrics.substring(0, lyricBreakPoint)
  });
  
  // Create second chunk with remaining chords and lyrics
  if (lyricBreakPoint < line.lyrics.length || firstChunkChords.length < line.chords.length) {
    const remainingChords: string[] = [];
    const remainingPositions: number[] = [];
    
    // Add the remaining chords, adjusting positions to account for the removed part
    for (let i = 0; i < line.chords.length; i++) {
      const pos = line.chord_positions[i];
      if (pos >= lyricBreakPoint) {
        remainingChords.push(line.chords[i]);
        // Adjust position to account for lyricBreakPoint
        remainingPositions.push(pos - lyricBreakPoint);
      }
    }
    
    // Add second chunk with remaining lyrics
    chunks.push({
      chords: remainingChords,
      chord_positions: remainingPositions,
      lyrics: line.lyrics.substring(lyricBreakPoint).trim()
    });
  }
  
  return chunks;
}

/**
 * Helper function to split instrumental lines (no lyrics) into multiple chunks
 */
function splitInstrumentalLine(line: ChordLyricLine, maxLength: number = 50): ChordLyricLine[] {
  const chunks: ChordLyricLine[] = [];
  
  // If it's relatively short, just return the original line
  let maxChordPos = 0;
  if (line.chords.length > 0 && line.chord_positions.length > 0) {
    const lastIdx = line.chord_positions.length - 1;
    maxChordPos = line.chord_positions[lastIdx] + line.chords[lastIdx].length;
  }
  
  if (maxChordPos <= maxLength) {
    return [line];
  }
  
  // We need to split this instrumental line
  let currentChunkChords: string[] = [];
  let currentChunkPositions: number[] = [];
  let currentLength = 0;
  
  for (let i = 0; i < line.chords.length; i++) {
    const chord = line.chords[i];
    const originalPos = line.chord_positions[i];
    
    // Calculate the position in the current chunk
    // For the first chord in the chunk, start at position 0
    let pos = currentChunkChords.length === 0 ? 0 : originalPos - currentLength;
    
    // Check if adding this chord would exceed the maxLength
    if (pos + chord.length > maxLength && currentChunkChords.length > 0) {
      // Add the current chunk to our list of chunks
      chunks.push({
        chords: currentChunkChords,
        chord_positions: currentChunkPositions,
        lyrics: null
      });
      
      // Reset for a new chunk
      currentChunkChords = [chord];
      currentChunkPositions = [0]; // Start the new chunk at position 0
      currentLength = originalPos; // Update the running length
    } else {
      // Add the chord to the current chunk
      currentChunkChords.push(chord);
      currentChunkPositions.push(pos);
      
      // If this is the first chord in the chunk, update the running length
      if (currentChunkChords.length === 1) {
        currentLength = originalPos;
      }
    }
  }
  
  // Add the last chunk if there are any remaining chords
  if (currentChunkChords.length > 0) {
    chunks.push({
      chords: currentChunkChords,
      chord_positions: currentChunkPositions,
      lyrics: null
    });
  }
  
  return chunks;
}

/**
 * Helper function to find the best breaking point at a word boundary
 */
function findWordBreakPoint(text: string, maxLength: number): number {
  if (text.length <= maxLength) {
    return text.length;
  }
  
  // Try to find a space before maxLength
  let breakPoint = maxLength;
  
  // If we're in the middle of a word, look backward to find the last space
  while (breakPoint > 0 && text[breakPoint] !== ' ') {
    breakPoint--;
  }
  
  // If we found a space, break at the space (not after it)
  if (breakPoint > 0 && text[breakPoint] === ' ') {
    return breakPoint;
  }
  
  // If we couldn't find a space (first word is too long), 
  // break at maxLength as a fallback
  return maxLength;
}

/**
 * Format a line for display (chords above, lyrics below)
 */
export function formatLineForDisplay(line: ChordLyricLine, isNewSection: boolean = false, sectionName: string): DisplayLine {
  // Format chord line
  let chordLine = '';
  
  if (line.chords.length > 0) {
    // Create string of spaces with chords at the right positions
    let lastChordPos = 0;
    let lastChordLength = 0;
    
    if (line.chord_positions.length > 0) {
      const lastIndex = line.chord_positions.length - 1;
      lastChordPos = line.chord_positions[lastIndex];
      lastChordLength = line.chords[lastIndex].length;
    }
    
    // Ensure the string is long enough to hold all chords
    const totalLength = lastChordPos + lastChordLength;
    chordLine = ' '.repeat(totalLength);
    
    // Place each chord at its position
    for (let i = 0; i < line.chords.length; i++) {
      const pos = line.chord_positions[i];
      const chord = line.chords[i];
      
      // Replace spaces at the chord position
      const before = chordLine.substring(0, pos);
      const after = chordLine.substring(pos + chord.length);
      chordLine = before + chord + after;
    }
  }
  
  // Format lyric line
  const lyricLine = line.lyrics || "<no lyrics>";
  
  return {
    chordLine: chordLine.trimRight(), // Remove trailing spaces
    lyricLine: lyricLine,
    isNewSection,
    sectionName
  };
}

/**
 * Navigate to next line
 */
export function navigateNext(song: ProcessedSong): ProcessedSong {
  const newSong = { ...song };
  
  // Move to next line if possible
  if (newSong.currentLineIndex < newSong.sections[newSong.currentSectionIndex].lines.length - 1) {
    newSong.currentLineIndex++;
  } 
  // Otherwise move to next section
  else if (newSong.currentSectionIndex < newSong.sections.length - 1) {
    newSong.currentSectionIndex++;
    newSong.currentLineIndex = 0;
  }
  // Otherwise wrap around to beginning
  else {
    newSong.currentSectionIndex = 0;
    newSong.currentLineIndex = 0;
  }
  
  return newSong;
}

/**
 * Navigate to previous line
 */
export function navigatePrevious(song: ProcessedSong): ProcessedSong {
  const newSong = { ...song };
  
  // Move to previous line if possible
  if (newSong.currentLineIndex > 0) {
    newSong.currentLineIndex--;
  } 
  // Otherwise move to previous section
  else if (newSong.currentSectionIndex > 0) {
    newSong.currentSectionIndex--;
    // Go to last line of previous section
    newSong.currentLineIndex = newSong.sections[newSong.currentSectionIndex].lines.length - 1;
  }
  // Otherwise wrap to end
  else {
    newSong.currentSectionIndex = newSong.sections.length - 1;
    newSong.currentLineIndex = newSong.sections[newSong.currentSectionIndex].lines.length - 1;
  }
  
  return newSong;
}

/**
 * Get the current line for display
 */
export function getCurrentLine(song: ProcessedSong): DisplayLine {
  const section = song.sections[song.currentSectionIndex];
  const line = section.lines[song.currentLineIndex];
  
  // Check if this is the first line of the section
  const isNewSection = song.currentLineIndex === 0;
  
  // Always pass the section name, not just for new sections
  return formatLineForDisplay(line, isNewSection, section.name);
}

/**
 * Get navigation information
 */
export function getNavigationInfo(song: ProcessedSong): string {
  const currentSection = song.sections[song.currentSectionIndex];
  
  // Calculate overall progress through the song
  let totalLinesInSong = 0;
  let currentLineOverall = 0;
  
  // Count total lines in the song
  for (let i = 0; i < song.sections.length; i++) {
    const section = song.sections[i];
    
    // Add current section's line count
    if (i < song.currentSectionIndex) {
      // For previous sections, add all their lines to the current overall position
      currentLineOverall += section.lines.length;
    } else if (i === song.currentSectionIndex) {
      // For current section, add only up to current line index
      currentLineOverall += song.currentLineIndex + 1;
    }
    
    // Add all lines to the total
    totalLinesInSong += section.lines.length;
  }
  
  // Simplified format: (current/total)
  return `(${currentLineOverall}/${totalLinesInSong})`;
}

/**
 * Jump to a specific section by name
 */
export function jumpToSection(song: ProcessedSong, sectionName: string): ProcessedSong {
  const newSong = { ...song };
  
  // Find section with matching name (case-insensitive)
  const targetName = sectionName.toLowerCase();
  const sectionIndex = newSong.sections.findIndex(
    section => section.name.toLowerCase().includes(targetName)
  );
  
  if (sectionIndex !== -1) {
    newSong.currentSectionIndex = sectionIndex;
    newSong.currentLineIndex = 0;
  }
  
  return newSong;
} 