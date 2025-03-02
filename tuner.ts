/**
 * Tuner Feature - Core functionality for pitch detection and tuner mode
 * This module handles the audio processing, note detection, and display formatting
 * for the AugmentedChords guitar tuner feature.
 */

import { TpaSession } from '@augmentos/sdk';

// Standard note frequencies (A4 = 440Hz standard tuning)
const NOTE_FREQUENCIES: Record<string, number> = {
  'E2': 82.41,  // Low E (6th string)
  'A2': 110.00, // A (5th string)
  'D3': 146.83, // D (4th string)
  'G3': 196.00, // G (3rd string)
  'B3': 246.94, // B (2nd string)
  'E4': 329.63  // High E (1st string)
};

// All note names in chromatic order
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Audio processing constants
const SAMPLE_RATE = 16000; // Fixed sample rate for AugmentOS audio
const MIN_FREQUENCY = 70;  // Below E2 (lowest guitar string)
const MAX_FREQUENCY = 350; // Above E4 (highest guitar string)

// Interface for tuner state
export interface TunerState {
  isActive: boolean;
  targetNote: string;
  detectedNote: string | null;
  detectedFrequency: number | null;
  deviation: number | null; // in cents
}

/**
 * Initialize the tuner state with default values
 */
export function initTunerState(): TunerState {
  return {
    isActive: false,
    targetNote: 'E',
    detectedNote: null,
    detectedFrequency: null,
    deviation: null
  };
}

/**
 * Process audio data to detect pitch using autocorrelation
 * @param audioData PCM audio data
 * @param sampleRate The actual sample rate of the audio data
 * @returns The detected frequency or null if no clear pitch is detected
 */
export function detectPitch(audioData: Float32Array, sampleRate: number): number | null {
  // Check if there's enough signal to analyze
  const signalStrength = calculateSignalStrength(audioData);
  
  if (signalStrength < 0.01) {
    // Too quiet, no pitch detected
    return null;
  }
  
  console.log(`[PITCH DETECTION] Signal strength: ${signalStrength.toFixed(4)}, Sample rate: ${sampleRate}Hz`);
  
  // Apply a window function to reduce spectral leakage
  const windowedData = applyHammingWindow(audioData);
  
  // Calculate autocorrelation
  const autocorrelation = calculateAutocorrelation(windowedData);
  
  // Find multiple peaks to analyze and filter harmonics
  const peaks = findMultiplePeaks(autocorrelation, sampleRate);
  
  if (peaks.length === 0) {
    console.log(`[PITCH DETECTION] No clear peaks found`);
    return null; // No clear peaks found
  }
  
  // Choose the most likely fundamental frequency by analyzing the peak patterns
  const bestFrequency = selectFundamentalFrequency(peaks, sampleRate);
  
  if (bestFrequency === null) {
    console.log(`[PITCH DETECTION] Could not identify fundamental frequency`);
    return null;
  }
  
  console.log(`[PITCH DETECTION] Selected fundamental frequency: ${bestFrequency.toFixed(2)} Hz`);
  
  // Only return frequency if it's in a reasonable range for guitar
  if (bestFrequency >= MIN_FREQUENCY && bestFrequency <= MAX_FREQUENCY) {
    return bestFrequency;
  }
  
  console.log(`[PITCH DETECTION] Frequency out of range: ${bestFrequency.toFixed(2)} Hz (min: ${MIN_FREQUENCY}, max: ${MAX_FREQUENCY})`);
  return null;
}

/**
 * Apply a Hamming window to the audio data to reduce spectral leakage
 * @param audioData The raw audio data
 * @returns Windowed audio data
 */
function applyHammingWindow(audioData: Float32Array): Float32Array {
  const windowedData = new Float32Array(audioData.length);
  
  for (let i = 0; i < audioData.length; i++) {
    // Hamming window formula: 0.54 - 0.46 * cos(2π * i / (N-1))
    const windowValue = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (audioData.length - 1));
    windowedData[i] = audioData[i] * windowValue;
  }
  
  return windowedData;
}

/**
 * Calculate autocorrelation of audio data
 * @param audioData The windowed audio data
 * @returns Autocorrelation array
 */
function calculateAutocorrelation(audioData: Float32Array): Float32Array {
  const length = audioData.length;
  const correlation = new Float32Array(length);
  
  // Calculate autocorrelation
  for (let lag = 0; lag < length; lag++) {
    let sum = 0;
    for (let i = 0; i < length - lag; i++) {
      sum += audioData[i] * audioData[i + lag];
    }
    correlation[lag] = sum / (length - lag);
  }
  
  return correlation;
}

// Peak structure for harmonic analysis
interface Peak {
  index: number;
  frequency: number;
  strength: number; // Normalized strength of the peak
}

/**
 * Find multiple peaks in the autocorrelation to analyze harmonics
 * @param autocorrelation The autocorrelation array
 * @param sampleRate The sample rate of the audio data
 * @returns Array of peak indices and frequencies
 */
function findMultiplePeaks(autocorrelation: Float32Array, sampleRate: number): Peak[] {
  // Minimum lag to consider (convert minimum frequency to lag)
  const minLag = Math.floor(sampleRate / MAX_FREQUENCY);
  // Maximum lag to consider (convert maximum frequency to lag)
  const maxLag = Math.ceil(sampleRate / MIN_FREQUENCY);
  
  // Threshold of the peak relative to the max autocorrelation value
  const PEAK_THRESHOLD = 0.4;
  
  // Skip the first few lag values (they're usually high)
  const startLag = Math.max(5, minLag);
  
  // Find the maximum value for normalization
  let maxVal = 0;
  for (let i = startLag; i < maxLag && i < autocorrelation.length; i++) {
    maxVal = Math.max(maxVal, autocorrelation[i]);
  }
  
  if (maxVal === 0) {
    return [];
  }
  
  // Array to store detected peaks
  const peaks: Peak[] = [];
  
  // Find multiple peaks
  for (let i = startLag; i < maxLag && i < autocorrelation.length - 1; i++) {
    const prevVal = autocorrelation[i-1] / maxVal;
    const currVal = autocorrelation[i] / maxVal;
    const nextVal = autocorrelation[i+1] / maxVal;
    
    // Peak detection: current value is higher than previous and next,
    // and it exceeds the threshold
    if (currVal > PEAK_THRESHOLD && currVal > prevVal && currVal > nextVal) {
      // Convert peak index to frequency
      const frequency = sampleRate / i;
      
      // Store the peak
      peaks.push({
        index: i,
        frequency: frequency,
        strength: currVal
      });
    }
  }
  
  // Sort peaks by strength (highest first)
  peaks.sort((a, b) => b.strength - a.strength);
  
  // For debugging - just log the count and top peaks to reduce verbosity
  if (peaks.length > 0) {
    if (peaks.length > 3) {
      console.log(`[PITCH DETECTION] Found ${peaks.length} peaks. Top 3: ${peaks[0].frequency.toFixed(1)} Hz, ${peaks[1].frequency.toFixed(1)} Hz, ${peaks[2].frequency.toFixed(1)} Hz`);
    } else {
      console.log(`[PITCH DETECTION] Found ${peaks.length} peaks: ${peaks.map(p => p.frequency.toFixed(1)).join(', ')} Hz`);
    }
  }
  
  return peaks;
}

/**
 * Analyze the pattern of peaks to determine the fundamental frequency
 * @param peaks Detected peaks in the autocorrelation
 * @param sampleRate The sample rate of the audio data
 * @returns The most likely fundamental frequency
 */
function selectFundamentalFrequency(peaks: Peak[], sampleRate: number): number | null {
  if (peaks.length === 0) {
    return null;
  }
  
  // Guitar strings expected frequencies
  const expectedFrequencies = Object.values(NOTE_FREQUENCIES);
  
  // Score each peak based on how well it matches expected guitar frequencies
  // and how likely it is to be a fundamental rather than harmonic
  let bestScore = -1;
  let fundamentalFrequency: number | null = null;
  
  for (const peak of peaks) {
    let score = peak.strength * 2; // Base score is peak strength
    
    const freq = peak.frequency;
    
    // Boost score for frequencies close to standard guitar notes
    for (const expected of expectedFrequencies) {
      const ratio = freq / expected;
      
      // If very close to an expected guitar frequency
      if (Math.abs(ratio - 1) < 0.05) {
        score += 1.0;
        break;
      }
    }
    
    // Lower frequencies are more likely to be the fundamental
    // (This helps avoid selecting harmonics as the fundamental)
    score += (MAX_FREQUENCY - freq) / MAX_FREQUENCY;
    
    // Check if this frequency could be a harmonic of lower frequencies
    // (If a strong peak is found at half this frequency, this is likely a harmonic)
    let isLikelyHarmonic = false;
    
    // Look for potential fundamental frequencies (at approximately half, third or quarter of this frequency)
    const harmonicDivisors = [2, 3, 4];
    
    for (const divisor of harmonicDivisors) {
      const potentialFundamental = freq / divisor;
      
      // Skip if potential fundamental is below our valid range
      if (potentialFundamental < MIN_FREQUENCY) {
        continue;
      }
      
      // Check if we have a strong peak near this potential fundamental
      for (const otherPeak of peaks) {
        const ratio = otherPeak.frequency / potentialFundamental;
        
        if (Math.abs(ratio - 1) < 0.05 && otherPeak.strength > peak.strength * 0.6) {
          isLikelyHarmonic = true;
          score -= 0.5; // Penalize this frequency if it's likely a harmonic
          break;
        }
      }
    }
    
    if (!isLikelyHarmonic) {
      // Boost score for frequencies in the range of guitar's lowest strings
      // This helps focus on the fundamental of low E and A strings
      if (freq >= 80 && freq <= 115) {
        score += 0.5;
      }
    }
    
    // Log only the top frequencies to reduce verbosity
    if (freq === peaks[0].frequency || score > bestScore) {
      console.log(`[PITCH DETECTION] Frequency ${freq.toFixed(1)} Hz has score ${score.toFixed(1)}`);
    }
    
    if (score > bestScore) {
      bestScore = score;
      fundamentalFrequency = freq;
    }
  }
  
  return fundamentalFrequency;
}

/**
 * Calculate the signal strength from audio data
 * @param audioData PCM audio data
 * @returns Signal strength value between 0 and 1
 */
function calculateSignalStrength(audioData: Float32Array): number {
  // Calculate RMS (Root Mean Square) amplitude
  let sum = 0;
  for (let i = 0; i < audioData.length; i++) {
    sum += audioData[i] * audioData[i];
  }
  const rms = Math.sqrt(sum / audioData.length);
  
  // Normalize to a 0-1 scale with some reasonable thresholds
  // These values might need adjustment based on actual audio input levels
  return Math.min(1, Math.max(0, rms / 0.1));
}

/**
 * Convert a frequency to the nearest musical note
 * @param frequency The frequency in Hz
 * @returns The musical note name
 */
export function frequencyToNote(frequency: number): string {
  // A4 = 440Hz is our reference
  const A4 = 440.0;
  
  // Calculate how many half steps away from A4 this frequency is
  const halfStepFromA4 = Math.round(12 * Math.log2(frequency / A4));
  
  // Calculate the octave (A4 is in octave 4)
  const octave = 4 + Math.floor((halfStepFromA4 + 9) / 12);
  
  // Get the note name (0 = C, 1 = C#, etc.)
  const noteIndex = (halfStepFromA4 + 9) % 12;
  if (noteIndex < 0) {
    const noteName = NOTE_NAMES[noteIndex + 12] + octave;
    console.log(`[NOTE DETECTION] Frequency: ${frequency.toFixed(2)} Hz maps to ${noteName} (${halfStepFromA4} half steps from A4)`);
    return noteName;
  }
  const noteName = NOTE_NAMES[noteIndex] + octave;
  console.log(`[NOTE DETECTION] Frequency: ${frequency.toFixed(2)} Hz maps to ${noteName} (${halfStepFromA4} half steps from A4)`);
  return noteName;
}

/**
 * Calculate cents deviation from target frequency
 * @param detectedFreq The detected frequency
 * @param targetFreq The target frequency
 * @returns Deviation in cents (100 cents = 1 semitone)
 */
export function calculateCentsDeviation(detectedFreq: number, targetFreq: number): number {
  return Math.round(1200 * Math.log2(detectedFreq / targetFreq));
}

/**
 * Find the closest guitar note to the given frequency
 * @param frequency The frequency to match to a guitar note
 * @returns The closest guitar note (E, A, D, G, B, E)
 */
export function findClosestGuitarNote(frequency: number): string {
  console.log(`[GUITAR NOTE] Finding closest guitar note to ${frequency.toFixed(1)} Hz`);
  
  // Search through our predefined frequencies
  let closestNote = "";
  let smallestDifference = Infinity;
  let smallestDifferenceInCents = Infinity;
  
  // Store the closest matches for logging
  const matches: {note: string, freq: number, diff: number, cents: number}[] = [];
  
  // When detecting guitar notes, we want to prioritize the fundamental guitar frequencies
  // over just the closest note in absolute Hz difference
  for (const [note, noteFreq] of Object.entries(NOTE_FREQUENCIES)) {
    // Calculate the difference in Hz
    const difference = Math.abs(frequency - noteFreq);
    
    // Also calculate difference in cents to get a better measurement
    const centsDeviation = Math.abs(calculateCentsDeviation(frequency, noteFreq));
    
    // Store this match for potential logging
    matches.push({note, freq: noteFreq, diff: difference, cents: centsDeviation});
    
    // Scoring system: 
    // - Prioritize notes that are within 100 cents (1 semitone) of the target
    // - Among those, choose the one with smallest absolute Hz difference
    // - For low E string, be more lenient (important for electric guitars)
    
    // Low E string needs special handling - it's very common and often misdetected
    if (note === 'E2' && difference < 12) {
      // Strongly prioritize low E matches when they're close
      if (difference < smallestDifference * 1.5) {
        smallestDifference = difference;
        smallestDifferenceInCents = centsDeviation;
        closestNote = note.charAt(0); // Just the note name without octave
      }
    } 
    // For other notes, use a more standard distance metric
    else if (difference < smallestDifference) {
      smallestDifference = difference;
      smallestDifferenceInCents = centsDeviation;
      closestNote = note.charAt(0); // Just the note name without octave
    }
  }
  
  // Log only the top 2 closest matches instead of all 6
  matches.sort((a, b) => a.diff - b.diff);
  const topMatches = matches.slice(0, 2);
  
  console.log(`[GUITAR NOTE] Top matches: ${topMatches.map(m => 
    `${m.note}: ${m.freq.toFixed(1)} Hz (diff: ${m.diff.toFixed(1)} Hz)`).join(', ')}`);
  
  console.log(`[GUITAR NOTE] Selected: ${closestNote} (difference: ${smallestDifference.toFixed(1)} Hz, ${smallestDifferenceInCents.toFixed(1)} cents)`);
  return closestNote;
}

/**
 * Get the target frequency for a given note
 * @param note The target note name
 * @returns The frequency in Hz
 */
export function getTargetFrequency(note: string): number {
  // Find the matching note in our predefined frequencies
  for (const [fullNote, freq] of Object.entries(NOTE_FREQUENCIES)) {
    if (fullNote.startsWith(note)) {
      return freq;
    }
  }
  
  // Default to E if not found
  return NOTE_FREQUENCIES['E2'];
}

/**
 * Format the tuner display output
 * @param tunerState Current state of the tuner
 * @returns Formatted string ready for display
 */
export function formatTunerDisplay(tunerState: TunerState): string {
  const { targetNote, detectedNote, deviation } = tunerState;
  
  // Line 1: Tuner header with target note
  let display = `TARGET NOTE: ${targetNote}`;
  
  // Line 2-3: Status and adjustment guidance
  if (!detectedNote || deviation === null) {
    display += `\n\nNo pitch detected. Play a note.`;
    display += `\n\nSay "tune to [NOTE]" or "exit tuner mode"`;
    return display;
  }
  
  // Line 2: Detected note and tuning status
  if (Math.abs(deviation) < 5) {
    // In tune - very clear indication
    display += `\n\n${detectedNote}: ** IN TUNE! **`;
  } else if (deviation < 0) {
    // Flat: needs to tune up (tighten string)
    const arrowCount = Math.min(Math.ceil(Math.abs(deviation) / 10), 5);
    const arrows = "<".repeat(arrowCount);
    display += `\n\n${detectedNote}: TUNE UP ${arrows}|`;
  } else {
    // Sharp: needs to tune down (loosen string)
    const arrowCount = Math.min(Math.ceil(deviation / 10), 5);
    const arrows = ">".repeat(arrowCount);
    display += `\n\n${detectedNote}: TUNE DOWN |${arrows}`;
  }
  
  // Line 4-5: Compact instructions
  display += `\n\nSay "tune to [NOTE]" or "exit"`;
  
  return display;
}

/**
 * Handle voice command for tuner mode
 * @param command The processed voice command
 * @param tunerState Current tuner state
 * @returns Updated tuner state
 */
export function handleTunerCommand(command: string, tunerState: TunerState): TunerState {
  const updatedState = { ...tunerState };
  
  // Command to set target note, e.g., "tune to A"
  const tuneToMatch = command.match(/tune\s+to\s+([A-G](?:#|b)?)/i);
  if (tuneToMatch) {
    const newTargetNote = tuneToMatch[1].toUpperCase();
    updatedState.targetNote = newTargetNote;
    return updatedState;
  }
  
  // Command to exit tuner mode
  if (command.includes('exit tuner') || command.includes('chord mode')) {
    updatedState.isActive = false;
    return updatedState;
  }
  
  // Command to enter tuner mode
  if (command.includes('tuner mode') || command.includes('tune guitar')) {
    updatedState.isActive = true;
    return updatedState;
  }
  
  // No relevant command found, return state unchanged
  return updatedState;
}

/**
 * Process audio chunk for tuner
 * @param audioData Audio data from onAudioChunk event
 * @param tunerState Current tuner state
 * @param sampleRate The actual sample rate of the audio data
 * @returns Updated tuner state with detection results
 */
export function processTunerAudioChunk(audioData: Float32Array, tunerState: TunerState, sampleRate: number): TunerState {
  if (!tunerState.isActive) {
    // Not in tuner mode, don't process
    return tunerState;
  }
  
  // Create a copy of the current state
  const updatedState = { ...tunerState };
  
  // Store previous values for stability
  const prevDetectedFrequency = updatedState.detectedFrequency;
  const prevDetectedNote = updatedState.detectedNote;
  
  // Detect pitch from audio data
  const detectedFrequency = detectPitch(audioData, sampleRate);
  
  if (detectedFrequency === null) {
    // No clear pitch detected
    if (prevDetectedFrequency === null) {
      // If there was also no previous detection, clear detection values
      updatedState.detectedNote = null;
      updatedState.detectedFrequency = null;
      updatedState.deviation = null;
    } else {
      // Keep the previous detection values to provide stability
      // but reduce confidence in them slightly
      // (We don't implement a confidence measure here, but could be added)
    }
    return updatedState;
  }
  
  // Apply frequency stability - only update if the frequency change is significant or consistent
  if (prevDetectedFrequency !== null) {
    // Calculate percentage difference between new and previous frequency
    const percentDiff = Math.abs((detectedFrequency - prevDetectedFrequency) / prevDetectedFrequency) * 100;
    
    // If new frequency is very close to previous (less than 3% difference), 
    // use a weighted average to smooth transitions
    if (percentDiff < 3) {
      // 70% new, 30% old - reduces jitter while allowing necessary changes
      const smoothedFrequency = detectedFrequency * 0.7 + prevDetectedFrequency * 0.3;
      updatedState.detectedFrequency = smoothedFrequency;
      
      // Log the smoothing only occasionally to reduce spam
      if (Math.random() < 0.1) {
        console.log(`[TUNER] Smoothing frequencies: ${prevDetectedFrequency.toFixed(1)} Hz → ${smoothedFrequency.toFixed(1)} Hz`);
      }
    } else {
      // If it's a significant change, update but still apply some smoothing
      const smoothedFrequency = detectedFrequency * 0.9 + prevDetectedFrequency * 0.1;
      updatedState.detectedFrequency = smoothedFrequency;
      console.log(`[TUNER] Significant frequency change: ${prevDetectedFrequency.toFixed(1)} Hz → ${smoothedFrequency.toFixed(1)} Hz`);
    }
  } else {
    // No previous frequency, just use the detected one
    updatedState.detectedFrequency = detectedFrequency;
  }
  
  // Find the corresponding note
  updatedState.detectedNote = findClosestGuitarNote(updatedState.detectedFrequency);
  
  // Calculate how far off we are from the target note
  const targetFrequency = getTargetFrequency(tunerState.targetNote);
  updatedState.deviation = calculateCentsDeviation(updatedState.detectedFrequency, targetFrequency);
  
  return updatedState;
}

/**
 * Update the tuner display on AugmentOS glasses
 * @param session TpaSession for display updates
 * @param tunerState Current tuner state
 */
export function updateTunerDisplay(session: TpaSession, tunerState: TunerState): void {
  // Format tuner state into compact display text
  const displayText = formatTunerDisplay(tunerState);
  
  // Show on the glasses
  session.layouts.showTextWall(displayText);
} 