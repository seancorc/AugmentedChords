#!/usr/bin/env python3
import sys
import requests
import urllib.parse
from bs4 import BeautifulSoup

def analyze_website(song_name):
    """Fetch and analyze the HTML structure of Ultimate Guitar website"""
    print(f"Analyzing Ultimate Guitar search for: {song_name}")
    
    # Properly URL encode the song name
    url_song_name = urllib.parse.quote_plus(song_name)
    
    # Create direct search URL for Ultimate Guitar
    search_url = f"https://www.ultimate-guitar.com/search.php?search_type=title&value={url_song_name}"
    print(f"Search URL: {search_url}")
    
    # Set headers to mimic a browser
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }
    
    # Fetch the search page
    response = requests.get(search_url, headers=headers)
    
    if response.status_code != 200:
        print(f"Failed to fetch search results: {response.status_code}")
        return
    
    # Print response headers for debugging
    print("\nResponse Headers:")
    for header, value in response.headers.items():
        print(f"{header}: {value}")
    
    # Print the first 1000 characters of the HTML
    print("\nHTML Preview (first 1000 chars):")
    print(response.text[:1000])
    
    # Parse the HTML
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Print the page title
    title = soup.title.string if soup.title else "No title found"
    print(f"\nPage Title: {title}")
    
    # Print all script tags - look for any data loading or API calls
    print("\nScript Tags:")
    scripts = soup.find_all('script')
    print(f"Found {len(scripts)} script tags")
    
    for i, script in enumerate(scripts[:5]):  # Print first 5 scripts
        src = script.get('src', '')
        if src:
            print(f"Script {i+1} src: {src}")
        else:
            content = script.string
            if content:
                # Print first 100 chars
                print(f"Script {i+1} content preview: {content[:100]}")
    
    # Look for any links that might be chord tabs
    print("\nPotential Chord Links:")
    all_links = soup.find_all('a', href=True)
    chord_links = []
    
    for link in all_links:
        href = link.get('href', '')
        if '/tab/' in href and 'ultimate-guitar.com' in href:
            text = link.text.strip()
            chord_links.append((href, text))
    
    print(f"Found {len(chord_links)} potential chord links")
    for i, (href, text) in enumerate(chord_links[:10]):  # Show first 10
        print(f"Link {i+1}: {href} - {text}")
    
    # Look for any data attributes or hidden data
    print("\nSearching for data elements:")
    data_elements = soup.select('[data-content]')
    print(f"Found {len(data_elements)} elements with data-content attributes")
    
    for i, elem in enumerate(data_elements[:5]):
        data_attr = elem.get('data-content')
        print(f"Element {i+1} data-content: {data_attr}")
    
    # Examine all div IDs
    print("\nDiv IDs:")
    divs_with_ids = [div for div in soup.find_all('div') if div.get('id')]
    print(f"Found {len(divs_with_ids)} divs with IDs")
    
    for i, div in enumerate(divs_with_ids[:10]):
        print(f"Div {i+1} ID: {div.get('id')}")
    
    # Look for JSON data in the page
    print("\nSearching for JSON data in script tags:")
    json_scripts = [s for s in scripts if s.string and ('__INITIAL_STATE__' in s.string or 'window.__REDUX_STATE__' in s.string)]
    
    for i, script in enumerate(json_scripts):
        content = script.string
        print(f"Found potential JSON data in script {i+1}:")
        # Print first 200 chars of the JSON data
        if content:
            json_start = max(content.find('{'), 0)
            print(content[json_start:json_start+200] + "...")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python fetch_chords_analyze.py 'song name'")
        sys.exit(1)
    
    song_name = " ".join(sys.argv[1:])
    analyze_website(song_name) 