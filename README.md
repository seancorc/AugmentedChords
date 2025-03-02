# Guitar Chord Scraper

A Python script for extracting chord data from Ultimate Guitar.

## Overview

This project provides a script that scrapes chord data for songs from Ultimate Guitar. It extracts the chord progressions, key, artist information, and organizes the chords into measures.

## Features

- Searches for songs on Ultimate Guitar by title
- Extracts chord progressions, song title, artist name, and key
- Organizes chords into measures (assuming 4/4 time)
- Supports error handling and logging
- Returns structured JSON data

## Installation

1. Clone this repository
2. Install required packages:

```bash
pip install requests beautifulsoup4 python-dotenv
```

## Usage

Run the script from the command line, providing a song name as an argument:

```bash
python fetch_chords_scrape.py "Wonderwall"
```

The script will return a JSON object with the following structure:

```json
{
  "success": true,
  "song_title": "Wonderwall",
  "artist": "Oasis",
  "key": "F#m",
  "chords": [
    ["F#m7", "A", "Esus4", "B7sus4"],
    ["F#m7", "A", "Esus4", "B7sus4"],
    // More measures...
  ]
}
```

## How It Works

The script:

1. Searches Ultimate Guitar for the requested song
2. Identifies the first chord result from the search data
3. Fetches the chord page for that result
4. Extracts JSON data embedded in the page
5. Processes the chord content into measures
6. Returns structured data with song information and chords

## Error Handling

The script handles various error scenarios:
- HTTP request failures
- Missing chord data
- JSON parsing errors
- Unable to find chord results

Error responses include:
```json
{
  "success": false,
  "error": "Error message",
  "chords": []
}
```

## Implementation Notes

The script uses:
- BeautifulSoup for HTML parsing
- Requests for HTTP requests
- Regular expressions to extract chords from content
- JSON parsing to extract data from the page

## License

MIT
    