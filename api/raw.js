import fetch from 'node-fetch';

export default async function handler(req, res) {
    const { symbol = 'AAPL' } = req.query;
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    const apiBaseUrl = 'https://www.alphavantage.co/query';
    
    const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    // 直接返回原始数据
    return res.json(data);
}
