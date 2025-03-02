#!/usr/bin/env python3
import sys
import os
import urllib.parse

# Immediately redirect stdout to capture ALL output including early imports
original_stdout = sys.stdout
sys.stdout = sys.stderr

from langchain_anthropic import ChatAnthropic
from browser_use import Agent
import asyncio
import json
import logging
from dotenv import load_dotenv
import re

# TODO: Currently working on assuming 4/4 time and then grouping into measures later

# Configure logging to go to stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

# Custom logger for tracking code paths
path_logger = logging.getLogger("code_path")
path_logger.setLevel(logging.INFO)

# Ensure all langchain logs go to stderr too
for logger_name in ["langchain", "browser_use", "playwright"]:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.WARNING)  # Only show warnings and errors
    
load_dotenv()

async def fetch_chords(song_name):
    """
    Use browser-use to fetch chord data for a given song from Ultimate Guitar.
    Returns a JSON string with song title and an array of chord measures.
    """
    try:
        print("Searching for chords for: " + song_name, file=sys.stderr)
        
        # Properly URL encode the song name
        url_song_name = urllib.parse.quote_plus(song_name)
        
        # Create direct search URL for Ultimate Guitar
        search_url = f"https://www.ultimate-guitar.com/search.php?search_type=title&value={url_song_name}"
        print(f"Direct search URL: {search_url}", file=sys.stderr)
        
        # Format the search query for Ultimate Guitar with a simpler, more direct prompt
        # Starting directly on the search results page
        search_query = f"""
        1. Go directly to {search_url}
        2. Look for chord results only - specifically rows with "CHORDS" listed as type. Choose the first one.
        3. Once on the chord page, follow these steps EXACTLY:
           a. Find and extract the song title shown on the page
           b. Find and extract the artist name shown on the page
           c. Find and extract the key of the song (look for "Key: X" or similar near the top of the page)
           d. Looking at the chord chart:
              - Focus ONLY on spans with class="iGhjU" or spans with data-name attributes, as these contain chord names
              - These appear as <span data-name="Am" class="iGhjU xXjiq">Am</span> in the HTML
              - For each line containing chords, extract ONLY the chord names (ignore lyrics, section markers, etc)
              - Collect ALL chord names across the entire song into a SINGLE flat list
              - Don't try to organize into measures or sections yet - just get all chord names in sequence

        Return a JSON object with this structure:
        {{
          "song": "the exact song title from the page",
          "artist": "the exact artist name from the page",
          "key": "the key of the song or 'Unknown' if not found",
          "chords": ["C", "Am", "F", "G", "Em", "D", ...] // Just a flat list of all chord names in sequence
        }}

        IMPORTANT:
        - If you can't extract ALL data, return what you CAN extract
        - If you can't find the key, use "Unknown"
        - Don't include section labels like [Verse] or [Chorus]
        - Don't include lyrics, just the chord names
        - Don't group into measures yet - I will handle that post-processing
        - If a chord repeats multiple times in sequence, include it multiple times (e.g., ["G", "G", "G", "G"])
        - For each beat that has no chord change, still include the previous chord (this preserves timing)
        """
        
        # Initialize the browser-use agent with Claude 3.7 for faster performance
        agent = Agent(
            task=search_query,
            llm=ChatAnthropic(model="claude-3-7-sonnet-20250219"),
        )
        
        # Run the agent to fetch chords
        print("Starting browser-use agent...", file=sys.stderr)
        raw_result = await agent.run()
        print("Browser-use agent completed", file=sys.stderr)
        path_logger.info(f"Raw result type: {type(raw_result)}")
        
        # Handle the AgentHistoryList response specifically
        if hasattr(raw_result, '__class__') and raw_result.__class__.__name__ == 'AgentHistoryList':
            path_logger.info("CODE PATH: Processing AgentHistoryList")
            print("Got AgentHistoryList response, trying to extract result", file=sys.stderr)
            
            # Convert the AgentHistoryList to a string to parse its content
            history_str = str(raw_result)
            print("Converting AgentHistoryList to string for extraction", file=sys.stderr)
            
            # Look for ActionResult with is_done=True
            is_done_pattern = r"ActionResult\(is_done=True, extracted_content='(.*?)', error=None"
            is_done_matches = re.findall(is_done_pattern, history_str, re.DOTALL)
            
            if is_done_matches:
                path_logger.info("CODE PATH: Found ActionResult with is_done=True")
                print("Found ActionResult with is_done=True", file=sys.stderr)
                extracted_content = is_done_matches[0]
                
                # Clean up any escaped characters
                extracted_content = extracted_content.replace('\\n', '\n')
                
                try:
                    # Try to parse it as JSON
                    raw_result = json.loads(extracted_content)
                    path_logger.info("CODE PATH: Successfully parsed extracted content as JSON")
                    print(f"Successfully parsed extracted JSON content", file=sys.stderr)
                except json.JSONDecodeError as e:
                    path_logger.info(f"CODE PATH: Failed to parse extracted content as JSON: {e}")
                    print(f"Failed to parse extracted content as JSON: {e}", file=sys.stderr)
                    
                    # Try to find JSON object in the string
                    json_pattern = r'\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}'
                    json_matches = re.findall(json_pattern, extracted_content)
                    
                    if json_matches:
                        path_logger.info(f"CODE PATH: Found {len(json_matches)} potential JSON matches in content")
                        for json_str in json_matches:
                            try:
                                potential_json = json.loads(json_str)
                                if isinstance(potential_json, dict) and 'chords' in potential_json:
                                    raw_result = potential_json
                                    path_logger.info("CODE PATH: Found and parsed valid JSON object with chords")
                                    print("Found and parsed JSON object in content", file=sys.stderr)
                                    break
                            except json.JSONDecodeError:
                                continue
            else:
                path_logger.info("CODE PATH: Could not find ActionResult with is_done=True")
                print("Could not find ActionResult with is_done=True", file=sys.stderr)
        
        # Process the result to ensure it's in the expected format
        if isinstance(raw_result, dict):
            path_logger.info("CODE PATH: Processing dictionary result")
            # Extract song data
            chord_data = raw_result.get("chords", [])
            path_logger.info(f"CODE PATH: chord_data type: {type(chord_data)}, length: {len(chord_data) if hasattr(chord_data, '__len__') else 'N/A'}")
            song_title = raw_result.get("song", song_name.title())
            artist_name = raw_result.get("artist", "")
            key = raw_result.get("key", "Unknown")
            
            # Post-process: Convert to 4-chord measures for 4/4 time
            processed_measures = []
            
            # If chord_data is a list of individual chord names
            if isinstance(chord_data, list) and all(isinstance(item, str) for item in chord_data):
                path_logger.info("CODE PATH: Processing list of individual chord names")
                # If we have a flat list of chord names, group them into 4-chord measures
                print(f"Processing {len(chord_data)} individual chords into 4/4 measures", file=sys.stderr)
                
                for i in range(0, len(chord_data), 4):
                    # Get up to 4 chords for this measure
                    measure_chords = chord_data[i:i+4]
                    
                    # Pad with '-' if fewer than 4 chords
                    while len(measure_chords) < 4:
                        measure_chords.append('-')
                    
                    # Join the chords with spaces and add to processed measures
                    measure_string = ' '.join(measure_chords)
                    processed_measures.append(measure_string)
                    print(f"Created measure: {measure_string}", file=sys.stderr)
            else:
                # If we have something other than a simple list of chord names, try to extract chords
                path_logger.info("CODE PATH: Processing non-standard chord data format")
                print(f"Got unexpected chord data format: {type(chord_data)}, trying to extract chords", file=sys.stderr)
                
                # Extract all chords into a flat list
                all_chords = []
                
                if isinstance(chord_data, list):
                    path_logger.info("CODE PATH: Chord data is a list but not of simple strings")
                    for item in chord_data:
                        if isinstance(item, str):
                            # Split by spaces to get individual chords
                            all_chords.extend(item.split())
                elif isinstance(chord_data, str):
                    path_logger.info("CODE PATH: Chord data is a string")
                    # Split the string to get individual chords
                    all_chords.extend(chord_data.split())
                
                # Now process the flat list into 4-chord measures
                print(f"Processing {len(all_chords)} extracted chords into 4/4 measures", file=sys.stderr)
                for i in range(0, len(all_chords), 4):
                    # Get up to 4 chords for this measure
                    measure_chords = all_chords[i:i+4]
                    
                    # Pad with '-' if fewer than 4 chords
                    while len(measure_chords) < 4:
                        measure_chords.append('-')
                    
                    # Join the chords with spaces
                    measure_string = ' '.join(measure_chords)
                    processed_measures.append(measure_string)
                    print(f"Created measure: {measure_string}", file=sys.stderr)
            
            print(f"Created {len(processed_measures)} 4/4 measures", file=sys.stderr)
            
            # Format title with artist if available
            title = f"{song_title}"
            if artist_name:
                title = f"{song_title} - {artist_name}"
            
            # Create the final result object
            result = {
                "success": len(processed_measures) > 0,
                "title": title,
                "song": song_title,
                "artist": artist_name,
                "key": key,
                "chords": processed_measures
            }
            
            # Convert to JSON
            json_result = json.dumps(result)
            print(f"Returning JSON result with {len(processed_measures)} measures", file=sys.stderr)
            return json_result
        
        elif isinstance(raw_result, list):
            path_logger.info("CODE PATH: Processing list result")
            # We have just an array - assume these are the chords
            chord_data = raw_result
            song_title = song_name.title()
            artist_name = ""
            key = "Unknown"
            
            # Post-process: Convert to 4-chord measures for 4/4 time
            processed_measures = []
            
            # Extract all chords into a flat list
            all_chords = []
            
            # Process each item in the list
            for item in chord_data:
                if isinstance(item, str):
                    # Split the item into individual chords
                    all_chords.extend(item.split())
            
            # Now process the flat list into 4-chord measures
            print(f"Processing {len(all_chords)} extracted chords into 4/4 measures", file=sys.stderr)
            for i in range(0, len(all_chords), 4):
                # Get up to 4 chords for this measure
                measure_chords = all_chords[i:i+4]
                
                # Pad with '-' if fewer than 4 chords
                while len(measure_chords) < 4:
                    measure_chords.append('-')
                
                # Join the chords with spaces
                measure_string = ' '.join(measure_chords)
                processed_measures.append(measure_string)
                print(f"Created measure: {measure_string}", file=sys.stderr)
            
            # Create result object
            result = {
                "success": len(processed_measures) > 0,
                "title": song_title,
                "song": song_title,
                "artist": artist_name,
                "key": key,
                "chords": processed_measures
            }
            
            # Convert to JSON
            json_result = json.dumps(result)
            print(f"Returning JSON result with {len(processed_measures)} measures", file=sys.stderr)
            return json_result
            
        elif isinstance(raw_result, str):
            path_logger.info("CODE PATH: Processing string result")
            print("Got string data, trying to parse", file=sys.stderr)
            # Try to parse if it's a string representation of JSON
            try:
                parsed_data = json.loads(raw_result)
                path_logger.info(f"CODE PATH: Successfully parsed string as JSON of type {type(parsed_data)}")
                if isinstance(parsed_data, dict):
                    chord_data = parsed_data.get("chords", [])
                    song_title = parsed_data.get("song", song_name.title())
                    artist_name = parsed_data.get("artist", "")
                    key = parsed_data.get("key", "Unknown")
                    
                    # Process chords into 4/4 measures
                    processed_measures = []
                    
                    # If we have a list of individual chord names
                    if isinstance(chord_data, list) and all(isinstance(item, str) for item in chord_data):
                        path_logger.info("CODE PATH: Processing list of individual chord names from parsed JSON string")
                        # Group them into 4-chord measures
                        for i in range(0, len(chord_data), 4):
                            # Get up to 4 chords for this measure
                            measure_chords = chord_data[i:i+4]
                            
                            # Pad with '-' if fewer than 4 chords
                            while len(measure_chords) < 4:
                                measure_chords.append('-')
                            
                            # Join the chords with spaces
                            measure_string = ' '.join(measure_chords)
                            processed_measures.append(measure_string)
                            print(f"Created measure: {measure_string}", file=sys.stderr)
                    else:
                        path_logger.info("CODE PATH: Processing non-standard chord data from parsed JSON string")
                        # Extract all chords into a flat list
                        all_chords = []
                        
                        # Process each item in chord_data
                        if isinstance(chord_data, list):
                            for item in chord_data:
                                if isinstance(item, str):
                                    # Split by spaces to get individual chords
                                    all_chords.extend(item.split())
                        elif isinstance(chord_data, str):
                            # Split the string to get individual chords
                            all_chords.extend(chord_data.split())
                        
                        # Now process the flat list into 4-chord measures
                        print(f"Processing {len(all_chords)} extracted chords into 4/4 measures", file=sys.stderr)
                        for i in range(0, len(all_chords), 4):
                            # Get up to 4 chords for this measure
                            measure_chords = all_chords[i:i+4]
                            
                            # Pad with '-' if fewer than 4 chords
                            while len(measure_chords) < 4:
                                measure_chords.append('-')
                            
                            # Join the chords with spaces
                            measure_string = ' '.join(measure_chords)
                            processed_measures.append(measure_string)
                            print(f"Created measure: {measure_string}", file=sys.stderr)
                    
                    # Create result object
                    result = {
                        "success": len(processed_measures) > 0,
                        "title": f"{song_title}" + (f" - {artist_name}" if artist_name else ""),
                        "song": song_title,
                        "artist": artist_name,
                        "key": key,
                        "chords": processed_measures
                    }
                else:
                    path_logger.info("CODE PATH: Parsed JSON is not a dictionary")
                    # If it's a list or something else, treat as chord data
                    chord_data = parsed_data if isinstance(parsed_data, list) else raw_result.split('\n')
                    
                    # Process into 4/4 measures
                    processed_measures = []
                    for line in chord_data:
                        if isinstance(line, str):
                            # Split the line into individual chords
                            chords = line.split()
                            
                            # Process 4 chords at a time
                            for i in range(0, len(chords), 4):
                                measure_chords = chords[i:i+4]
                                
                                # Pad with '-' if fewer than 4 chords
                                while len(measure_chords) < 4:
                                    measure_chords.append('-')
                                
                                processed_measures.append(' '.join(measure_chords))
                    
                    # Create result object
                    result = {
                        "success": len(processed_measures) > 0,
                        "title": song_name.title(),
                        "song": song_name.title(),
                        "artist": "",
                        "key": "Unknown",
                        "chords": processed_measures
                    }
            except json.JSONDecodeError:
                path_logger.info("CODE PATH: Failed to parse string as JSON, using fallback")
                # If parsing fails, split by newlines
                print("JSON parsing failed, using fallback", file=sys.stderr)
                chord_data = [line.strip() for line in raw_result.split('\n') if line.strip()]
                
                # Extract all chords into a flat list
                all_chords = []
                
                # Process each line to extract chords
                for line in chord_data:
                    # Split the line into individual chords
                    all_chords.extend(line.split())
                
                # Process into 4/4 measures
                processed_measures = []
                print(f"Processing {len(all_chords)} extracted chords into 4/4 measures", file=sys.stderr)
                for i in range(0, len(all_chords), 4):
                    # Get up to 4 chords for this measure
                    measure_chords = all_chords[i:i+4]
                    
                    # Pad with '-' if fewer than 4 chords
                    while len(measure_chords) < 4:
                        measure_chords.append('-')
                    
                    # Join the chords with spaces
                    measure_string = ' '.join(measure_chords)
                    processed_measures.append(measure_string)
                    print(f"Created measure: {measure_string}", file=sys.stderr)
                
                # Create result object
                result = {
                    "success": len(processed_measures) > 0,
                    "title": song_name.title(),
                    "song": song_name.title(),
                    "artist": "",
                    "key": "Unknown",
                    "chords": processed_measures
                }
            
            # Convert to JSON
            json_result = json.dumps(result)
            print(f"Returning JSON result with {len(result['chords'])} measures", file=sys.stderr)
            return json_result
        else:
            path_logger.info(f"CODE PATH: Unknown result type: {type(raw_result)}")
            print(f"Unknown result type: {type(raw_result)}", file=sys.stderr)
            # Create fallback chords with explanation
            result = {
                "success": False,
                "error": f"Unknown result type: {type(raw_result)}",
                "title": song_name.title(),
                "song": song_name.title(),
                "artist": "",
                "key": "Unknown",
                "chords": ["No - chord - data -", "found - try - again -"]
            }
            
            # Convert to JSON
            json_result = json.dumps(result)
            return json_result
            
    except Exception as e:
        path_logger.info(f"CODE PATH: Exception caught: {str(e)}")
        print(f"Error in fetch_chords: {str(e)}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e),
            "title": song_name,
            "song": song_name.title(),
            "artist": "",
            "key": "Unknown",
            "chords": []
        })

if __name__ == "__main__":
    # Check if song name was provided as command-line argument
    if len(sys.argv) < 2:
        result = json.dumps({
            "success": False,
            "error": "No song name provided",
            "title": "",
            "song": "",
            "artist": "",
            "key": "Unknown",
            "chords": []
        })
        # Restore stdout only to print the final JSON
        sys.stdout = original_stdout
        print(result)
        sys.exit(1)
    
    # Get song name from command-line argument
    song_name = " ".join(sys.argv[1:])
    
    # Run the async function to fetch chords
    print(f"Starting chord lookup for: {song_name}", file=sys.stderr)
    result = asyncio.run(fetch_chords(song_name))
    
    # Restore original stdout and print ONLY the clean JSON result
    sys.stdout = original_stdout
    print(result)


# Alternative way to run directly with more detailed output
async def main():
    # Get song name from command line or use default
    song_name = sys.argv[1] if len(sys.argv) > 1 else "dreams by fleetwood mac"
    
    print(f"Starting chord lookup for: {song_name}")
    
    # Fetch the chords
    json_result = await fetch_chords(song_name)
    
    # Parse the JSON result
    result = json.loads(json_result)
    
    # Print a nicely formatted result
    if result["success"]:
        print(f"\n--- {result['title']} ---")
        print("\nChords:")
        for i, measure in enumerate(result["chords"]):
            print(f"Measure {i+1}: {measure}")
    else:
        print(f"\nError: {result.get('error', 'Unknown error')}")
    
    return result

# Comment out this line to prevent extra output
# asyncio.run(main())
