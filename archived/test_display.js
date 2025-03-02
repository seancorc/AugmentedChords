const fs = require('fs');

// Simulate the findWordBreakPoint function from utils.ts
function findWordBreakPoint(text, maxLength) {
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
 * Helper function to split instrumental lines (no lyrics) into multiple chunks
 */
function splitInstrumentalLine(line, maxLength = 50) {
  const chunks = [];
  
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
  let currentChunkChords = [];
  let currentChunkPositions = [];
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
        lyrics: null,
        section: line.section
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
      lyrics: null,
      section: line.section
    });
  }
  
  return chunks;
}

// Simulate the chunkLine function from utils.ts
function chunkLine(line, maxLength = 50) {
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
  const chunks = [];
  
  // First, find the best break point for lyrics
  let lyricBreakPoint = maxLength;
  if (line.lyrics.length > maxLength) {
    lyricBreakPoint = findWordBreakPoint(line.lyrics, maxLength);
  }
  
  // Create first chunk with chords up to the break point
  const firstChunkChords = [];
  const firstChunkPositions = [];
  
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
    lyrics: line.lyrics.substring(0, lyricBreakPoint),
    section: line.section // Preserve section
  });
  
  // Create second chunk with remaining chords and lyrics
  if (lyricBreakPoint < line.lyrics.length || firstChunkChords.length < line.chords.length) {
    const remainingChords = [];
    const remainingPositions = [];
    
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
      lyrics: line.lyrics.substring(lyricBreakPoint).trim(),
      section: line.section // Preserve section
    });
  }
  
  return chunks;
}

// Simulate the formatLineForDisplay function from utils.ts
function formatLineForDisplay(line, isNewSection = false, sectionName) {
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

// Load the Stairway to Heaven data
const songData = JSON.parse(fs.readFileSync('./stw_hvn.json', 'utf8'));

console.log("Testing line chunking and display with new approach...\n");

// Test each line for visual display
songData.lines.forEach((line, index) => {
  // Skip a few to focus on potentially problematic ones
  if (index > 0 && index % 5 !== 0 && index !== 6 && index !== 30 && index !== 0 && index < 30) return;
  
  const maxChordPos = line.chords.length > 0 ? 
    line.chord_positions[line.chord_positions.length - 1] + 
    line.chords[line.chord_positions.length - 1].length : 0;
  
  console.log(`\n=== Original Line ${index + 1} (${line.section}) ===`);
  console.log(`Chords: ${JSON.stringify(line.chords)}`);
  console.log(`Positions: ${JSON.stringify(line.chord_positions)}`);
  console.log(`Lyrics: "${line.lyrics || '<no lyrics>'}"`);
  console.log(`Line lengths - Chords: ${maxChordPos}, Lyrics: ${line.lyrics ? line.lyrics.length : 0}`);
  
  // Process line into chunks if needed
  const chunks = chunkLine(line);
  
  // Display each chunk
  chunks.forEach((chunk, chunkIndex) => {
    console.log(`\n--- Chunk ${chunkIndex + 1} of ${chunks.length} ---`);
    
    // Test display formatting
    const display = formatLineForDisplay(chunk, false, chunk.section);
    
    // Visual representation
    console.log(`Chords: ${display.chordLine}`);
    console.log(`Lyrics: ${display.lyricLine}`);
    
    // Display boundary markers at 50 chars
    const boundaryLine = '-'.repeat(50) + '|' + '-'.repeat(10);
    console.log(boundaryLine);
  });
}); 