#!/usr/bin/env python3
import sys
import os
import urllib.parse
import json
import re
import logging
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import requests

# Configure logging to go to stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)

# Create a logger
logger = logging.getLogger("chord_scraper")
    
load_dotenv()

# Headers to mimic a browser visit
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
}

def fetch_chords(song_name):
    """
    Fetches chord data for a given song from Ultimate Guitar.
    
    Args:
        song_name: Name of the song to search for
        
    Returns:
        dict: JSON response with chord data or error message
    """
    try:
        logger.info(f"Looking up chords for: {song_name}")
        
        # Step 1: Format the search URL
        encoded_song = urllib.parse.quote_plus(song_name)
        search_url = f"https://www.ultimate-guitar.com/search.php?search_type=title&value={encoded_song}"
        logger.info(f"Searching for chords: {search_url}")
        
        # Set user agent to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.ultimate-guitar.com/'
        }
        
        # Make the search request
        response = requests.get(search_url, headers=headers)
        if response.status_code != 200:
            logger.error(f"Failed to fetch search results: HTTP {response.status_code}")
            return {"success": False, "error": f"HTTP Error: {response.status_code}", "chords": []}
        
        # Step 2: Extract the JSON data from the data-content attribute
        soup = BeautifulSoup(response.text, 'html.parser')
        data_content_element = soup.find(attrs={"data-content": True})
        
        if not data_content_element:
            logger.error("No data-content element found in the page")
            return {"success": False, "error": "No chord data found in the page", "chords": []}
        
        # Parse the JSON from the data-content attribute
        try:
            data_content = json.loads(data_content_element["data-content"])
            store_data = data_content.get("store", {})
            page_data = store_data.get("page", {}).get("data", {})
            results = page_data.get("results", [])
            
            logger.info(f"Found {len(results)} results in the search data")
            
            # Step 3: Find the first chord result
            chord_results = []
            for result in results:
                # Looking for items with type "Chords"
                if result.get("type") == "Chords":
                    chord_results.append(result)
            
            if not chord_results:
                logger.error("No chord results found")
                return {"success": False, "error": "No chord results found", "chords": []}
            
            # Get the first chord result
            chord_result = chord_results[0]
            logger.info(f"Selected chord result: {chord_result.get('song_name')} by {chord_result.get('artist_name')}")
            
            # Step 4: Get the tab URL
            tab_url = chord_result.get("tab_url")
            if not tab_url:
                logger.error("No tab URL found in the chord result")
                return {"success": False, "error": "No tab URL found", "chords": []}
            
            # Make sure the URL is absolute
            if not tab_url.startswith("http"):
                tab_url = f"https:{tab_url}" if tab_url.startswith("//") else f"https://www.ultimate-guitar.com{tab_url}"
            
            logger.info(f"Fetching chord page: {tab_url}")
            
            # Step 5: Fetch the chord page
            chord_response = requests.get(tab_url, headers=headers)
            if chord_response.status_code != 200:
                logger.error(f"Failed to fetch chord page: HTTP {chord_response.status_code}")
                return {"success": False, "error": f"HTTP Error: {chord_response.status_code}", "chords": []}
            
            # Step 6: Extract chord data from the chord page
            chord_soup = BeautifulSoup(chord_response.text, 'html.parser')
            
            # Look for data-content in the chord page that contains the actual chords
            chord_data_element = chord_soup.find(attrs={"data-content": True})
            if not chord_data_element:
                logger.error("No data-content element found in the chord page")
                return {"success": False, "error": "No chord data found in the chord page", "chords": []}
            
            # Parse the JSON from the data-content attribute in the chord page
            try:
                chord_data_content = json.loads(chord_data_element["data-content"])
                tab_view = chord_data_content.get("store", {}).get("page", {}).get("data", {}).get("tab_view", {})
                
                # Extract useful information
                song_title = tab_view.get("song_name", chord_result.get("song_name", "Unknown"))
                artist_name = tab_view.get("artist_name", chord_result.get("artist_name", "Unknown"))
                
                # Try to get the key from tab_view or from the original search result
                key = tab_view.get("tonality_name", "")
                if not key or key.lower() == "unknown":
                    # Try to extract from the original search result
                    key = chord_result.get("tonality_name", "")
                
                # If we still don't have a key, infer it from the first chord
                if not key or key.lower() == "unknown":
                    # Get the chord content
                    content = tab_view.get("wiki_tab", {}).get("content", "")
                    if content:
                        # Extract the first chord and use it as the key
                        chord_pattern = r'\[ch\](.*?)\[/ch\]'
                        chord_matches = re.findall(chord_pattern, content)
                        if chord_matches:
                            first_chord = chord_matches[0]
                            # Extract just the root note without modifiers for a simple key
                            key_match = re.match(r'([A-G][#b]?)', first_chord)
                            if key_match:
                                key = key_match.group(1)
                
                # If we still don't have a key, use a default
                if not key or key.lower() == "unknown":
                    key = "C" # Default to C if we can't determine the key
                
                # Get the chord content
                content = tab_view.get("wiki_tab", {}).get("content", "")
                if not content:
                    logger.error("No chord content found in the tab view")
                    return {"success": False, "error": "No chord content found", "chords": []}
                
                # Step 7: Process the chord content
                # Remove [ch] tags to get just the chord names, and organize by measures
                chord_pattern = r'\[ch\](.*?)\[/ch\]'
                chords = re.findall(chord_pattern, content)
                
                # Process chords into measures (groups of 4 for 4/4 time)
                measures = []
                for i in range(0, len(chords), 4):
                    measure = chords[i:i+4]
                    if measure:  # Only add non-empty measures
                        # Pad with empty strings if the measure doesn't have 4 chords
                        while len(measure) < 4:
                            measure.append("")
                        measures.append(measure)
                
                # Step 8: Create the response object
                response_data = {
                    "success": True,
                    "song_title": song_title,
                    "artist": artist_name,
                    "key": key,
                    "chords": measures
                }
                
                logger.info(f"Successfully extracted {len(measures)} measures of chord data")
                return response_data
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON from chord page: {e}")
                return {"success": False, "error": f"JSON parse error in chord page: {e}", "chords": []}
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from search page: {e}")
            return {"success": False, "error": f"JSON parse error in search page: {e}", "chords": []}
            
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return {"success": False, "error": str(e), "chords": []}

def create_error_response(song_name, error_message):
    """Helper function to create an error response"""
    result = {
        "success": False,
        "error": error_message,
        "title": song_name,
        "song": song_name.title(),
        "artist": "",
        "key": "Unknown",
        "chords": []
    }
    return json.dumps(result)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python fetch_chords_scrape.py \"song name\"")
        sys.exit(1)
    
    song_name = sys.argv[1]
    result = fetch_chords(song_name)
    print(json.dumps(result, indent=2)) 