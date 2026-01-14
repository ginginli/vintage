import fetch from 'node-fetch';

export default async function handler(req, res) {
    try {
        const { symbol = 'AAPL' } = req.query;
        
        const apiBaseUrl = process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query';
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        
        const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        // 返回原始数据以便调试
        return res.json({
            success: true,
            symbol,
            url: url.replace(apiKey, 'HIDDEN'),
            responseKeys: Object.keys(data),
            hasMetaData: !!data['Meta Data'],
            hasTimeSeries: !!data['Time Series (Daily)'],
            metaData: data['Meta Data'],
            firstDateSample: data['Time Series (Daily)'] ? Object.keys(data['Time Series (Daily)'])[0] : null,
            rawResponse: data
        });
        
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
}
