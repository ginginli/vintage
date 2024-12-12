import fetch from 'node-fetch';

export default async function handler(req, res) {
    try {
        const { symbol } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ 
                error: '请提供股票代码' 
            });
        }

        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        if (!apiKey) {
            throw new Error('未配置 API 密钥');
        }

        const apiBaseUrl = 'https://www.alphavantage.co/query';
        const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${apiKey}`;
        
        console.log('Requesting data for symbol:', symbol);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('API Response:', {
            status: response.status,
            hasError: !!data['Error Message'],
            hasNote: !!data['Note'],
            hasTimeSeriesData: !!data['Time Series (Daily)']
        });

        if (data['Error Message']) {
            console.error('Alpha Vantage API error:', data['Error Message']);
            throw new Error(`股票代码 ${symbol} 无效或不存在`);
        }

        if (data['Note']) {
            console.error('Alpha Vantage API limit:', data['Note']);
            throw new Error('API 调用频率超限，请等待1分钟后重试');
        }

        const timeSeriesData = data['Time Series (Daily)'];
        if (!timeSeriesData) {
            console.error('No time series data received');
            throw new Error('未获取到股票数据，请检查股票代码是否正确');
        }

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
            error: error.message || '服务器内部错误',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
} 