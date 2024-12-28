# Project Flows Documentation

## Overview
The system implements two distinct flows for handling rebate program data retrieval:
1. Direct Cache Flow
2. Full Analysis Flow

## Flow Router
The `project-flow-router.mjs` manages which flow is active at any given time. This allows for dynamic switching between flows based on requirements.

### Router Configuration
```javascript
// Switch to cache-only mode
projectFlowRouter.setActiveFlow('direct-cache');

// Switch to full analysis mode
projectFlowRouter.setActiveFlow('full-analysis');
```

## 1. Direct Cache Flow

### Purpose
Provides fast, cache-only access to previously analyzed rebate programs. No analysis or external API calls are made.

### Characteristics
- **Speed**: Fastest possible response time
- **Resource Usage**: Minimal, only cache access
- **External Dependencies**: None after cache initialization

### Process
1. Receive request with category and county
2. Generate hash based on inputs
3. Check cache for matching hash
4. Return results:
   - If found: Return cached data
   - If not found: Return "not found" message
   - Never proceeds to analysis

### Response Format
```javascript
// Cache Hit
{
    success: true,
    found: true,
    data: {
        // Cached program data
    }
}

// Cache Miss
{
    success: true,
    found: false,
    message: "No cached data found for [category] in [county] County"
}
```

## 2. Full Analysis Flow

### Purpose
Provides comprehensive rebate program analysis, including fresh searches and AI processing when needed.

### Characteristics
- **Completeness**: Most thorough results
- **Resource Usage**: Higher, uses multiple external services
- **External Dependencies**: Google Search API, OpenAI API

### Process
1. Receive request with category, county, and query
2. Generate hash and check cache first
3. If cache hit: Return cached data immediately
4. If cache miss:
   - Perform Google searches
   - Process search results
   - Use OpenAI for analysis
   - Cache the results
   - Return complete analysis

### Response Format
```javascript
// Cache Hit
{
    success: true,
    source: 'cache',
    data: {
        // Cached program data
    }
}

// Fresh Analysis
{
    success: true,
    source: 'analysis',
    data: {
        // Newly analyzed program data
    }
}
```

## Implementation Files

### Core Components
- `project-flow-router.mjs`: Flow management and routing
- `direct-retrieval.mjs`: Direct cache retrieval implementation
- `analyze.mjs`: Full analysis implementation

### Supporting Services
- `sheets-cache.mjs`: Google Sheets based caching system
- `hash-verification.mjs`: Hash generation and verification

## Best Practices
1. **Flow Selection**
   - Use Direct Cache Flow when speed is critical
   - Use Full Analysis Flow when fresh data is required

2. **Cache Management**
   - Cache all successful analysis results
   - Include timestamp with cached data
   - Implement cache invalidation strategy

3. **Error Handling**
   - Provide clear error messages
   - Include source of error (cache/analysis)
   - Log all errors for debugging

4. **Performance Monitoring**
   - Track cache hit/miss rates
   - Monitor analysis response times
   - Log flow usage patterns
