# Rebates Calculator Logging System Documentation


## Overview


The logging system provides a detailed, real-time view of data flow through the application, from frontend to backend services and back. All logs are visible in the Chrome Console with expandable objects for detailed inspection.


## Log Flow Steps


### 1. Frontend Initiates Search


```javascript
Frontend → API | Query: "[query]" | Category: [category]
{
    query: string,
    category: string,
    timestamp: ISO string,
    type: 'outgoing_request'
}
```

### 2. API Receives Request


```javascript
Frontend → API | Received | Query: "[query]" | Category: [category]
{
    query: string,
    category: string,
    timestamp: ISO string,
    type: 'incoming_request'
}
```

### 3. Cache Check


```javascript
API → Cache | Checking | Query: "[query]" | Category: [category]
{
    query: string,
    category: string,
    hash: string,
    timestamp: ISO string,
    type: 'cache_check'
}
```

### 4. Cache Response


```javascript
Cache → API | Status: [hit/miss] | Query: "[query]"
{
    status: 'hit' | 'miss',
    data?: {
        googleResults: any[],
        openaiAnalysis: any[]
    },
    timestamp: ISO string,
    type: 'cache_response'
}
```

### 5. API to Google Search (If Cache Miss)


```javascript
API → Google | Searching | Query: "[query]"
{
    query: string,
    searchUrl: string,
    timestamp: ISO string,
    type: 'google_request'
}
```

### 6. Google Search to API


```javascript
Google → API | Results: [count] | Total: [total]
{
    totalResults: number,
    returnedResults: number,
    searchTime: number,
    items: [{
        title: string,
        link: string,
        snippet: string
    }],
    timestamp: ISO string,
    type: 'google_response'
}
```

### 7. API to OpenAI (If Cache Miss)


```javascript
API → OpenAI | Analyzing | Results: [count] | Category: [category]
{
    resultsCount: number,
    category: string,
    model: string,
    timestamp: ISO string,
    type: 'openai_request'
}
```

### 8. OpenAI to API


```javascript
OpenAI → API | Programs Found: [count] | Category: [category]
{
    programsFound: number,
    programs: array,
    category: string,
    timestamp: ISO string,
    type: 'openai_response'
}
```

### 9. Cache Update (If Cache Miss)


```javascript
API → Cache | Updating | Query: "[query]" | Category: [category]
{
    query: string,
    category: string,
    googleResults: any[],
    openaiAnalysis: any[],
    timestamp: ISO string,
    type: 'cache_update'
}
```

### 10. API to Frontend


```javascript
API → Frontend | Sending | Programs: [count] | Category: [category]
{
    programsCount: number,
    category: string,
    programs: array,
    source: 'cache' | 'fresh',
    timestamp: ISO string,
    type: 'outgoing_response'
}
```

## Error Logging


Errors maintain the same flow format but include error details:
```javascript
[Source] → [Destination] | Error | [message] | Category: [category]
{
    error: string,
    category: string,
    stack: string,
    timestamp: ISO string,
    type: 'error_response'
}
```

## Cache System


### Google Sheets Structure


```javascript
{
    spreadsheetId: '1lzUS63kvhh_ICyeZhdDs46fk7l72r0ulZ5tLSKNjcJc',
    sheetName: 'Cache',
    columns: [
        'Query',              // Search query string
        'Category',           // Federal/State/County
        'Results',            // JSON stringified data
        'Timestamp (PST)',    // Pacific Standard Time
        'Hash',               // Unique identifier (query+category)
        'Google Search-Cache', // Cache OR Search results
        'OpenAI Search-Cache'  // Cache OR Search results
    ]
}
```

### Cache Operations


1. **Read Operation**


```javascript
const cacheCheck = {
    query: string,
    category: 'federal' | 'state' | 'county',
    hash: generateHash(query + category)
};
```

2. **Write Operation**


```javascript
const cacheEntry = {
    query: string,
    category: string,
    results: JSON.stringify({
        googleResults: any[],
        openaiAnalysis: any[]
    }),
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
    hash: string,
    source: {
        google: 'Cache' | 'Search',
        openai: 'Cache' | 'Search'
    }
};
```

## Implementation Details


### Server-Side (server.js)


1. Uses Server-Sent Events (SSE) for real-time logging
2. Maintains a list of connected clients
3. Sends structured log objects through SSE

```javascript
function sendLogToClient(message, details = null) {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ message, details })}\n\n`);
    });
}
```

### Frontend (openai-analyzer.js)


1. Connects to SSE endpoint for real-time logs
2. Formats logs with colors in console
3. Displays expandable objects

```javascript
setupLogging() {
    const eventSource = new EventSource('/api/logs');
    eventSource.onmessage = (event) => {
        const { message, details } = JSON.parse(event.data);
        if (details) {
            console.log('%c' + message, 'color: #2196F3; font-weight: bold', details);
        } else {
            console.log('%c' + message, 'color: #2196F3; font-weight: bold');
        }
    };
}
```

## Console Colors


- Regular logs: Blue (#2196F3)
- Success/Outgoing: Green (#4CAF50)
- Cache Operations: Purple (#9C27B0)
- Errors: Red (#f44336)

## Benefits


1. Real-time visibility of data flow
2. Cache operation tracking
3. Expandable objects for detailed inspection
4. Consistent formatting across all services
5. Timestamps for performance tracking
6. Type information for easy filtering
7. Color coding for quick visual identification

## Usage


1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Perform a search in the application
4. Expand log objects by clicking arrows
5. Filter by type using console filters
6. Monitor cache hits/misses in purple
