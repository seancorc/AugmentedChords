const fs = require('fs');

// Import the critical functions from utils.ts (copied since we can't import TypeScript directly)
function findWordBreakPoint(text, maxLength = 50) {
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
  
  // If there's no space in the first maxLength characters
  // (unlikely for lyrics but possible), try breaking at a 
  // hyphen or other punctuation
  breakPoint = maxLength;
  while (breakPoint > maxLength/2 && 
         text[breakPoint] !== ' ' && 
         text[breakPoint] !== '-' && 
         text[breakPoint] !== ',' && 
         text[breakPoint] !== '.') {
    breakPoint--;
  }
  
  // If we found a suitable punctuation, break after it
  if (breakPoint > maxLength/2 && 
      (text[breakPoint] === '-' || 
       text[breakPoint] === ',' || 
       text[breakPoint] === '.')) {
    return breakPoint + 1;
  }
  
  // If we still couldn't find a good break point,
  // break at the maxLength as a fallback
  return maxLength > text.length ? text.length : maxLength;
}

// Improved version of the chunkLine function
function chunkLine(line, maxLength = 50) {
  // Get the total length needed for the chord line
  let maxChordPos = 0;
  if (line.chords.length > 0 && line.chord_positions.length > 0) {
    const lastIdx = line.chord_positions.length - 1;
    maxChordPos = line.chord_positions[lastIdx] + line.chords[lastIdx].length;
  }
  
  // If no lyrics, return as is
  if (!line.lyrics) {
    return [line];
  }
  
  // Create a safety margin to prevent cutting off words at exactly 50 chars
  // Use a smaller limit for the first chunk to ensure we don't cut words at the edge
  const safeMaxLength = maxLength - 1;
  
  // If line is short enough, return as is
  if (line.lyrics.length <= safeMaxLength && maxChordPos <= maxLength) {
    return [line];
  }
  
  const chunks = [];
  
  // Handle the case where we need to split the line
  if (line.lyrics.length > safeMaxLength) {
    // For long lyrics, break at word boundaries
    let remaining = line.lyrics;
    
    // Find a good break point that doesn't cut words
    let breakPoint = findWordBreakPoint(remaining, safeMaxLength);
    
    console.log(`[DEBUG] Original lyrics: "${line.lyrics}" (${line.lyrics.length} chars)`);
    console.log(`[DEBUG] Breaking at position ${breakPoint}: "${remaining.substring(0, breakPoint)}"`);
    
    // First chunk gets the chords and first part of lyrics
    chunks.push({
      chords: line.chords,
      chord_positions: line.chord_positions,
      lyrics: remaining.substring(0, breakPoint)
    });
    
    // Additional chunks if needed - skip the space character
    if (breakPoint < remaining.length && remaining[breakPoint] === ' ') {
      remaining = remaining.substring(breakPoint + 1);
    } else {
      remaining = remaining.substring(breakPoint);
    }
    
    console.log(`[DEBUG] Remaining: "${remaining}"`);
    
    // Continue chunking any remaining text
    while (remaining.length > 0) {
      breakPoint = findWordBreakPoint(remaining, maxLength);
      
      console.log(`[DEBUG] Next break at position ${breakPoint}: "${remaining.substring(0, breakPoint)}"`);
      
      chunks.push({
        chords: [], // No chords for continuation lines
        chord_positions: [],
        lyrics: remaining.substring(0, breakPoint)
      });
      
      // Skip the space character
      if (breakPoint < remaining.length && remaining[breakPoint] === ' ') {
        remaining = remaining.substring(breakPoint + 1);
      } else {
        remaining = remaining.substring(breakPoint);
      }
      
      console.log(`[DEBUG] After chunk, remaining: "${remaining}"`);
    }
  } else {
    // Line fits within the limit but chords might extend beyond
    chunks.push(line);
  }
  
  return chunks;
}

// Load the Stairway to Heaven data
const songData = JSON.parse(fs.readFileSync('./stw_hvn.json', 'utf8'));

console.log("Analyzing lines that might exceed 50 characters using improved chunking...\n");

// Check each line for potential issues
songData.lines.forEach((line, index) => {
  if (!line.lyrics) return; // Skip instrumental lines
  
  const maxChordPos = line.chords.length > 0 ? 
    line.chord_positions[line.chord_positions.length - 1] + 
    line.chords[line.chord_positions.length - 1].length : 0;
  
  // Look for lines where either lyrics or chord positions exceed or are close to 50 chars
  if (line.lyrics.length >= 45 || maxChordPos >= 45) {
    console.log(`\n=== Line ${index + 1} (${line.section}) ===`);
    console.log(`Lyrics: "${line.lyrics}" (${line.lyrics.length} chars)`);
    console.log(`Last chord position: ${maxChordPos}`);
    
    // Test the improved chunking
    const chunks = chunkLine(line);
    console.log(`Chunks produced: ${chunks.length}`);
    
    chunks.forEach((chunk, i) => {
      console.log(`Chunk ${i+1}:`);
      console.log(`  Chords: ${JSON.stringify(chunk.chords)}`);
      console.log(`  Lyrics: "${chunk.lyrics}"`);
    });
  }
}); 