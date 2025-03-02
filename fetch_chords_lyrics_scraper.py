#!/usr/bin/env python3
import sys
import requests
import urllib.parse
import json
import re
import logging
from bs4 import BeautifulSoup

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('chords_lyrics_scraper')

def fetch_chords_lyrics(song_name):
    """
    Fetches both chords and lyrics for a given song from Ultimate Guitar.
    """
    logger.info(f"Looking up chords and lyrics for: {song_name}")
    
    try:
        # URL encode the song name
        encoded_song = urllib.parse.quote_plus(song_name)
        
        # Search URL for Ultimate Guitar
        search_url = f"https://www.ultimate-guitar.com/search.php?search_type=title&value={encoded_song}"
        logger.info(f"Searching URL: {search_url}")
        
        # Set headers to mimic a browser
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.ultimate-guitar.com/'
        }
        
        # Make the search request
        response = requests.get(search_url, headers=headers)
        if response.status_code != 200:
            logger.error(f"Failed to fetch search results: HTTP {response.status_code}")
            return {
                "success": False,
                "error": f"Failed to fetch search results: HTTP {response.status_code}"
            }
        
        # Extract the JSON data from the data-content attribute
        soup = BeautifulSoup(response.text, 'html.parser')
        data_content_element = soup.find(attrs={"data-content": True})
        
        if not data_content_element:
            logger.error("No data-content element found in the page")
            return {
                "success": False,
                "error": "No data-content element found in the page"
            }
        
        # Parse the JSON from the data-content attribute
        data_content = json.loads(data_content_element["data-content"])
        store_data = data_content.get("store", {})
        page_data = store_data.get("page", {}).get("data", {})
        results = page_data.get("results", [])
        
        logger.info(f"Found {len(results)} results in the search data")
        
        # Find chord results
        chord_results = [r for r in results if r.get("type") == "Chords"]
        
        if not chord_results:
            logger.error("No chord results found")
            return {
                "success": False,
                "error": "No chord results found"
            }
        
        # Get the first chord result
        chord_result = chord_results[0]
        logger.info(f"Selected chord result: {chord_result.get('song_name')} by {chord_result.get('artist_name')}")
        
        # Get the tab URL
        tab_url = chord_result.get("tab_url")
        if not tab_url:
            logger.error("No tab URL found in the chord result")
            return {
                "success": False,
                "error": "No tab URL found in the chord result"
            }
        
        # Make sure the URL is absolute
        if not tab_url.startswith("http"):
            tab_url = f"https:{tab_url}" if tab_url.startswith("//") else f"https://www.ultimate-guitar.com{tab_url}"
        
        logger.info(f"Fetching chord page: {tab_url}")
        
        # Fetch the chord page
        chord_response = requests.get(tab_url, headers=headers)
        if chord_response.status_code != 200:
            logger.error(f"Failed to fetch chord page: HTTP {chord_response.status_code}")
            return {
                "success": False,
                "error": f"Failed to fetch chord page: HTTP {chord_response.status_code}"
            }
        
        # Extract chord data from the chord page
        chord_soup = BeautifulSoup(chord_response.text, 'html.parser')
        
        # Look for data-content in the chord page
        chord_data_element = chord_soup.find(attrs={"data-content": True})
        if not chord_data_element:
            logger.error("No data-content element found in the chord page")
            return {
                "success": False,
                "error": "No data-content element found in the chord page"
            }
        
        # Parse the JSON from the data-content attribute
        chord_data_content = json.loads(chord_data_element["data-content"])
        tab_view = chord_data_content.get("store", {}).get("page", {}).get("data", {}).get("tab_view", {})
        
        # Extract song information
        song_title = tab_view.get("song_name", chord_result.get("song_name", "Unknown"))
        artist_name = tab_view.get("artist_name", chord_result.get("artist_name", "Unknown"))
        tonality_name = tab_view.get("tonality_name", "Unknown")
        
        # Extract capo information if available
        capo_information = None
        if tab_view.get("meta", {}).get("capo") is not None:
            capo_information = tab_view.get("meta", {}).get("capo")
            logger.info(f"Found capo information: {capo_information}")
        
        # Get the chord content
        content = tab_view.get("wiki_tab", {}).get("content", "")
        if not content:
            logger.error("No chord content found in the tab view")
            return {
                "success": False,
                "error": "No chord content found in the tab view"
            }
        
        # Extract chord-lyric sections
        # First, identify section markers
        section_pattern = r'\[(Verse|Chorus|Bridge|Intro|Outro|Solo|Pre-Chorus|Interlude|Instrumental|Verse \d+|Chorus \d+|Bridge \d+)(?:\s*\d*)?\]'
        section_matches = re.findall(section_pattern, content)
        logger.info(f"Found {len(section_matches)} section markers in the chord content")
        
        # Extract chords pattern
        chord_pattern = r'\[ch\](.*?)\[/ch\]'
        
        # Extract tab sections which contain lyrics
        tab_pattern = r'\[tab\](.*?)\[/tab\]'
        tab_matches = re.findall(tab_pattern, content, re.DOTALL)
        logger.info(f"Found {len(tab_matches)} tab sections in the chord content")
        
        # Prepare the result structure
        lines = []
        
        # Identify all section markers and their positions in the content
        section_positions = []
        for match in re.finditer(section_pattern, content):
            section_name = match.group(1)
            section_positions.append((match.start(), section_name))
        
        # Sort section positions by their start position
        section_positions.sort()
        
        # Extract and process each section content
        sections_content = []
        for i in range(len(section_positions)):
            start = section_positions[i][0]
            section_name = section_positions[i][1]
            
            # Determine end position (either next section or end of content)
            end = section_positions[i + 1][0] if i < len(section_positions) - 1 else len(content)
            
            # Extract section content
            section_content = content[start:end]
            sections_content.append((section_name, section_content))
        
        # Process each section separately
        for section_name, section_content in sections_content:
            logger.info(f"Processing section: {section_name}")
            section_lines = section_content.strip().split('\n')
            
            # Special handling for Intro section (which often has vertical bar formatting)
            if section_name == "Intro":
                process_intro_section(section_lines, section_pattern, chord_pattern, lines)
            else:
                # Process regular sections
                process_regular_section(section_name, section_content, section_pattern, chord_pattern, lines)
        
        # Handle key if it's unknown
        key = tonality_name
        if key == "Unknown" and lines:
            # Try to infer the key from the first chord
            first_line = lines[0]
            if first_line and first_line["chords"]:
                # The first chord is often the key
                key = first_line["chords"][0]
                # Remove any modifiers (e.g., m7, maj7)
                key = re.sub(r'(m7|maj7|7|m|sus\d|add\d|dim|aug|\/).*', '', key)
        
        logger.info(f"Extracted {len(lines)} chord-lyric lines from the chord content")
        
        # Create the result object
        result = {
            "success": True,
            "song_title": song_title,
            "artist": artist_name,
            "key": key,
            "capo": capo_information,
            "lines": lines
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Error fetching chords and lyrics: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }

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
                    logger.info(f"Found repeat indicator: {repeat_info}")
                
                # Calculate positions - for bar-formatted intro lines, use evenly spaced positions
                chord_positions = [i * 10 for i in range(len(chords))]  # Evenly space chords
                
                # Add the intro chord line with repeat info
                lines.append({
                    "section": "Intro",
                    "chords": chords,
                    "chord_positions": chord_positions,
                    "lyrics": None,  # Intro is typically instrumental
                    "repeat_info": repeat_info  # Add repeat information
                })
                logger.info(f"Added Intro line with chords: {chords}" + 
                           (f" and repeat info: {repeat_info}" if repeat_info else ""))

def process_regular_section(section_name, section_content, section_pattern, chord_pattern, lines):
    """Process a regular (non-intro) section."""
    # Check for tab sections
    tab_pattern_in_section = r'\[tab\](.*?)\[/tab\]'
    section_tab_matches = re.findall(tab_pattern_in_section, section_content, re.DOTALL)
    
    if section_tab_matches:
        # Process tab sections
        for tab_content in section_tab_matches:
            process_chord_lyric_lines(section_name, tab_content.strip().split('\n'), section_pattern, chord_pattern, lines)
    else:
        # No tab sections, process raw lines
        process_chord_lyric_lines(section_name, section_content.strip().split('\n'), section_pattern, chord_pattern, lines)

def process_chord_lyric_lines(section_name, content_lines, section_pattern, chord_pattern, lines):
    """Process chord and lyric lines from content."""
    i = 0
    while i < len(content_lines):
        line = content_lines[i].strip()
        
        # Skip empty lines and section markers
        if not line or re.search(section_pattern, line):
            i += 1
            continue
        
        # Check if this is a chord line
        if '[ch]' in line:
            # Extract chords and their exact positions from the original HTML
            chord_positions = []
            
            for m in re.finditer(chord_pattern, line):
                chord = m.group(1)
                # Get the position exactly as it appears in the HTML
                # This preserves the original intended spacing from Ultimate Guitar
                visual_pos = m.start()
                chord_positions.append((visual_pos, chord))
            
            # Extract chords from positions
            chords = [chord for _, chord in chord_positions]
            positions = [pos for pos, _ in chord_positions]
            
            # Check for repeat indicators after the chords (like "x2", "x4")
            repeat_info = None
            # Look for patterns like "x2", "x4" etc. after the chord sequence
            repeat_match = re.search(r'\s*(x\d+)', line.split('[/ch]')[-1])
            if repeat_match:
                repeat_info = repeat_match.group(1)
                logger.info(f"Found repeat indicator in {section_name}: {repeat_info}")
            
            # Look for lyrics in the next line
            lyrics = None
            if i + 1 < len(content_lines):
                lyric_line = content_lines[i+1].strip()
                # Make sure it's not a chord line or section marker
                if '[ch]' not in lyric_line and not re.search(section_pattern, lyric_line):
                    lyrics = lyric_line if lyric_line else None
                    
                    # If we have lyrics, make only minimal adjustments to positions when necessary
                    if lyrics and chords:
                        lyric_length = len(lyrics)
                        
                        # Only adjust if a position exceeds the lyric length
                        if positions and lyric_length > 0:
                            # Normalize positions to accommodate different chord widths
                            # First, calculate the actual chord widths to preserve spacing ratios
                            chord_widths = [len(chord) for chord in chords]
                            
                            # Calculate total chord text width including tags
                            total_chord_text = sum(len(f"[ch]{chord}[/ch]") for chord in chords)
                            
                            # Get the remaining whitespace in the original HTML
                            original_whitespace = len(line) - total_chord_text
                            
                            # If original HTML line is wider than lyrics, scale positions proportionally
                            if positions[-1] > lyric_length and positions[-1] > 0:
                                scaling_factor = lyric_length / positions[-1]
                                positions = [int(pos * scaling_factor) for pos in positions]
                            
                            # Ensure no position exceeds lyrics length
                            positions = [min(p, lyric_length - 1) for p in positions]
                            
                            # Final check to prevent overlap
                            for j in range(1, len(positions)):
                                if positions[j] <= positions[j-1]:
                                    positions[j] = min(positions[j-1] + 1, lyric_length - 1)
                    
                    i += 2  # Skip the lyric line we just processed
                else:
                    i += 1  # This is an instrumental line (chords with no lyrics)
            else:
                i += 1
            
            # Add the chord-lyric line to our result if we have chords
            if chords:
                lines.append({
                    "section": section_name,
                    "chords": chords,
                    "chord_positions": positions,
                    "lyrics": lyrics,
                    "repeat_info": repeat_info  # Add repeat information
                })
        else:
            i += 1

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fetch_chords_lyrics_scraper.py 'song name'")
        sys.exit(1)
    
    song_name = " ".join(sys.argv[1:])
    result = fetch_chords_lyrics(song_name)
    
    # Print the result as JSON
    print(json.dumps(result, indent=2)) 