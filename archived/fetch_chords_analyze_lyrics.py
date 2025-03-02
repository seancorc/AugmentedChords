#!/usr/bin/env python3
import sys
import requests
import urllib.parse
import json
import re
from bs4 import BeautifulSoup

def analyze_chord_page(song_name):
    """Analyze how lyrics and chords are represented in Ultimate Guitar HTML"""
    print(f"Analyzing Ultimate Guitar chord page for: {song_name}")
    
    # URL encode the song name
    encoded_song = urllib.parse.quote_plus(song_name)
    
    # Search URL for Ultimate Guitar
    search_url = f"https://www.ultimate-guitar.com/search.php?search_type=title&value={encoded_song}"
    print(f"Search URL: {search_url}")
    
    # Set headers to mimic a browser
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.ultimate-guitar.com/'
    }
    
    # Make the search request
    response = requests.get(search_url, headers=headers)
    if response.status_code != 200:
        print(f"Failed to fetch search results: HTTP {response.status_code}")
        return
    
    # Extract the JSON data from the data-content attribute
    soup = BeautifulSoup(response.text, 'html.parser')
    data_content_element = soup.find(attrs={"data-content": True})
    
    if not data_content_element:
        print("No data-content element found in the page")
        return
    
    # Parse the JSON from the data-content attribute
    try:
        data_content = json.loads(data_content_element["data-content"])
        store_data = data_content.get("store", {})
        page_data = store_data.get("page", {}).get("data", {})
        results = page_data.get("results", [])
        
        print(f"Found {len(results)} results in the search data")
        
        # Find chord results
        chord_results = []
        for result in results:
            if result.get("type") == "Chords":
                chord_results.append(result)
        
        if not chord_results:
            print("No chord results found")
            return
        
        # Get the first chord result
        chord_result = chord_results[0]
        print(f"Selected chord result: {chord_result.get('song_name')} by {chord_result.get('artist_name')}")
        
        # Get the tab URL
        tab_url = chord_result.get("tab_url")
        if not tab_url:
            print("No tab URL found in the chord result")
            return
        
        # Make sure the URL is absolute
        if not tab_url.startswith("http"):
            tab_url = f"https:{tab_url}" if tab_url.startswith("//") else f"https://www.ultimate-guitar.com{tab_url}"
        
        print(f"Fetching chord page: {tab_url}")
        
        # Fetch the chord page
        chord_response = requests.get(tab_url, headers=headers)
        if chord_response.status_code != 200:
            print(f"Failed to fetch chord page: HTTP {chord_response.status_code}")
            return
        
        # Extract chord data from the chord page
        chord_soup = BeautifulSoup(chord_response.text, 'html.parser')
        
        # Look for data-content in the chord page
        chord_data_element = chord_soup.find(attrs={"data-content": True})
        if not chord_data_element:
            print("No data-content element found in the chord page")
            return
        
        # Parse the JSON from the data-content attribute
        chord_data_content = json.loads(chord_data_element["data-content"])
        tab_view = chord_data_content.get("store", {}).get("page", {}).get("data", {}).get("tab_view", {})
        
        # Extract useful information
        song_title = tab_view.get("song_name", chord_result.get("song_name", "Unknown"))
        artist_name = tab_view.get("artist_name", chord_result.get("artist_name", "Unknown"))
        
        # Get the chord content
        content = tab_view.get("wiki_tab", {}).get("content", "")
        if not content:
            print("No chord content found in the tab view")
            return
        
        print("\n=== CHORD CONTENT ANALYSIS ===")
        print(f"Song: {song_title} by {artist_name}")
        
        # Save the raw content to analyze it properly
        print("\nRAW CONTENT SAMPLE (first 500 chars):")
        print(content[:500])
        
        # Analyze the structure of the content
        print("\n1. Section Markers Analysis:")
        section_pattern = r'\[(Verse|Chorus|Bridge|Intro|Outro|Solo|Pre-Chorus|Interlude|Verse \d+|Chorus \d+|Bridge \d+)(?:\s*\d*)?\]'
        section_matches = re.findall(section_pattern, content)
        print(f"Found {len(section_matches)} section markers: {', '.join(section_matches)}")
        
        # Analyze chord tags
        print("\n2. Chord Tags Analysis:")
        chord_pattern = r'\[ch\](.*?)\[/ch\]'
        chord_matches = re.findall(chord_pattern, content)
        print(f"Found {len(chord_matches)} chord tags")
        print(f"First 10 chords: {', '.join(chord_matches[:10])}")
        
        # Analyze tab tags
        print("\n3. Tab Tags Analysis:")
        tab_pattern = r'\[tab\](.*?)\[/tab\]'
        tab_matches = re.findall(tab_pattern, content, re.DOTALL)  # re.DOTALL allows matching across lines
        print(f"Found {len(tab_matches)} tab sections")
        
        if tab_matches:
            print("\nSample tab section content:")
            for i, tab_content in enumerate(tab_matches[:2]):  # Show first 2 tab sections
                print(f"\nTab Section {i+1} (first 150 chars):")
                print(tab_content[:150] + "..." if len(tab_content) > 150 else tab_content)
                
                # Check for chords in this tab section
                chords_in_tab = re.findall(chord_pattern, tab_content)
                if chords_in_tab:
                    print(f"Chords in this tab section: {', '.join(chords_in_tab[:10])}")
                    
                    # Extract lyrics by removing chord tags from tab content
                    lyrics = re.sub(chord_pattern, '', tab_content).strip()
                    if lyrics:
                        print(f"Lyrics in this tab section: {lyrics}")
                
                # Analyze tab structure
                tab_lines = tab_content.strip().split('\n')
                print(f"\nTab section has {len(tab_lines)} lines")
                
                # Identify the pattern of chords and lyrics
                chord_lines = []
                lyric_lines = []
                
                for j, line in enumerate(tab_lines):
                    if '[ch]' in line:
                        chord_lines.append((j, line))
                    elif line.strip() and not line.strip().startswith('|') and not line.strip().startswith('e|'):
                        # Exclude tab notation lines which often start with | or e|
                        lyric_lines.append((j, line))
                
                print(f"Found {len(chord_lines)} lines with chords and {len(lyric_lines)} potential lyric lines in this tab section")
                
                # Check for chord line followed by lyric line pattern (common pattern)
                for j, (chord_idx, chord_line) in enumerate(chord_lines):
                    for lyric_idx, lyric_line in lyric_lines:
                        if lyric_idx == chord_idx + 1:  # Lyric line immediately follows chord line
                            print("\nFound chord line followed by lyric line:")
                            print(f"Chord line: {chord_line}")
                            print(f"Lyric line: {lyric_line}")
                            
                            # Extract chord positions and try to align with lyrics
                            chord_indices = [(m.start(), m.end(), m.group(1)) for m in re.finditer(chord_pattern, chord_line)]
                            if chord_indices and len(lyric_line) > 0:
                                # Calculate visual positions of chords (excluding the tags)
                                chord_positions = []
                                for start, end, chord in chord_indices:
                                    # Number of characters before this chord tag, excluding other chord tags
                                    before_text = chord_line[:start]
                                    visual_pos = len(re.sub(r'\[ch\].*?\[/ch\]', '', before_text))
                                    chord_positions.append((visual_pos, chord))
                                
                                print("\nChord positions aligned with lyrics:")
                                for pos, chord in chord_positions:
                                    if pos < len(lyric_line):
                                        context_start = max(0, pos - 3)
                                        context_end = min(len(lyric_line), pos + len(chord) + 3)
                                        context = lyric_line[context_start:context_end]
                                        marker = ' ' * (pos - context_start) + '^'
                                        print(f"Chord '{chord}' at position {pos}:")
                                        print(f"  '{context}'")
                                        print(f"   {marker}")
                            break
                    if j > 1:  # Limit to first few examples
                        break
                
                # Also check for chords inline with lyrics
                inline_patterns = 0
                for line in tab_lines:
                    if '[ch]' in line:
                        # Check if there's other text besides chord tags
                        line_without_chords = re.sub(chord_pattern, '', line).strip()
                        if line_without_chords:
                            inline_patterns += 1
                            if inline_patterns <= 2:  # Show first 2 examples
                                print(f"\nFound inline chord-lyrics pattern: {line}")
                                # Extract chunks of text between chord tags
                                text_chunks = re.split(chord_pattern, line)
                                text_chunks = [chunk for chunk in text_chunks if chunk.strip()]
                                if text_chunks:
                                    print(f"Text between chords: {' | '.join(text_chunks)}")
        
        # Check for common patterns across the entire content
        print("\n4. Content Pattern Analysis:")
        
        # Check for [tab] tags containing both chords and lyrics
        if tab_matches:
            print("- Found lyrics and chords inside [tab] tags")
            
            # Check for sections with chords on one line and lyrics on the next
            pattern_found = False
            for section in tab_matches:
                lines = section.strip().split('\n')
                for i in range(len(lines) - 1):
                    if '[ch]' in lines[i] and lines[i+1].strip() and '[ch]' not in lines[i+1]:
                        pattern_found = True
                        break
                if pattern_found:
                    break
            
            if pattern_found:
                print("- Common pattern: Chord line followed by lyric line")
            else:
                print("- No clear chord-line/lyric-line pattern found")
            
            # Check for inline chords (chords within lyric lines)
            inline_found = False
            for section in tab_matches:
                lines = section.strip().split('\n')
                for line in lines:
                    if '[ch]' in line and re.sub(chord_pattern, '', line).strip():
                        inline_found = True
                        break
                if inline_found:
                    break
            
            if inline_found:
                print("- Found inline pattern: chords embedded within lyric lines")
        else:
            # If no tab tags, check the overall content
            print("- No [tab] tags found, analyzing overall content")
            
            # Check for chord line followed by lyric line
            lines = content.strip().split('\n')
            paired_pattern = False
            for i in range(len(lines) - 1):
                if '[ch]' in lines[i] and lines[i+1].strip() and '[ch]' not in lines[i+1]:
                    paired_pattern = True
                    print(f"\nExample chord line: {lines[i]}")
                    print(f"Example lyric line: {lines[i+1]}")
                    break
            
            if paired_pattern:
                print("- Common pattern: Chord line followed by lyric line")
            else:
                print("- No clear chord-line/lyric-line pattern found")
        
        # Report findings on likely format structure
        print("\n=== FORMAT CONCLUSION ===")
        if tab_matches:
            print("This song uses [tab] tags to enclose chord-lyric sections")
            
            chord_line_lyric_line = any(
                '[ch]' in lines[i] and i+1 < len(lines) and lines[i+1].strip() and '[ch]' not in lines[i+1]
                for section in tab_matches
                for lines in [section.strip().split('\n')]
                for i in range(len(lines) - 1)
            )
            
            inline_chords = any(
                '[ch]' in line and re.sub(chord_pattern, '', line).strip()
                for section in tab_matches
                for line in section.strip().split('\n')
            )
            
            if chord_line_lyric_line:
                print("The primary format is: chord line followed by lyric line")
                
                # Find and show a good example
                for section in tab_matches:
                    lines = section.strip().split('\n')
                    for i in range(len(lines) - 1):
                        if '[ch]' in lines[i] and lines[i+1].strip() and '[ch]' not in lines[i+1]:
                            print("\nExample:")
                            print(f"Chord line: {lines[i]}")
                            print(f"Lyric line: {lines[i+1]}")
                            break
                    else:
                        continue
                    break
            elif inline_chords:
                print("The primary format is: chords embedded inline with lyrics")
                
                # Find and show a good example
                for section in tab_matches:
                    lines = section.strip().split('\n')
                    for line in lines:
                        if '[ch]' in line and re.sub(chord_pattern, '', line).strip():
                            print(f"\nExample: {line}")
                            break
                    else:
                        continue
                    break
            else:
                print("The format is unclear, but both chords and lyrics were found")
        else:
            print("No clear [tab] sections found, but the content includes chord tags")
            
            lines = content.strip().split('\n')
            chord_line_lyric_line = any(
                '[ch]' in lines[i] and i+1 < len(lines) and lines[i+1].strip() and '[ch]' not in lines[i+1]
                for i in range(len(lines) - 1)
            )
            
            inline_chords = any(
                '[ch]' in line and re.sub(chord_pattern, '', line).strip()
                for line in lines
            )
            
            if chord_line_lyric_line:
                print("The primary format is: chord line followed by lyric line")
            elif inline_chords:
                print("The primary format is: chords embedded inline with lyrics")
            else:
                print("The format is unclear, but chord tags were found")
        
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fetch_chords_analyze_lyrics.py 'song name'")
        sys.exit(1)
    
    song_name = " ".join(sys.argv[1:])
    analyze_chord_page(song_name) 