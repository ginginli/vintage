export default async function handler(req, res) {
    try {
        // 检查环境变量
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        const apiBaseUrl = process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query';
        
        const hasApiKey = !!apiKey;
        const apiKeyLength = apiKey ? apiKey.length : 0;
        const apiKeyPreview = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'N/A';
        
        // 测试API调用
        let apiTestResult = 'Not tested';
        let apiResponse = null;
        
        if (hasApiKey) {
            try {
                const testUrl = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=AAPL&outputsize=compact&apikey=${apiKey}`;
                const response = await fetch(testUrl);
                apiResponse = await response.json();
                
                if (apiResponse['Error Message']) {
                    apiTestResult = 'API Error: ' + apiResponse['Error Message'];
                } else if (apiResponse['Note']) {
                    apiTestResult = 'Rate Limit: ' + apiResponse['Note'];
                } else if (apiResponse['Time Series (Daily)']) {
                    apiTestResult = 'Success - API is working';
                } else {
                    apiTestResult = 'Unexpected response structure';
                }
            } catch (error) {
                apiTestResult = 'Fetch Error: ' + error.message;
            }
        }
        
        return res.status(200).json({
            success: true,
            environment: {
                hasApiKey,
                apiKeyLength,
                apiKeyPreview,
                apiBaseUrl
            },
            apiTest: {
                result: apiTestResult,
                responseKeys: apiResponse ? Object.keys(apiResponse) : []
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}
