# Cache Service Requirements

## 1. Hash Generation Patterns
Must follow these exact patterns:
- Federal level: `"Federal::all"`
- State level: `"State::all"`
- County level: `"County:${countyName}:all"`

## 2. Query Format Patterns
Must use these exact queries:
- Federal: `"federal energy rebate programs california, US government energy incentives california"`
- State: `"California state energy rebate programs, California state government energy incentives"`
- County: `"${countyName} County energy rebate programs, ${countyName} County energy incentives"`

## 3. Timestamp Format
Must follow this exact format:
- Format: `"MM/DD/YYYY, HH:MM:SS AM/PM"`
- Example: `"12/26/2024, 09:05:58 AM"`
- Must be in PST timezone
- Must include leading zeros for month/day

## 4. Google Sheets Headers
Must match these exact column headers:
```
Query	Level	Google Results	openAI Analysis	Timestamp	Hash	Google Search-Cache	OpenAI Search-Cache
```

## 5. Cache Row Structure
Must match this exact structure:
```javascript
{
  query: "California State energy rebate programs",
  level: "State",
  googleResults: [...],  // Array of Google search results
  openaiAnalysis: [...], // Array of analyzed programs
  timestamp: "12/26/2024, 09:05:58 AM",
  hash: "md5_hash_of_State::all",
  googleSearchCache: "Search",
  openaiSearchCache: "Search"
}
```

## 6. Search Flow Requirements
1. Frontend initiates search with level/category
2. API receives request
3. Check cache first with exact hash pattern
4. If cache miss:
   - Make Google search with exact query format
   - Process with OpenAI
   - Store in cache with exact format
5. Return results to frontend

## 7. Program Data Structure
Each program must include:
- programName: Name of the program
- programType: Type (Rebate, Grant, Tax Credit, Low-Interest Loan)
- summary: Brief description
- amount: Dollar amount or range
- eligibleProjects: List of eligible improvements/projects
- eligibleRecipients: Who can apply
- geographicScope: Geographic coverage
- requirements: List of requirements
- applicationProcess: How to apply
- websiteLink: Program website
- deadline: Application deadline if any
- contactInfo: Contact information
- processingTime: Expected processing time

## 8. OpenAI Processing Rules
1. Only include programs that are CURRENTLY active
2. Verify the program applies to the specified geographic level
3. Include specific dollar amounts when available
4. Break down amounts by project type when possible
5. Ensure all links are working and direct
6. Include contact information when available
7. List specific eligible improvements
8. Note any income requirements or restrictions
