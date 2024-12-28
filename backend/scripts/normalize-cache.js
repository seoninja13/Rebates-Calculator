import { google } from 'googleapis';
import crypto from 'crypto';

// Load environment variables
// dotenv.config(); // Removed this line as it's not needed in a Netlify Function

async function normalizeCache() {
    try {
        // Setup Google auth
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        const authClient = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });
        
        // Read from Cache-normalized sheet
        const sourceData = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
            range: 'Cache-normalized!A:H'
        });
        
        const rows = sourceData.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found in source sheet');
            return;
        }
        
        // Normalize each row
        const normalizedRows = rows.map(row => {
            if (row[0] === 'Query') return row; // Skip header row
            
            // Normalize query
            const query = row[0];
            const queryParts = query.toLowerCase().split(',').map(part => part.trim());
            const normalizedQuery = queryParts.length === 2 ? 
                `${queryParts[0]}, ${queryParts[1]}` : 
                query;
                
            // Normalize level
            const normalizedLevel = row[1].toLowerCase().trim();
            
            // Generate new hash
            const hashInput = `${normalizedQuery}|${normalizedLevel}`;
            const hash = crypto
                .createHash('md5')
                .update(hashInput)
                .digest('hex');
            
            console.log('\nNormalizing row:');
            console.log('Original Query:', query);
            console.log('Normalized Query:', normalizedQuery);
            console.log('Original Level:', row[1]);
            console.log('Normalized Level:', normalizedLevel);
            console.log('New Hash:', hash);
            
            // Return normalized row
            return [
                normalizedQuery,
                normalizedLevel,
                row[2], // googleResults
                row[3], // openaiAnalysis
                row[4], // timestamp
                hash,   // new hash
                row[6], // isGoogleCached
                row[7]  // isOpenAICached
            ];
        });
        
        // Write back to Cache-normalized sheet
        await sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
            range: 'Cache-normalized!A1',
            valueInputOption: 'RAW',
            resource: {
                values: normalizedRows
            }
        });
        
        console.log('\nSuccessfully normalized cache data');
        
    } catch (error) {
        console.error('Error normalizing cache:', error);
    }
}

// Create and export handler
export const handler = async (event, context) => {
    try {
        await normalizeCache();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Cache normalized successfully' })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
