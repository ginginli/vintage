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
        
        // 检查API密钥是否存在
        if (!apiKey) {
            console.error('Missing ALPHA_VANTAGE_API_KEY environment variable');
            return res.status(500).json({ 
                success: false,
                error: '服务器配置错误：缺少API密钥。请联系管理员配置ALPHA_VANTAGE_API_KEY环境变量。'
            });
        }
        
        const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${apiKey}`;
        
        console.log(`Fetching data for symbol: ${symbol}`);
        const response = await fetch(url);
        const data = await response.json();

        console.log('API Response keys:', Object.keys(data));

        if (data['Error Message']) {
            return res.status(400).json({ 
                success: false,
                error: '无效的股票代码: ' + symbol
            });
        }

        if (data['Note']) {
            return res.status(429).json({ 
                success: false,
                error: 'API调用频率超限，请稍后再试（每分钟最多5次，每天最多500次）'
            });
        }

        const timeSeriesData = data['Time Series (Daily)'];
        if (!timeSeriesData) {
            console.error('No time series data found. Response:', JSON.stringify(data, null, 2));
            return res.status(500).json({ 
                success: false,
                error: '未获取到股票数据',
                debug: {
                    responseKeys: Object.keys(data),
                    hasMetaData: !!data['Meta Data'],
                    hasTimeSeries: !!data['Time Series (Daily)']
                }
            });
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

        console.log(`Successfully fetched ${stockData.length} data points for ${symbol}`);

        return res.json({ 
            success: true,
            stockData 
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message || '服务器内部错误',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
} 