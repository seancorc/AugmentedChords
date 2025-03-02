#!/usr/bin/env python3
import sys
import os

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

# Configure logging to go to stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

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
        
        # Format the search query for Ultimate Guitar with a simpler, more direct prompt
        search_query = f"""
        1. Go to https://www.ultimate-guitar.com/
        2. Search for '{song_name}'
        3. Look for the most popular chord result (look for "chords" in the tab type) and click on it
        4. Once on the chord page, follow these steps EXACTLY:
           a. Find and extract the song title shown on the page
           b. Find and extract the artist name shown on the page
           c. Find the chord chart/progression
           d. For each line of the chord progression, extract ONLY the chords (ignore all lyrics, section markers, etc)
           e. Format each measure or line of chords as a simple space-separated string like "C Am F G"
        
        Return a simple JSON object with this exact structure:
        {{
          "song": "the exact song title from the page",
          "artist": "the exact artist name from the page",
          "chords": [
            "C Am F G",
            "F G C -",
            "Am F C G"
            // include all measures/lines of chords in order
          ]
        }}
        
        IMPORTANT: Make sure you extract just the chord symbols like C, Am, F, G, etc. - not the lyrics or section labels.
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
        
        # Handle the AgentHistoryList response specifically
        if hasattr(raw_result, '__class__') and raw_result.__class__.__name__ == 'AgentHistoryList':
            print("Got AgentHistoryList response, trying to extract result", file=sys.stderr)
            
            # Convert the AgentHistoryList to a string to parse its content
            history_str = str(raw_result)
            print("Converting AgentHistoryList to string for extraction", file=sys.stderr)
            
            # Look for ActionResult with is_done=True
            is_done_pattern = r"ActionResult\(is_done=True, extracted_content='(.*?)', error=None"
            is_done_matches = re.findall(is_done_pattern, history_str, re.DOTALL)
            
            if is_done_matches:
                print("Found ActionResult with is_done=True", file=sys.stderr)
                extracted_content = is_done_matches[0]
                
                # Clean up any escaped characters
                extracted_content = extracted_content.replace('\\n', '\n')
                
                try:
                    # Try to parse it as JSON
                    raw_result = json.loads(extracted_content)
                    print(f"Successfully parsed extracted JSON content", file=sys.stderr)
                except json.JSONDecodeError as e:
                    print(f"Failed to parse extracted content as JSON: {e}", file=sys.stderr)
                    
                    # Try to find JSON object in the string
                    json_pattern = r'\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}'
                    json_matches = re.findall(json_pattern, extracted_content)
                    
                    if json_matches:
                        for json_str in json_matches:
                            try:
                                potential_json = json.loads(json_str)
                                if isinstance(potential_json, dict) and 'chords' in potential_json:
                                    raw_result = potential_json
                                    print("Found and parsed JSON object in content", file=sys.stderr)
                                    break
                            except json.JSONDecodeError:
                                continue
            else:
                print("Could not find ActionResult with is_done=True", file=sys.stderr)
        
        # Process the result to ensure it's in the expected format
        if isinstance(raw_result, dict):
            # We already have a structured format - extract the data
            chord_data = raw_result.get("chords", [])
            song_title = raw_result.get("song", song_name.title())
            artist_name = raw_result.get("artist", "")
            print(f"Got structured data with {len(chord_data)} chords", file=sys.stderr)
        elif isinstance(raw_result, list):
            # We have just an array - assume these are the chords
            chord_data = raw_result
            song_title = song_name.title()
            artist_name = ""
            print(f"Got list data with {len(chord_data)} chords", file=sys.stderr)
        elif isinstance(raw_result, str):
            print("Got string data, trying to parse", file=sys.stderr)
            # Try to parse if it's a string representation of JSON
            try:
                parsed_data = json.loads(raw_result)
                if isinstance(parsed_data, dict):
                    chord_data = parsed_data.get("chords", [])
                    song_title = parsed_data.get("song", song_name.title())
                    artist_name = parsed_data.get("artist", "")
                    print(f"Parsed JSON string successfully", file=sys.stderr)
                else:
                    # If it's a list or something else, treat as chord data
                    chord_data = parsed_data if isinstance(parsed_data, list) else raw_result.split('\n')
                    song_title = song_name.title()
                    artist_name = ""
                    print(f"Parsed non-dict data", file=sys.stderr)
            except json.JSONDecodeError:
                # If parsing fails, split by newlines
                print("JSON parsing failed, using fallback", file=sys.stderr)
                chord_data = [line.strip() for line in raw_result.split('\n') if line.strip()]
                song_title = song_name.title()
                artist_name = ""
        else:
            print(f"Unknown result type: {type(raw_result)}", file=sys.stderr)
            # Create fallback chords with explanation
            chord_data = ["No chord data found - try again or try a different song"]
            song_title = song_name.title()
            artist_name = ""
        
        # Format title with artist if available
        title = f"{song_title} - {artist_name}" if artist_name else song_title
        
        # Create the final result object
        result = {
            "success": len(chord_data) > 1,  # Only consider successful if we have multiple chord measures
            "title": title,
            "song": song_title,
            "artist": artist_name,
            "chords": chord_data
        }
        
        # Convert to JSON
        json_result = json.dumps(result)
        print(f"Returning JSON result with {len(chord_data)} chords", file=sys.stderr)
        return json_result
        
    except Exception as e:
        print(f"Error in fetch_chords: {str(e)}", file=sys.stderr)
        return json.dumps({
            "success": False,
            "error": str(e),
            "title": song_name,
            "song": song_name.title(),
            "artist": "",
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
