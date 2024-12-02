import fetch from 'node-fetch';

export default async function handler(req, res) {
    try {
        const { symbol } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ 
                error: '请提供股票代码' 
            });
        }

        // ✅ 使用环境变量存储 API 基础 URL
        const apiBaseUrl = process.env.ALPHA_VANTAGE_BASE_URL || 'https://www.alphavantage.co/query';
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        
        const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${apiKey}`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data['Error Message']) {
            throw new Error('无效的股票代码或API错误');
        }

        if (data['Note']) {
            throw new Error('API调用频率超限，请稍后再试');
        }

        const timeSeriesData = data['Time Series (Daily)'];
        if (!timeSeriesData) {
            throw new Error('未获取到股票数据');
        }

        // 转换数据格式
        const stockData = Object.entries(timeSeriesData)
            .slice(0, 250)
            .map(([date, values]) => ({
                date,
                open: Number(values['1. open']),
                high: Number(values['2. high']),
                low: Number(values['3. low']),
                close: Number(values['4. close']),
                volume: Number(values['5. volume'])
            }))
            .reverse();

        return res.json({ 
            success: true,
            stockData 
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message || '服务器内部错误'
        });
    }
} 