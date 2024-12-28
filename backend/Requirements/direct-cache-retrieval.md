# Direct Cache Retrieval Requirements

## Overview
The Direct Cache Retrieval system provides functionality to retrieve and display cached rebate data without performing new Google searches or OpenAI requests. This system interfaces directly with the existing Google Sheets cache implementation.

## Core Requirements

### 1. Cache-Only Operation
- MUST ONLY retrieve data from existing cache
- NO new Google searches
- NO OpenAI API calls
- NO external API calls of any kind
- Must integrate with existing GoogleSheetsCache system
- Must initialize cache connection before any operations
- Must handle cache connection failures gracefully

### 2. Data Retrieval Flow
- Input Parameters:
  - Level (Federal, State, County) - Column B in cache
  - Category (Solar, HVAC, etc.) - Used to extract specific program information from Column D
  - County name (when Level is County)

- Hash Generation Formula:
  ```javascript
  // Federal Level
  hash = md5("FEDERAL::ALL")
  // expectedHash: '97dd6bb017f636fd49043c72e5a4240d'

  // State Level
  hash = md5("STATE::CALIFORNIA::ALL")
  // expectedHash: '6afa817149bc61f1b4e324530c2e9751'

  // County Level
  hash = md5("COUNTY::${countyName}::ALL")
  // Example for Alameda: 'da9857730a363cdee68bae857012f34e'
  ```

- Cache Check:
  1. Generate hash using exact formula for Level
  2. Find matching hash in cache
  3. If found, extract Category-specific program information from Column D JSON
  4. If not found, return "No data available"

### 3. Response Format
- Success Case:
  ```javascript
  {
    success: true,
    data: {
      results: Array,  // Category-specific program information from Column D
      timestamp: string,
      level: string,
      query: string
    }
  }
  ```
- Not Found Case:
  ```javascript
  {
    success: true,
    data: null,
    message: "No cached data available"
  }
  ```
- Error Case:
  ```javascript
  {
    success: false,
    error: string  // Error message
  }
  ```

### 4. User Interface
- Show cached results with clear "Cached Data" indicator
- If no cache found, display user-friendly message: "No data available for this search"
- No loading states needed (should be instant as only checking cache)

### 5. Error Handling
- Must handle cache connection failures gracefully
- Must provide clear error messages for:
  - Cache initialization failures
  - Invalid input parameters
  - Missing required parameters
  - Cache connection issues
  - Malformed cache data

### 6. API Endpoint
- Path: /.netlify/functions/direct-retrieval
- Method: POST
- Request Body:
  ```javascript
  {
    category: "Federal" | "State" | "County",
    county?: string  // Required if category is "County"
  }
  ```
- Status Codes:
  - 200: Success (with or without data)
  - 400: Invalid input parameters
  - 500: System error (cache failure, etc)

## Implementation Plan

### Phase 1: Cache Integration
1. Create new DirectCacheRetrieval class
2. Implement hash generation using exact formulas
3. Add cache lookup functionality
4. Add category-specific data extraction

### Phase 2: Endpoint Updates
1. Modify analyze endpoint to use DirectCacheRetrieval
2. Add bypass condition for Google/OpenAI
3. Ensure proper error handling
4. Maintain existing response format

### Phase 3: Testing
1. Test hash generation for all levels
2. Verify cache hits/misses
3. Validate category extraction
4. Check response formatting

### Phase 4: Integration
1. Connect to UI
2. Verify display formatting
3. Test end-to-end flow
4. Document any UI changes needed

## Implementation Details

### Class Structure
```javascript
class DirectCacheRetrieval {
    constructor()
    async initialize()
    async retrieveFromCache(level, county, category)
    formatForDisplay(cacheResponse)
}
```

### Integration Points
- Integrates with `sheets-cache.mjs`
- Uses existing utility functions for normalization
- Maintains compatibility with current caching patterns

## Example Flows

### Federal Level Example
```javascript
1. Input: Level="Federal", Category="Solar"
2. Generate hash = md5("FEDERAL::ALL")
   // Expected: '97dd6bb017f636fd49043c72e5a4240d'
3. Find row with matching hash
4. If found:
   - Get JSON from Column D
   - Extract Solar program information
   - Return program data for UI display
```

### State Level Example
```javascript
1. Input: Level="State", Category="HVAC"
2. Generate hash = md5("STATE::CALIFORNIA::ALL")
   // Expected: '6afa817149bc61f1b4e324530c2e9751'
3. Find row with matching hash
4. If found:
   - Get JSON from Column D
   - Extract HVAC program information
   - Return program data for UI display
```

### County Level Example
```javascript
1. Input: Level="County", County="Alameda", Category="Solar"
2. Generate hash = md5("COUNTY::ALAMEDA::ALL")
   // Expected: 'da9857730a363cdee68bae857012f34e'
3. Find row with matching hash
4. If found:
   - Get JSON from Column D
   - Extract Solar program information
   - Return program data for UI display
```
