import fetch from 'node-fetch';

export default async function handler(req, res) {
    try {
        const { symbol = 'AAPL', raw } = req.query;
        
        // 检查环境变量
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        const apiBaseUrl = process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query';
        
        const hasApiKey = !!apiKey;
        const apiKeyLength = apiKey ? apiKey.length : 0;
        const apiKeyPreview = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : 'N/A';
        
        // 如果请求原始数据
        if (raw === 'true' && hasApiKey) {
            const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
            const response = await fetch(url);
            const data = await response.json();
            
            return res.json({
                success: true,
                symbol,
                responseKeys: Object.keys(data),
                hasMetaData: !!data['Meta Data'],
                hasTimeSeries: !!data['Time Series (Daily)'],
                metaData: data['Meta Data'],
                firstDateSample: data['Time Series (Daily)'] ? Object.keys(data['Time Series (Daily)'])[0] : null,
                sampleData: data['Time Series (Daily)'] ? data['Time Series (Daily)'][Object.keys(data['Time Series (Daily)'])[0]] : null,
                rawResponse: data
            });
        }
        
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
            timestamp: new Date().toISOString(),
            tip: 'Add ?raw=true&symbol=AAPL to see raw API response'
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}
