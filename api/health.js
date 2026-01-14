import fetch from 'node-fetch';

export default async function handler(req, res) {
    const { debug, symbol = 'AAPL' } = req.query;
    
    // 如果有debug参数，返回Alpha Vantage原始数据
    if (debug === 'true') {
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        const apiBaseUrl = 'https://www.alphavantage.co/query';
        const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        return res.json(data);
    }
    
    // 正常的健康检查
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
}