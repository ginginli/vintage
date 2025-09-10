import fetch from 'node-fetch';

function calculateSimpleMovingAverage(values, period) {
    if (!Array.isArray(values) || values.length < period) {
        return [];
    }
    const result = [];
    let windowSum = 0;
    for (let i = 0; i < values.length; i++) {
        windowSum += values[i];
        if (i >= period) {
            windowSum -= values[i - period];
        }
        if (i >= period - 1) {
            result.push(windowSum / period);
        }
    }
    return result;
}

function calculateRsi(closePrices, period = 14) {
    if (!Array.isArray(closePrices) || closePrices.length <= period) {
        return [];
    }
    const gains = [];
    const losses = [];
    for (let i = 1; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        gains.push(Math.max(change, 0));
        losses.push(Math.max(-change, 0));
    }
    const rsi = new Array(period).fill(null);
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / (avgLoss || 1e-9);
        const value = 100 - 100 / (1 + rs);
        rsi.push(value);
    }
    return rsi;
}

function calculateMovingAverage(values, period) {
    return calculateSimpleMovingAverage(values, period);
}

function isTrendingUp(series, lookbackDays) {
    if (!Array.isArray(series) || series.length < lookbackDays + 1) return false;
    const recent = series.slice(-lookbackDays - 1);
    return recent[recent.length - 1] > recent[0];
}

function daysTrendingUp(series) {
    if (!Array.isArray(series) || series.length < 2) return 0;
    let count = 0;
    for (let i = series.length - 1; i > 0; i--) {
        if (series[i] > series[i - 1]) count++; else break;
    }
    return count;
}

function analyzeStockData(stockData) {
    if (!Array.isArray(stockData) || stockData.length === 0) {
        throw new Error('分析失败：无有效 stockData');
    }
    const closePrices = stockData.map(d => Number(d.close));
    const volumes = stockData.map(d => Number(d.volume));

    const ma20 = calculateMovingAverage(closePrices, 20);
    const ma50 = calculateMovingAverage(closePrices, 50);
    const ma150 = calculateMovingAverage(closePrices, 150);
    const ma200 = calculateMovingAverage(closePrices, 200);
    const rsi14 = calculateRsi(closePrices, 14);

    const lastClose = closePrices[closePrices.length - 1];
    const lastMa20 = ma20[ma20.length - 1] ?? null;
    const lastMa50 = ma50[ma50.length - 1] ?? null;
    const lastMa150 = ma150[ma150.length - 1] ?? null;
    const lastMa200 = ma200[ma200.length - 1] ?? null;
    const lastRsi = rsi14[rsi14.length - 1] ?? null;

    let signal = 'neutral';
    const reasons = [];
    if (lastMa20 && lastMa50) {
        if (lastMa20 > lastMa50) {
            signal = 'bullish';
            reasons.push('MA20 上穿 MA50，趋势偏强');
        } else if (lastMa20 < lastMa50) {
            signal = 'bearish';
            reasons.push('MA20 下穿 MA50，趋势偏弱');
        }
    }
    if (lastRsi !== null) {
        if (lastRsi > 70) {
            reasons.push('RSI 超过 70，存在超买风险');
        } else if (lastRsi < 30) {
            reasons.push('RSI 低于 30，可能超卖反弹');
        }
    }

    // 52周高低
    const last252 = stockData.slice(-252);
    const high52w = Math.max(...last252.map(d => d.high));
    const low52w = Math.min(...last252.map(d => d.low));
    const aboveLowPct = low52w ? ((lastClose - low52w) / low52w) * 100 : null; // 高于低点的比例
    const belowHighPct = high52w ? ((high52w - lastClose) / high52w) * 100 : null; // 低于高点的比例

    // 简化 RS：以过去 252 天收益相对于简单基准（等于自身最大收益）来近似
    // 注意：这非 IBD 官方 RS 排名，仅占位近似。返回趋势周数。
    const basePrice = closePrices[0];
    const totalReturn = basePrice ? (lastClose / basePrice - 1) * 100 : null;
    const rsApprox = totalReturn !== null ? Math.max(0, Math.min(100, totalReturn)) : null;
    const rsTrendWeeks = Math.floor(daysTrendingUp(closePrices) / 5);

    let avgVol = null;
    if (volumes.length >= 20) {
        const recentVol = volumes.slice(-20);
        avgVol = recentVol.reduce((a, b) => a + b, 0) / recentVol.length;
    }

    const criteria = [
        {
            id: 1,
            title: '股价高于150日与200日均线',
            pass: lastClose !== null && lastMa150 !== null && lastMa200 !== null && lastClose > lastMa150 && lastClose > lastMa200,
            detail: {
                lastClose,
                ma150: lastMa150,
                ma200: lastMa200
            }
        },
        {
            id: 2,
            title: '150日均线高于200日均线',
            pass: lastMa150 !== null && lastMa200 !== null && lastMa150 > lastMa200,
            detail: { ma150: lastMa150, ma200: lastMa200 }
        },
        {
            id: 3,
            title: '200日均线至少上涨1个月',
            pass: isTrendingUp(ma200, 21),
            detail: { upDays: daysTrendingUp(ma200) }
        },
        {
            id: 4,
            title: '50日均线高于150日与200日均线',
            pass: lastMa50 !== null && lastMa150 !== null && lastMa200 !== null && lastMa50 > lastMa150 && lastMa50 > lastMa200,
            detail: { ma50: lastMa50, ma150: lastMa150, ma200: lastMa200 }
        },
        {
            id: 5,
            title: '现价至少高于52周低点25%',
            pass: aboveLowPct !== null && aboveLowPct >= 25,
            detail: { low52w, aboveLowPct }
        },
        {
            id: 6,
            title: '现价比52周高点至多低25%',
            pass: belowHighPct !== null && belowHighPct <= 25,
            detail: { high52w, belowHighPct }
        },
        {
            id: 7,
            title: '相对强弱排名不低于70，且RS线上行',
            pass: rsApprox !== null && rsApprox >= 70 && rsTrendWeeks >= 6,
            detail: { rsApprox, rsTrendWeeks }
        },
        {
            id: 8,
            title: '现价高于50日均线（出基底）',
            pass: lastClose !== null && lastMa50 !== null && lastClose > lastMa50,
            detail: { lastClose, ma50: lastMa50 }
        }
    ];

    return {
        indicators: {
            lastClose,
            ma20: lastMa20,
            ma50: lastMa50,
            ma150: lastMa150,
            ma200: lastMa200,
            rsi14: lastRsi,
            avgVol20: avgVol,
            high52w,
            low52w
        },
        signal,
        reasons,
        criteria
    };
}

export default async function handler(req, res) {
    try {
        if (req.method === 'POST') {
            const body = req.body || {};
            const stockData = body.stockData;
            if (!Array.isArray(stockData)) {
                return res.status(400).json({ success: false, error: 'POST 需要提供 stockData 数组' });
            }
            const analysis = analyzeStockData(stockData);
            return res.status(200).json({ success: true, source: 'client', analysis });
        }

        // GET: 通过 symbol 在线拉取数据再分析
        const { symbol } = req.query;
        if (!symbol) {
            return res.status(400).json({ success: false, error: '请提供股票代码 symbol，或使用 POST 提供 stockData' });
        }

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

        const analysis = analyzeStockData(stockData);
        return res.status(200).json({ success: true, source: 'remote', symbol, analysis });
    } catch (error) {
        console.error('Analysis API Error:', error);
        return res.status(500).json({ success: false, error: error.message || '服务器内部错误' });
    }
}


