# Development Journey

This document describes the process of developing the Ultimate Guitar chord scraper, including the challenges we faced and how we overcame them.

## Initial Approach and Challenges

### Challenge 1: Standard HTTP Requests

Our initial approach was to use standard HTTP requests with the `requests` library to fetch the HTML from Ultimate Guitar and parse it with BeautifulSoup. However, we quickly discovered that the chord content was not present in the initial HTML response, as the site uses React to load content dynamically via JavaScript.

```python
# Initial approach - didn't work
response = requests.get(search_url, headers=headers)
soup = BeautifulSoup(response.text, 'html.parser')
# Couldn't find any chord links or content this way
```

This failed because BeautifulSoup can only parse the static HTML that's returned, not the content that's added later by JavaScript.

### Challenge 2: JavaScript Rendering with requests-html

We then tried to use the `requests-html` library, which can render JavaScript. We attempted both synchronous and asynchronous approaches:

```python
# Synchronous approach
session = HTMLSession()
response = session.get(search_url)
response.html.render()  # Execute JavaScript

# Asynchronous approach
session = AsyncHTMLSession()
response = await session.get(search_url)
await response.html.render()  # Execute JavaScript
```

We encountered several issues:
1. Browser installation problems with `pyppeteer` (which `requests-html` uses internally)
2. Event loop conflicts with `AsyncHTMLSession`
3. Browser closing unexpectedly during rendering

## Successful Approach: JSON Extraction

After analyzing the HTML structure more carefully, we discovered that Ultimate Guitar embeds all the data we need in a JSON object within a `data-content` attribute in the HTML:

1. We first fetch the search page:
```python
response = requests.get(search_url, headers=headers)
```

2. Extract the JSON data from the `data-content` attribute:
```python
soup = BeautifulSoup(response.text, 'html.parser')
data_content_element = soup.find(attrs={"data-content": True})
data_content = json.loads(data_content_element["data-content"])
```

3. Navigate the JSON structure to find chord results:
```python
store_data = data_content.get("store", {})
page_data = store_data.get("page", {}).get("data", {})
results = page_data.get("results", [])
```

4. For the selected chord result, fetch the chord page and extract its embedded JSON:
```python
chord_response = requests.get(tab_url, headers=headers)
chord_soup = BeautifulSoup(chord_response.text, 'html.parser')
chord_data_element = chord_soup.find(attrs={"data-content": True})
chord_data_content = json.loads(chord_data_element["data-content"])
```

5. Process the chord content:
```python
content = tab_view.get("wiki_tab", {}).get("content", "")
chord_pattern = r'\[ch\](.*?)\[/ch\]'
chords = re.findall(chord_pattern, content)
```

## Key Learnings

1. **Inspect before coding**: Taking time to understand the website structure saved significant development time.

2. **Static vs. Dynamic content**: Understanding how modern websites load data is crucial for effective web scraping.

3. **Multiple solutions**: Having different approaches (static scraping, JavaScript rendering, JSON extraction) gives flexibility.

4. **Error handling**: Robust error handling is essential for web scraping, as websites may change structure or return unexpected responses.

5. **Progressive enhancement**: Start with simple solutions and only add complexity when necessary.

## Future Improvements

1. Implement caching to reduce the number of requests to Ultimate Guitar
2. Add support for different time signatures (not just 4/4)
3. Extract additional data like strumming patterns, capo position, and difficulty
4. Add rate limiting to avoid being blocked by Ultimate Guitar
5. Implement a more sophisticated result selection algorithm (currently picks the first chord result) 