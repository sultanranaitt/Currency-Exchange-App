// Import required modules
import AWS from 'aws-sdk';
import axios from 'axios';

// Configure AWS DynamoDB
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = 'ExchangeRates';
const ECB_API_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

// Function to fetch exchange rates from ECB
export async function fetchExchangeRates(event) {
    try {
        const response = await axios.get(ECB_API_URL);
        const rates = parseECBData(response.data);

        const currentDate = new Date().toISOString().split('T')[0];

        // Save rates to DynamoDB
        const putParams = {
            TableName: TABLE_NAME,
            Item: {
                date: currentDate,
                rates: rates,
            },
        };

        await dynamoDB.put(putParams).promise();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Exchange rates fetched and stored successfully.' }),
        };
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch exchange rates.' }),
        };
    }
}

// Function to expose API endpoint
export async function getExchangeRates(event) {
    try {
        const currentDate = new Date().toISOString().split('T')[0];
        const previousDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // Batch get current and previous rates
        const batchGetParams = {
            RequestItems: {
                [TABLE_NAME]: {
                    Keys: [{ date: currentDate }, { date: previousDate }],
                },
            },
        };

        const results = await dynamoDB.batchGet(batchGetParams).promise();
        const items = results.Responses[TABLE_NAME];

        const currentRates = items.find((item) => item.date === currentDate)?.rates || {};
        const previousRates = items.find((item) => item.date === previousDate)?.rates || {};

        // Calculate changes
        const changes = {};
        for (const [currency, rate] of Object.entries(currentRates)) {
            const previousRate = previousRates[currency] || 0;
            changes[currency] = {
                currentRate: rate,
                change: previousRate ? (rate - previousRate).toFixed(4) : 'N/A',
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                date: currentDate,
                rates: changes,
            }),
        };
    } catch (error) {
        console.error('Error retrieving exchange rates:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to retrieve exchange rates.' }),
        };
    }
}

// Utility function to parse ECB XML data
function parseECBData(xml) {
    const rates = {};
    const regex = /<Cube currency="(\w+)" rate="([0-9.]+)"\/>/g;
    let match;

    while ((match = regex.exec(xml)) !== null) {
        rates[match[1]] = parseFloat(match[2]);
    }

    return rates;
}
