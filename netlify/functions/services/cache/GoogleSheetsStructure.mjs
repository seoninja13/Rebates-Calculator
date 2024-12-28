export class GoogleSheetsStructure {
    constructor(cacheInstance) {
        this.cache = cacheInstance;
    }

    async ensureStructure() {
        console.log('Ensuring Sheet Structure');

        try {
            const sheets = await this.cache.sheets.spreadsheets.get({
                spreadsheetId: this.cache.spreadsheetId
            });

            const cacheSheet = sheets.data.sheets.find(s => 
                s.properties.title === 'Cache'
            );

            if (!cacheSheet) {
                await this.createCacheSheet();
            }

            await this.ensureHeaders();
            
        } catch (error) {
            console.error('Failed to ensure sheet structure:', error);
            throw error;
        }
    }

    async createCacheSheet() {
        await this.cache.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.cache.spreadsheetId,
            resource: {
                requests: [{
                    addSheet: {
                        properties: {
                            title: 'Cache'
                        }
                    }
                }]
            }
        });
    }

    async ensureHeaders() {
        const headers = [
            'Query',
            'Level',
            'Google Results',
            'OpenAI Analysis',
            'Timestamp',
            'Hash'
        ];

        await this.cache.sheets.spreadsheets.values.update({
            spreadsheetId: this.cache.spreadsheetId,
            range: 'Cache!A1:F1',
            valueInputOption: 'RAW',
            resource: {
                values: [headers]
            }
        });
    }
}
