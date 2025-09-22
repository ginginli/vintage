import fetch from 'node-fetch';

async function fetchIbdRsData(symbol) {
    const baseUrl = process.env.IBD_API_BASE_URL;
    const apiKey = process.env.IBD_API_KEY;
    if (!baseUrl || !apiKey || !symbol) {
        return null;
    }
    const url = `${baseUrl}/rs?symbol=${encodeURIComponent(symbol)}`;
    try {
        const resp = await fetch(url, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        // 期望数据结构示例：{ rsRating: 92, rsLine: [{date, value}, ...] }
        if (!data || typeof data.rsRating !== 'number') return null;
        // 计算 RS 线最近连续上行的“周数”（基于日序列粗略折算，5个交易日≈1周）
        let rsTrendWeeks = 0;
        if (Array.isArray(data.rsLine) && data.rsLine.length >= 2) {
            const values = data.rsLine.map(d => Number(d.value)).filter(v => Number.isFinite(v));
            for (let i = values.length - 1; i > 0; i--) {
                if (values[i] > values[i - 1]) rsTrendWeeks++; else break;
            }
            rsTrendWeeks = Math.floor(rsTrendWeeks / 5);
        }
        return {
            rsRating: Math.max(0, Math.min(99, Math.round(data.rsRating))),
            rsTrendWeeks
        };
    } catch (_) {
        return null;
    }
}

function computePercentileRank(value, values) {
    if (!Array.isArray(values) || values.length === 0 || !Number.isFinite(value)) return null;
    const sorted = values.slice().filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    let count = 0;
    for (let i = 0; i < sorted.length; i++) {
        if (sorted[i] <= value) count++; else break;
    }
    const pct = count / sorted.length; // 0..1
    return Math.max(1, Math.min(99, Math.round(pct * 100)));
}

function computeReturnFromCloses(closes, lookbackDays = 126) {
    if (!Array.isArray(closes) || closes.length < lookbackDays + 1) return null;
    const first = closes[closes.length - lookbackDays - 1];
    const last = closes[closes.length - 1];
    if (!first || !last) return null;
    return last / first - 1;
}

async function fetchDailyCloses(apiBaseUrl, apiKey, symbol, limit = 260) {
    const url = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const ts = data && data['Time Series (Daily)'];
    if (!ts) return null;
    const series = Object.entries(ts).slice(0, limit).map(([date, v]) => ({ date, close: Number(v['4. close']) })).reverse();
    return series.map(d => d.close);
}

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

// 移除 RSI 的计算与使用，改由 IBD 的 RS Rating 与 RS 线支撑第七条标准

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

    const lastClose = closePrices[closePrices.length - 1];
    const lastMa20 = ma20[ma20.length - 1] ?? null;
    const lastMa50 = ma50[ma50.length - 1] ?? null;
    const lastMa150 = ma150[ma150.length - 1] ?? null;
    const lastMa200 = ma200[ma200.length - 1] ?? null;

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
    // 不再添加 RSI 的理由提示

    // 52周高低
    const last252 = stockData.slice(-252);
    const high52w = Math.max(...last252.map(d => d.high));
    const low52w = Math.min(...last252.map(d => d.low));
    const aboveLowPct = low52w ? ((lastClose - low52w) / low52w) * 100 : null; // 高于低点的比例
    const belowHighPct = high52w ? ((high52w - lastClose) / high52w) * 100 : null; // 低于高点的比例

    // 第七条标准将由 IBD 数据填充（rsRating 与 rsTrendWeeks）
    let rsRating = null;
    let rsTrendWeeks = null;

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
            pass: daysTrendingUp(ma200) >= 21,
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
            pass: false,
            detail: { rsRating, rsTrendWeeks }
        },
        {
            id: 8,
            title: '现价高于50日均线（出基底）',
            pass: lastClose !== null && lastMa50 !== null && lastClose > lastMa50,
            detail: { lastClose, ma50: lastMa50 }
        }
    ];

    // VCP（三要素）分析：最近一年，启发式识别收缩递减
    function analyzeVcp(data) {
        try {
            const lookback = 252;
            const window = data.slice(-lookback);
            if (window.length < 60) return { isVCP: false, baseBars: 0, contractions: [] };
            const left = 3, right = 3;
            const highs = window.map(d => d.high);
            const lows = window.map(d => d.low);
            const dates = window.map(d => d.date);
            const hiIdx = [], hiVal = [], loIdx = [], loVal = [];
            for (let i = left; i < window.length - right; i++) {
                let isH = true, isL = true;
                for (let k = 1; k <= left; k++) { if (highs[i] <= highs[i-k]) isH = false; if (lows[i] >= lows[i-k]) isL = false; }
                for (let k = 1; k <= right; k++) { if (highs[i] < highs[i+k]) isH = false; if (lows[i] > lows[i+k]) isL = false; }
                if (isH) { hiIdx.push(i); hiVal.push(highs[i]); }
                if (isL) { loIdx.push(i); loVal.push(lows[i]); }
            }
            let i = 0, j = 0; const piv = [];
            while (i < hiIdx.length || j < loIdx.length) {
                const takeH = j >= loIdx.length || (i < hiIdx.length && hiIdx[i] <= loIdx[j]);
                if (takeH) { piv.push({ idx: hiIdx[i], val: hiVal[i], isHigh: true }); i++; }
                else { piv.push({ idx: loIdx[j], val: loVal[j], isHigh: false }); j++; }
            }
            const legs = [];
            for (let k = 0; k < piv.length - 1; k++) if (piv[k].isHigh && !piv[k+1].isHigh) legs.push({ si: piv[k].idx, ei: piv[k+1].idx, sv: piv[k].val, ev: piv[k+1].val });
            const contractions = legs.map(l => ({
                startBar: l.si,
                endBar: l.ei,
                startDate: dates[l.si],
                endDate: dates[l.ei],
                bars: Math.max(1, l.ei - l.si),
                depthPct: Math.max(0, (l.sv - l.ev) / (l.sv || 1) * 100),
                highPrice: l.sv,
                lowPrice: l.ev
            }));
            const baseBars = contractions.length ? (contractions[contractions.length-1].endBar - contractions[0].startBar) : 0;
            const minContractions = 3, decRatio = 0.7, maxLastRetr = 15;
            let isVCP = false;
            if (contractions.length >= minContractions) {
                let ok = true;
                for (let k = 0; k < contractions.length - 1; k++) if (!((contractions[k+1].depthPct/100) <= (contractions[k].depthPct/100) * decRatio)) { ok = false; break; }
                const lastOK = contractions[contractions.length-1].depthPct <= maxLastRetr;
                isVCP = ok && lastOK;
            }

            // 选取“最佳连续VCP子序列”：从最新收缩向前找满足递减与末端阈值的最长片段
            let best = { isVCP: false, start: null, end: null, depths: [], widthsBars: [], totalBars: 0, count: 0 };
            for (let end = contractions.length - 1; end >= 0; end--) {
                let lastOk = contractions[end]?.depthPct <= maxLastRetr;
                if (!lastOk) continue;
                let start = end;
                while (start - 1 >= 0) {
                    const newer = contractions[start].depthPct/100;
                    const older = contractions[start - 1].depthPct/100;
                    if (newer <= older * decRatio) start--; else break;
                }
                const count = end - start + 1;
                if (count >= minContractions) {
                    const slice = contractions.slice(start, end + 1);
                    const totalBarsSel = slice.reduce((s, c) => s + (c.bars || 0), 0);
                    const depths = slice.map(c => c.depthPct);
                    const widthsBars = slice.map(c => c.bars);
                    best = { isVCP: true, start, end, depths, widthsBars, totalBars: totalBarsSel, count };
                    break; // 取最靠近右侧的一段
                }
            }

            return { isVCP, baseBars, contractions, best };
        } catch { return { isVCP: false, baseBars: 0, contractions: [] }; }
    }

    const vcp = analyzeVcp(stockData);

    // 枢轴点分析（带注释）：
    // - 思路：使用 VCP 的最佳右侧子序列，取其“最后一段收缩”作为最紧区域；
    // - 在该区域内的最高价作为枢轴上沿（突破触发）；
    // - 同时评估“缩量是否充分”和“末端是否足够紧”（ATR/close），以辅助判断枢轴质量。
    function analyzePivot(data, vcpResult) {
        try {
            // 1) 必须先有一个有效的 VCP 最佳子序列
            if (!vcpResult || !vcpResult.best || !vcpResult.best.isVCP) return null;

            // 2) 仅分析最近一年窗口，保证时效性
            const lookback = 252;
            const window = data.slice(-lookback);

            // 3) 取最佳子序列的起止段索引，定位“最后一段收缩”的窗口范围
            const startBar = vcpResult.contractions[vcpResult.best.start]?.startBar;
            const endBar = vcpResult.contractions[vcpResult.best.end]?.endBar;
            if (startBar == null || endBar == null) return null;

            // 4) 提取该区间数据（含日期/高低收/量）
            const seg = window.slice(startBar, endBar + 1);
            if (!seg.length) return null;

            // 5) 在该段内寻找最高价，作为枢轴上沿；记录其日期
            let pivot = -Infinity, pivotDate = null;
            for (const d of seg) {
                if (Number.isFinite(d.high) && d.high > pivot) {
                    pivot = d.high; pivotDate = d.date;
                }
            }
            if (!Number.isFinite(pivot)) return null;

            // 6) 计算买入区间：枢轴至枢轴+3%（可参数化）
            const buyZoneFrom = pivot;
            const buyZoneTo = pivot * 1.03;

            // 7) 读取最新收盘价，用于显示“是否已在枢轴上方”
            const lastClose = data[data.length - 1]?.close;

            // 8) 构建量能与紧致度判据（启发式）
            //    - 近10日均量 vs 近50日均量（截止到该段结束处）
            //    - 极低量日计数：段内最后 W=10 天内，volume ≤ volSMA50 * 0.35 的天数
            //    - 简易 ATR（14）：TR = max(high-low, |high-prevClose|, |low-prevClose|)
            //      取段末14天均值除以收盘作为 atrPct，衡量“是否足够紧”。
            const endIdx = endBar;                                  // 段尾在 window 内的索引
            const volsUpToEnd = window.slice(0, endIdx + 1).map(d => d.volume);
            const closesUpToEnd = window.slice(0, endIdx + 1).map(d => d.close);
            const highsUpToEnd = window.slice(0, endIdx + 1).map(d => d.high);
            const lowsUpToEnd  = window.slice(0, endIdx + 1).map(d => d.low);

            // 均量函数
            const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

            const volSMA10 = avg(volsUpToEnd.slice(-10));           // 近10日均量
            const volSMA50 = avg(volsUpToEnd.slice(-50));           // 近50日均量
            const dryFactor = 0.7;                                  // 缩量阈值：10日 < 50日 * 0.7
            const dryOk = Number.isFinite(volSMA10) && Number.isFinite(volSMA50)
                ? volSMA10 < volSMA50 * dryFactor : null;

            // 极低量日统计（窗口 W=10）
            const W = 10;
            const extremeFactor = 0.35;                             // 极低量：≤ 50日均量 * 0.35
            let extremeLowDays = 0;
            const tail = seg.slice(-W);
            if (Number.isFinite(volSMA50)) {
                for (const d of tail) {
                    if (Number.isFinite(d.volume) && d.volume <= volSMA50 * extremeFactor) extremeLowDays++;
                }
            }

            // 简易 ATR(14) 及紧致度（atrPct）
            const atrLen = 14;
            let trs = [];
            for (let i = Math.max(1, closesUpToEnd.length - atrLen); i < closesUpToEnd.length; i++) {
                const h = highsUpToEnd[i], l = lowsUpToEnd[i], pc = closesUpToEnd[i - 1];
                const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
                trs.push(tr);
            }
            const atr = avg(trs);
            const closeEnd = closesUpToEnd[closesUpToEnd.length - 1];
            const atrPct = (Number.isFinite(atr) && Number.isFinite(closeEnd) && closeEnd > 0)
                ? atr / closeEnd : null;
            const maxAtrPct = 0.03;                                 // 紧致阈值：ATR/Close ≤ 3%
            const tightOk = (atrPct != null) ? atrPct <= maxAtrPct : null;

            // 建议的突破放量阈值（用于前端提示，不做强判定）
            const breakoutVolMult = 1.8;                            // 建议：≥ 10日均量 * 1.8
            const breakoutVolNeeded = (Number.isFinite(volSMA10)) ? volSMA10 * breakoutVolMult : null;

            return {
                pivot,                                              // 枢轴价（上沿）
                pivotDate,                                          // 枢轴对应日期
                range: { startDate: seg[0]?.date, endDate: seg[seg.length - 1]?.date }, // 区间
                buyZone: { from: buyZoneFrom, to: buyZoneTo, maxChasePct: 3 },          // 买入建议区
                lastClose,                                          // 最新收盘
                isAbovePivot: Number.isFinite(lastClose) ? lastClose >= pivot : null,   // 是否在枢轴上方
                // 量能与紧致度评估（用于验证“好枢轴”）
                volume: {
                    volSMA10,
                    volSMA50,
                    dryOk,
                    extremeLowDays,
                    extremeFactor,
                    dryFactor
                },
                tightness: {
                    atrPct,
                    maxAtrPct,
                    tightOk
                },
                breakout: {
                    volMult: breakoutVolMult,
                    volNeeded: breakoutVolNeeded
                }
            };
        } catch {
            return null;
        }
    }

    const pivot = analyzePivot(stockData, vcp);

    return {
        indicators: {
            lastClose,
            ma20: lastMa20,
            ma50: lastMa50,
            ma150: lastMa150,
            ma200: lastMa200,
            avgVol20: avgVol,
            high52w,
            low52w
        },
        signal,
        reasons,
        criteria,
            rs: { },
        vcp,
        pivot
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

        // 同步获取 SPY 作为 S&P 500 基准
        const spyUrl = `${apiBaseUrl}?function=TIME_SERIES_DAILY&symbol=SPY&outputsize=full&apikey=${apiKey}`;
        const spyResp = await fetch(spyUrl);
        const spyData = await spyResp.json();
        const spyTs = spyData['Time Series (Daily)'];

        let analysis = analyzeStockData(stockData);

        // 优先接入 IBD 的 RS 数据
        const ibd = await fetchIbdRsData(symbol);
        if (ibd && typeof ibd.rsRating === 'number') {
            analysis.rs = {
                source: 'IBD',
                rsRating: ibd.rsRating,
                rsTrendWeeks: ibd.rsTrendWeeks
            };
            if (Array.isArray(analysis.criteria)) {
                const c7 = analysis.criteria.find(c => c.id === 7);
                if (c7) {
                    c7.pass = ibd.rsRating >= 70 && (ibd.rsTrendWeeks ?? 0) >= 6;
                    c7.detail = {
                        rsRating: ibd.rsRating,
                        rsTrendWeeks: ibd.rsTrendWeeks
                    };
                }
            }
        }

        // 若未获取到 IBD 数据，尝试横截面“RS 评级代理”（基于横截面百分位）
        if (!analysis.rs?.rsRating) {
            // 1) 优先使用用户传入 peers；2) 其后使用 SP500_SYMBOLS 环境变量提供的成分列表（默认限额 pool_limit=50）
            let peers = (req.query.peers || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
            const useSp500 = (!peers.length && (req.query.pool === 'SP500' || req.query.use_sp500_pool === '1'));
            if (!peers.length && useSp500) {
                const sp500Env = (process.env.SP500_SYMBOLS || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
                const poolLimit = Math.max(5, Math.min(50, Number(req.query.pool_limit || 50)));
                peers = sp500Env.slice(0, poolLimit);
            }
            if (peers.length > 0) {
                // 拉取 peers 与 symbol 的近 6 个月（约 126 交易日）收益
                const symbols = Array.from(new Set([symbol, ...peers]));
                const closesMap = new Map();
                for (const s of symbols) {
                    try {
                        const closes = await fetchDailyCloses(apiBaseUrl, apiKey, s, 260);
                        if (closes) closesMap.set(s, closes);
                    } catch (_) {}
                }
                const lookback = Number(req.query.rs_lookback_days || 126);
                const returns = [];
                for (const [sym, closes] of closesMap.entries()) {
                    const r = computeReturnFromCloses(closes, lookback);
                    if (r !== null) returns.push({ sym, r });
                }
                const base = returns.find(x => x.sym === symbol);
                if (base && returns.length >= 5) {
                    const ranks = computePercentileRank(base.r, returns.map(x => x.r));
                    if (Number.isFinite(ranks)) {
                        analysis.rs = { source: useSp500 ? 'proxy-SP500' : 'proxy-peers', rsRating: ranks, rsTrendWeeks: null };
                        const c7 = Array.isArray(analysis.criteria) ? analysis.criteria.find(c => c.id === 7) : null;
                        if (c7) {
                            // 暂不判定通过，等待 RS 线趋势（SPY 基准）计算完成
                            c7.pass = false;
                            c7.detail = Object.assign({}, c7.detail, { rsRating: ranks, poolSize: returns.length });
                        }
                    }
                }
            }
        }

        // 计算 SPY 基准的 RS 线趋势；若已有 rsRating（IBD 或代理）则合并，只做趋势；否则回退方案
        if (spyTs) {
            const spySeries = Object.entries(spyTs)
                .slice(0, 300)
                .map(([date, values]) => ({
                    date,
                    close: Number(values['4. close'])
                }))
                .reverse();

            // 对齐日期区间
            const spyMap = new Map(spySeries.map(d => [d.date, d.close]));
            const aligned = analysis && Array.isArray(stockData)
                ? stockData.filter(d => spyMap.has(d.date))
                : [];

            if (aligned.length >= 30) {
                const stockCloses = aligned.map(d => d.close);
                const spyCloses = aligned.map(d => spyMap.get(d.date));

                const stockFirst = stockCloses[0];
                const stockLast = stockCloses[stockCloses.length - 1];
                const spyFirst = spyCloses[0];
                const spyLast = spyCloses[spyCloses.length - 1];

                const stockReturn = stockFirst ? stockLast / stockFirst : null;
                const spyReturn = spyFirst ? spyLast / spyFirst : null;

                if (stockReturn !== null && spyReturn !== null) {
                    const rel = stockReturn / spyReturn; // >1 跑赢
                    const relPct = (rel - 1) * 100;

                    // 构造相对强弱序列用于趋势周数估计
                    const rsSeries = stockCloses.map((v, i) => v / (spyCloses[i] || 1e-9));
                    const rsTrendDays = daysTrendingUp(rsSeries);
                    const rsTrendWeeks = Math.floor(rsTrendDays / 5);

                    if (analysis.rs?.rsRating) {
                        // 已有 rsRating（IBD 或代理），仅补充趋势并统一判定
                        analysis.rs = Object.assign({}, analysis.rs, {
                            source: analysis.rs.source || 'merged',
                            benchmark: 'SPY',
                            rsOutperformancePct: relPct,
                            rsTrendWeeks
                        });
                        if (Array.isArray(analysis.criteria)) {
                            const c7 = analysis.criteria.find(c => c.id === 7);
                            if (c7) {
                                const rating = analysis.rs.rsRating;
                                c7.pass = rating >= 70 && rsTrendWeeks >= 6;
                                c7.detail = Object.assign({}, c7.detail, {
                                    rsRating: rating,
                                    rsTrendWeeks,
                                    benchmark: 'SPY'
                                });
                            }
                        }
                    } else {
                        // 无 rsRating，使用回退方案（rsApprox）
                        const rsApprox = Math.max(0, Math.min(100, 50 + relPct));
                        analysis.rs = {
                            source: 'fallback-SPY',
                            benchmark: 'SPY',
                            rsApprox,
                            rsOutperformancePct: relPct,
                            rsTrendWeeks
                        };
                        if (Array.isArray(analysis.criteria)) {
                            const c7 = analysis.criteria.find(c => c.id === 7);
                            if (c7) {
                                c7.pass = rsApprox >= 70 && rsTrendWeeks >= 6;
                                c7.detail = {
                                    rsApprox,
                                    rsTrendWeeks,
                                    rsOutperformancePct: relPct,
                                    benchmark: 'SPY'
                                };
                            }
                        }
                    }
                }
            }
        }

        return res.status(200).json({ success: true, source: 'remote', symbol, analysis });
    } catch (error) {
        console.error('Analysis API Error:', error);
        return res.status(500).json({ success: false, error: error.message || '服务器内部错误' });
    }
}


