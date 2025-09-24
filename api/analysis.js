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

    // Cheat Setup 分析（基于杯形右侧提前买点的启发式识别）
    function analyzeCheatSetup(data) {
        try {
            if (!Array.isArray(data) || data.length < 220) return null; // 至少约1年数据

            const closes = data.map(d => d.close);
            const highs = data.map(d => d.high);
            const lows  = data.map(d => d.low);

            // 计算 200MA 及其趋势
            const ma200Series = calculateMovingAverage(closes, 200);
            const lastMa200 = ma200Series[ma200Series.length - 1];
            const lastClose = closes[closes.length - 1];
            const ma200UpDays = daysTrendingUp(ma200Series);
            const ma200SlopeUp = ma200UpDays >= 21; // 至少1个月向上
            const above200ma = Number.isFinite(lastClose) && Number.isFinite(lastMa200) && lastClose > lastMa200;

            // 在最近 225 根K线内寻找一个“杯”：先左峰 P，再低点 L，再右侧高点 R
            const lookback = 225; // ≈45周
            const startIdx = Math.max(0, data.length - lookback);
            const window = data.slice(startIdx);
            const wHighs = window.map(d => d.high);
            const wLows  = window.map(d => d.low);

            // 1) 找到最近低点 L（避开极端尾部噪声，使用过去 20..(lookback-5) 的最小值）
            let lIdx = -1, lVal = Infinity;
            for (let i = 10; i < wLows.length - 5; i++) {
                if (wLows[i] < lVal) { lVal = wLows[i]; lIdx = i; }
            }
            if (lIdx < 0 || !Number.isFinite(lVal)) return null;

            // 2) 在 L 左侧寻找左峰 P（最大高点）
            let pIdx = -1, pVal = -Infinity;
            for (let i = 0; i < lIdx; i++) {
                if (wHighs[i] > pVal) { pVal = wHighs[i]; pIdx = i; }
            }
            if (pIdx < 0 || !Number.isFinite(pVal) || pVal <= 0) return null;

            // 3) 在 L 右侧寻找右侧高点 R（恢复到接近左峰）
            let rIdx = -1, rVal = -Infinity;
            for (let i = lIdx + 1; i < wHighs.length; i++) {
                if (wHighs[i] > rVal) { rVal = wHighs[i]; rIdx = i; }
            }
            if (rIdx < 0 || !Number.isFinite(rVal)) return null;

            // 杯深、时长
            const depthPct = Math.max(0, (pVal - lVal) / pVal) * 100; // %
            const baseBars = Math.max(1, rIdx - pIdx);
            const durationWeeks = Math.round(baseBars / 5);

            // 资格区间：深度 15%–50%（>60% 视为过深），时长 3–45 周
            const depthOk = depthPct >= 15 && depthPct <= 50;
            const depthTooDeep = depthPct > 60;
            const durationOk = durationWeeks >= 3 && durationWeeks <= 45;

            // 先前涨幅：在 P 之前 3–36 个月范围内（≈63–756 根）寻找更早低点，计算 P 相对涨幅
            const leftGlobalIdx = startIdx + pIdx;
            const runupLookbackMin = 63, runupLookbackMax = 756;
            const runupStart = Math.max(0, leftGlobalIdx - runupLookbackMax);
            const runupEnd   = Math.max(0, leftGlobalIdx - runupLookbackMin);
            let priorLow = Infinity;
            for (let i = runupStart; i <= runupEnd; i++) {
                priorLow = Math.min(priorLow, data[i]?.low ?? Infinity);
            }
            const priorRunupPct = Number.isFinite(priorLow) && priorLow > 0 ? ((pVal / priorLow) - 1) * 100 : null;
            const priorRunupOk = priorRunupPct != null && priorRunupPct >= 25; // ≥25%

            // 上三分之一/中三分之一阈值（用于识别提前买点区域）
            const midLine = lVal + (pVal - lVal) * 0.5;
            const upperThird = lVal + (pVal - lVal) * (2/3);

            // 识别一个“cheat 提前买点”：最近 10–15 根内的短期枢轴高点，要求位于中三分之一及以上，但低于左峰
            const plateauLen = 12; // 平台长度用于检测宽度与紧致度
            const tail = window.slice(-Math.max(10, plateauLen));
            let cheatPivot = -Infinity;
            let cheatPivotDate = null;
            for (const d of tail) {
                if (!Number.isFinite(d.high)) continue;
                if (d.high > cheatPivot && d.high < pVal && d.high >= midLine) {
                    cheatPivot = d.high;
                    cheatPivotDate = d.date;
                }
            }
            if (!Number.isFinite(cheatPivot)) {
                // 回退：使用最近 10 日最高价，若 ≥ 中位线
                const last10 = window.slice(-10);
                const cand = Math.max(...last10.map(d => d.high));
                if (Number.isFinite(cand) && cand >= midLine && cand < pVal) {
                    cheatPivot = cand;
                    cheatPivotDate = last10.find(d => d.high === cand)?.date || null;
                }
            }

            // 标准柄买点通常接近左峰（或右侧最后一个重要高点）
            const standardPivot = pVal;

            // 四步法阶段识别
            // 1) Downtrend: 存在 P→L 的下跌段且深度>0，且长周期上升（近200MA上行并有一段历史高于200MA）
            const downtrend = (pIdx >= 0 && lIdx > pIdx && depthPct > 0) && (ma200SlopeUp);

            // 2) Uptrend: L→R 的回升比例在 1/3–1/2 附近
            let recoupRatio = null;
            if (Number.isFinite(rVal) && Number.isFinite(lVal) && Number.isFinite(pVal) && (pVal - lVal) > 0) {
                recoupRatio = (rVal - lVal) / (pVal - lVal);
            }
            const uptrend = recoupRatio != null && recoupRatio >= 0.3 && recoupRatio <= 0.7;

            // 3) Pause: 最近平台宽度在 5%–10%，且末端缩量与价格紧致
            const plateauHigh = Math.max(...tail.map(d => d.high));
            const plateauLow  = Math.min(...tail.map(d => d.low));
            const plateauWidthPct = Number.isFinite(plateauHigh) && plateauHigh > 0 ? ((plateauHigh - plateauLow) / plateauHigh) * 100 : null;
            const plateauWidthOk = plateauWidthPct != null && plateauWidthPct >= 5 && plateauWidthPct <= 10;

            // 末端缩量与紧致（沿用简易规则）：10日均量 < 50日均量×0.7；ATR/Close ≤ 3%
            const volsUpToNow = window.map(d => d.volume);
            const closesUpToNow = window.map(d => d.close);
            const highsUpToNow = window.map(d => d.high);
            const lowsUpToNow  = window.map(d => d.low);
            const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
            const volSMA10_end = avg(volsUpToNow.slice(-10));
            const volSMA50_end = avg(volsUpToNow.slice(-50));
            const dryOk_end = (volSMA10_end != null && volSMA50_end != null) ? (volSMA10_end < volSMA50_end * 0.7) : null;
            // ATR/Close 以平台末端近14天
            const atrLen2 = 14;
            let trs2 = [];
            for (let i = Math.max(1, closesUpToNow.length - atrLen2); i < closesUpToNow.length; i++) {
                const h = highsUpToNow[i], l = lowsUpToNow[i], pc = closesUpToNow[i - 1];
                trs2.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
            }
            const atr2 = avg(trs2);
            const lastClose2 = closesUpToNow[closesUpToNow.length - 1];
            const atrPct2 = (atr2 != null && lastClose2 != null && lastClose2 > 0) ? atr2 / lastClose2 : null;
            const tightOk_end = (atrPct2 != null) ? atrPct2 <= 0.03 : null;

            // Shakeout：平台内最低价是否短暂跌破平台前一个短期低点
            const preTail = window.slice(-Math.max(plateauLen * 2, 24), -plateauLen);
            const preLow = preTail.length ? Math.min(...preTail.map(d => d.low)) : null;
            const shakeout = (preLow != null && plateauLow != null) ? (plateauLow < preLow) : false;

            const pause = Boolean(plateauWidthOk && (dryOk_end !== false) && (tightOk_end !== false));

            // 4) Breakout：最新价上穿平台高点，且量能达到建议阈值（≥10日均量×1.8）
            const lastPx = lastClose;
            const breakoutNow = Number.isFinite(lastPx) && Number.isFinite(plateauHigh) ? (lastPx > plateauHigh) : false;
            const breakoutVolMult2 = 1.8;
            const breakoutVolNeeded2 = (volSMA10_end != null) ? volSMA10_end * breakoutVolMult2 : null;
            const lastVol = data[data.length - 1]?.volume;
            const breakoutVolumeOk = (breakoutVolNeeded2 != null && Number.isFinite(lastVol)) ? (lastVol >= breakoutVolNeeded2) : null;
            const breakout = Boolean(breakoutNow && (breakoutVolumeOk !== false));

            // 总体资格
            const qualifies = Boolean(
                depthOk && !depthTooDeep && durationOk && priorRunupOk && above200ma && ma200SlopeUp && Number.isFinite(cheatPivot)
            );

            const reasons = [];
            if (!depthOk) reasons.push(`杯深 ${depthPct.toFixed(1)}% 不在 15%–50% 范围`);
            if (depthTooDeep) reasons.push(`杯深 ${depthPct.toFixed(1)}% 过深（>60%）`);
            if (!durationOk) reasons.push(`基底时长 ${durationWeeks} 周不在 3–45 周范围`);
            if (!priorRunupOk) reasons.push(`先前涨幅不足（${(priorRunupPct ?? 0).toFixed(1)}% < 25%）`);
            if (!above200ma) reasons.push('现价未站上 200MA');
            if (!ma200SlopeUp) reasons.push('200MA 未上行至少 1 个月');
            if (!Number.isFinite(cheatPivot)) reasons.push('未识别到合理的提前买点枢轴');

            return {
                qualifies,
                reasons,
                thresholds: {
                    depthPct: { min: 15, max: 50, tooDeep: 60 },
                    durationWeeks: { min: 3, max: 45 },
                    priorRunupPctMin: 25,
                    ma200UpDaysMin: 21,
                    plateauWidthPct: { min: 5, max: 10 },
                    atrPctMax: 0.03,
                    dryFactor: 0.7,
                    breakoutVolMult: 1.8
                },
                window: {
                    startDate: window[0]?.date,
                    endDate: window[window.length - 1]?.date
                },
                cup: {
                    leftPeak: { price: pVal, index: pIdx, date: window[pIdx]?.date },
                    lowPoint: { price: lVal, index: lIdx, date: window[lIdx]?.date },
                    rightHigh: { price: rVal, index: rIdx, date: window[rIdx]?.date },
                    depthPct,
                    baseBars,
                    durationWeeks,
                    midLine,
                    upperThird
                },
                trend: {
                    above200ma,
                    ma200SlopeUp,
                    ma200UpDays
                },
                prior: {
                    priorRunupPct,
                    lookbackDays: { min: runupLookbackMin, max: runupLookbackMax }
                },
                buyPoints: {
                    cheatPivot: { price: Number.isFinite(cheatPivot) ? cheatPivot : null, date: cheatPivotDate },
                    standardPivot: { price: standardPivot, date: window[pIdx]?.date }
                },
                plateau: {
                    lengthBars: tail.length,
                    high: plateauHigh,
                    low: plateauLow,
                    widthPct: plateauWidthPct,
                    widthOk: plateauWidthOk,
                    shakeout
                },
                endMetrics: {
                    volSMA10: volSMA10_end,
                    volSMA50: volSMA50_end,
                    dryOk: dryOk_end,
                    atrPct: atrPct2,
                    tightOk: tightOk_end,
                    breakoutVolMult: breakoutVolMult2,
                    breakoutVolNeeded: breakoutVolNeeded2,
                    lastVolume: lastVol
                },
                steps: {
                    downtrend,
                    uptrend: Boolean(uptrend),
                    pause,
                    breakout
                }
            };
        } catch {
            return null;
        }
    }

    const cheat = analyzeCheatSetup(stockData);

    // Low Cheat 分析：在杯的下三分之一形成的平台与提前买点
    function analyzeLowCheat(data) {
        try {
            if (!Array.isArray(data) || data.length < 220) return null;
            const closes = data.map(d => d.close);
            const highs = data.map(d => d.high);
            const lows  = data.map(d => d.low);

            const ma200Series = calculateMovingAverage(closes, 200);
            const lastMa200 = ma200Series[ma200Series.length - 1];
            const lastClose = closes[closes.length - 1];
            const ma200UpDays = daysTrendingUp(ma200Series);
            const ma200SlopeUp = ma200UpDays >= 21;
            const above200ma = Number.isFinite(lastClose) && Number.isFinite(lastMa200) && lastClose > lastMa200;

            const lookback = 225;
            const startIdx = Math.max(0, data.length - lookback);
            const window = data.slice(startIdx);
            const wHighs = window.map(d => d.high);
            const wLows  = window.map(d => d.low);

            // 找杯的 L / P / R
            let lIdx = -1, lVal = Infinity;
            for (let i = 10; i < wLows.length - 5; i++) {
                if (wLows[i] < lVal) { lVal = wLows[i]; lIdx = i; }
            }
            if (lIdx < 0 || !Number.isFinite(lVal)) return null;
            let pIdx = -1, pVal = -Infinity;
            for (let i = 0; i < lIdx; i++) {
                if (wHighs[i] > pVal) { pVal = wHighs[i]; pIdx = i; }
            }
            if (pIdx < 0 || !Number.isFinite(pVal) || pVal <= 0) return null;
            let rIdx = -1, rVal = -Infinity;
            for (let i = lIdx + 1; i < wHighs.length; i++) {
                if (wHighs[i] > rVal) { rVal = wHighs[i]; rIdx = i; }
            }
            if (rIdx < 0 || !Number.isFinite(rVal)) return null;

            const depthPct = Math.max(0, (pVal - lVal) / pVal) * 100;
            const baseBars = Math.max(1, rIdx - pIdx);
            const durationWeeks = Math.round(baseBars / 5);

            const depthOk = depthPct >= 15 && depthPct <= 50;
            const depthTooDeep = depthPct > 60;
            const durationOk = durationWeeks >= 3 && durationWeeks <= 45;

            // 先前涨幅
            const leftGlobalIdx = startIdx + pIdx;
            const runupLookbackMin = 63, runupLookbackMax = 756;
            const runupStart = Math.max(0, leftGlobalIdx - runupLookbackMax);
            const runupEnd   = Math.max(0, leftGlobalIdx - runupLookbackMin);
            let priorLow = Infinity;
            for (let i = runupStart; i <= runupEnd; i++) {
                priorLow = Math.min(priorLow, data[i]?.low ?? Infinity);
            }
            const priorRunupPct = Number.isFinite(priorLow) && priorLow > 0 ? ((pVal / priorLow) - 1) * 100 : null;
            const priorRunupOk = priorRunupPct != null && priorRunupPct >= 25;

            const lowerThird = lVal + (pVal - lVal) * (1/3);
            const midLine = lVal + (pVal - lVal) * 0.5;

            // 平台检测：末段窗口
            const plateauLen = 15;
            const tail = window.slice(-plateauLen);
            const plateauHigh = Math.max(...tail.map(d => d.high));
            const plateauLow  = Math.min(...tail.map(d => d.low));
            const plateauWidthPct = Number.isFinite(plateauHigh) && plateauHigh > 0 ? ((plateauHigh - plateauLow) / plateauHigh) * 100 : null;
            const plateauWidthOk = plateauWidthPct != null && plateauWidthPct >= 5 && plateauWidthPct <= 10;

            // Low Cheat 枢轴：平台最高点，但位置需要落在“下三分之一”区域（≤ lowerThird）
            let lowCheatPivot = -Infinity, lowCheatDate = null;
            for (const d of tail) {
                if (!Number.isFinite(d.high)) continue;
                if (d.high > lowCheatPivot && d.high <= lowerThird) {
                    lowCheatPivot = d.high; lowCheatDate = d.date;
                }
            }
            if (!Number.isFinite(lowCheatPivot)) {
                // 回退：使用平台内最高价，若 ≤ 下三分之一阈值
                const cand = plateauHigh;
                if (Number.isFinite(cand) && cand <= lowerThird) {
                    lowCheatPivot = cand;
                    lowCheatDate = tail.find(d => d.high === cand)?.date || null;
                }
            }

            // 缩量与紧致（末端）
            const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
            const vols = window.map(d => d.volume);
            const closesUpToNow = window.map(d => d.close);
            const highsUpToNow = window.map(d => d.high);
            const lowsUpToNow  = window.map(d => d.low);
            const volSMA10 = avg(vols.slice(-10));
            const volSMA50 = avg(vols.slice(-50));
            const dryOk = (volSMA10 != null && volSMA50 != null) ? (volSMA10 < volSMA50 * 0.7) : null;
            const atrLen = 14; let trs = [];
            for (let i = Math.max(1, closesUpToNow.length - atrLen); i < closesUpToNow.length; i++) {
                const h = highsUpToNow[i], l = lowsUpToNow[i], pc = closesUpToNow[i - 1];
                trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
            }
            const atr = avg(trs);
            const closeEnd = closesUpToNow[closesUpToNow.length - 1];
            const atrPct = (atr != null && closeEnd != null && closeEnd > 0) ? atr / closeEnd : null;
            const tightOk = (atrPct != null) ? atrPct <= 0.03 : null;

            // 四步法阶段
            const downtrend = (pIdx >= 0 && lIdx > pIdx && depthPct > 0) && (ma200SlopeUp);
            let recoupRatio = null;
            if (Number.isFinite(rVal) && Number.isFinite(lVal) && Number.isFinite(pVal) && (pVal - lVal) > 0) {
                recoupRatio = (rVal - lVal) / (pVal - lVal);
            }
            const uptrend = recoupRatio != null && recoupRatio >= 0.3 && recoupRatio <= 0.7;
            // Pause 需要宽度达标 + 缩量/紧致不为否
            const pause = Boolean(plateauWidthOk && (dryOk !== false) && (tightOk !== false));
            // Breakout：最新价上穿平台高点
            const breakout = Number.isFinite(lastClose) && Number.isFinite(plateauHigh) ? (lastClose > plateauHigh) : false;

            const qualifies = Boolean(depthOk && !depthTooDeep && durationOk && priorRunupOk && above200ma && ma200SlopeUp && Number.isFinite(lowCheatPivot));
            const reasons = [];
            if (!depthOk) reasons.push(`杯深 ${depthPct.toFixed(1)}% 不在 15%–50% 范围`);
            if (depthTooDeep) reasons.push(`杯深 ${depthPct.toFixed(1)}% 过深（>60%）`);
            if (!durationOk) reasons.push(`基底时长 ${durationWeeks} 周不在 3–45 周范围`);
            if (!priorRunupOk) reasons.push(`先前涨幅不足（${(priorRunupPct ?? 0).toFixed(1)}% < 25%）`);
            if (!above200ma) reasons.push('现价未站上 200MA');
            if (!ma200SlopeUp) reasons.push('200MA 未上行至少 1 个月');
            if (!Number.isFinite(lowCheatPivot)) reasons.push('未识别到下三分之一的提前买点');

            return {
                qualifies,
                reasons,
                thresholds: {
                    depthPct: { min: 15, max: 50, tooDeep: 60 },
                    durationWeeks: { min: 3, max: 45 },
                    priorRunupPctMin: 25,
                    ma200UpDaysMin: 21,
                    plateauWidthPct: { min: 5, max: 10 },
                    atrPctMax: 0.03,
                    dryFactor: 0.7,
                    region: 'lowerThird'
                },
                window: { startDate: window[0]?.date, endDate: window[window.length - 1]?.date },
                cup: {
                    leftPeak: { price: pVal, index: pIdx, date: window[pIdx]?.date },
                    lowPoint: { price: lVal, index: lIdx, date: window[lIdx]?.date },
                    rightHigh: { price: rVal, index: rIdx, date: window[rIdx]?.date },
                    depthPct,
                    baseBars,
                    durationWeeks,
                    lowerThird,
                    midLine
                },
                buyPoints: {
                    lowCheatPivot: { price: Number.isFinite(lowCheatPivot) ? lowCheatPivot : null, date: lowCheatDate },
                    referenceHigh: { price: plateauHigh, date: tail.find(d => d.high === plateauHigh)?.date || null }
                },
                plateau: {
                    lengthBars: tail.length,
                    high: plateauHigh,
                    low: plateauLow,
                    widthPct: plateauWidthPct,
                    widthOk: plateauWidthOk
                },
                endMetrics: { volSMA10, volSMA50, dryOk, atrPct, tightOk },
                steps: { downtrend, uptrend: Boolean(uptrend), pause, breakout }
            };
        } catch { return null; }
    }

    const cheatLow = analyzeLowCheat(stockData);

    // Power Play（强力突破）分析
    function analyzePowerPlay(data) {
        try {
            if (!Array.isArray(data) || data.length < 120) return null;
            const closes = data.map(d => d.close);
            const volumes = data.map(d => d.volume);
            const dates = data.map(d => d.date);

            // 阈值设定
            const thresholds = {
                explosivePctMin: 100,              // ≥100%
                explosiveLookbackDays: 40,         // 8周≈40交易日
                explosiveVolMult: 2.0,             // 爆发行情量能 ≥ 前50日均量 × 2
                baseMinDays: 15,                    // 横盘 3周≈15日
                baseMaxDays: 30,                    // 横盘 6周≈30日（允许 10–12天提前）
                baseMinAltDays: 10,                 // 最短10–12天
                correctionMaxPct: 20,               // 基底最大回撤 20%（低价股可 25%）
                correctionMaxPctLowPrice: 25,       // 低价股放宽
                lowPriceThreshold: 20,              // 低价股阈值（USD）
                noTightNeededPct: 10,               // 若基底≤10%，不强制收紧
                tightAtrPctMax: 0.03,               // 紧致度 ATR/Close ≤ 3%
                preQuietAtrPctMax: 0.03,            // 爆发前“安静”阈值（Stage 1 近似）
                preQuietDays: 20                    // 爆发前观察期
            };

            // 1) 寻找最近的“爆发段”：在近 80 天内扫描任意 40 天窗口，收益≥100%
            const scanDays = 80;
            const start = Math.max(0, data.length - scanDays);
            let best = null;
            for (let i = start; i <= data.length - thresholds.explosiveLookbackDays; i++) {
                const j = i + thresholds.explosiveLookbackDays - 1;
                const first = closes[i];
                const last = closes[j];
                if (!Number.isFinite(first) || !Number.isFinite(last) || first <= 0) continue;
                const pct = (last / first - 1) * 100;
                if (pct >= thresholds.explosivePctMin) {
                    // 计算该窗口内的量能放大倍数（窗口均量 vs 前50日均量）
                    const winVolAvg = volumes.slice(i, j + 1).reduce((a, b) => a + b, 0) / (j - i + 1);
                    const pre50Start = Math.max(0, i - 50);
                    const pre50 = volumes.slice(pre50Start, i);
                    const pre50Avg = pre50.length ? pre50.reduce((a, b) => a + b, 0) / pre50.length : null;
                    const volMult = (pre50Avg && pre50Avg > 0) ? (winVolAvg / pre50Avg) : null;
                    // 爆发前是否“安静”：前20天 ATR/Close ≤ 阈值
                    const preEnd = Math.max(1, i);
                    const preStart = Math.max(1, preEnd - thresholds.preQuietDays);
                    let trs = [];
                    for (let k = preStart; k < preEnd; k++) {
                        const h = data[k].high, l = data[k].low, pc = data[k - 1].close;
                        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
                    }
                    const preAtr = trs.length ? trs.reduce((a, b) => a + b, 0) / trs.length : null;
                    const preClose = data[preEnd - 1].close;
                    const preAtrPct = (preAtr != null && preClose > 0) ? preAtr / preClose : null;
                    const preQuiet = (preAtrPct != null) ? (preAtrPct <= thresholds.preQuietAtrPctMax) : null;

                    best = {
                        startIdx: i, endIdx: j, returnPct: pct, volMult, preQuiet,
                        startDate: dates[i], endDate: dates[j]
                    };
                    break; // 取最近一次
                }
            }
            if (!best) return null;

            // 2) 爆发后的“横盘基底”：从 endIdx 之后找 10–30 天窗口，最大回撤≤20%(或≤25%低价股)
            const postStart = best.endIdx + 1;
            const maxLook = Math.min(data.length - postStart, 40);
            if (maxLook <= 0) return null;
            let base = null;
            for (let len of [15, 20, 25, 30, 12, 10]) { // 优先 15–30，其次 12/10
                if (len > maxLook) continue;
                const seg = data.slice(postStart, postStart + len);
                if (!seg.length) continue;
                const hi = Math.max(...seg.map(d => d.high));
                const lo = Math.min(...seg.map(d => d.low));
                if (!Number.isFinite(hi) || hi <= 0 || !Number.isFinite(lo)) continue;
                const corrPct = ((hi - lo) / hi) * 100;
                const lastPx = seg[seg.length - 1].close;
                const isLowPrice = Number.isFinite(lastPx) ? (lastPx < thresholds.lowPriceThreshold) : false;
                const corrMax = isLowPrice ? thresholds.correctionMaxPctLowPrice : thresholds.correctionMaxPct;
                const corrOk = corrPct <= corrMax;
                // 紧致度（可选）：若 corrPct > 10%，则要求 ATR/Close ≤ 3%
                let tightOk = true;
                if (corrPct > thresholds.noTightNeededPct) {
                    // 近14日 ATR/Close
                    const closes2 = seg.map(d => d.close);
                    let trs2 = [];
                    for (let k = 1; k < closes2.length; k++) {
                        const h = seg[k].high, l = seg[k].low, pc = seg[k - 1].close;
                        trs2.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
                    }
                    const atr = trs2.length ? trs2.reduce((a, b) => a + b, 0) / trs2.length : null;
                    const c = closes2[closes2.length - 1];
                    const atrPct = (atr != null && c > 0) ? atr / c : null;
                    tightOk = (atrPct != null) ? (atrPct <= thresholds.tightAtrPctMax) : true;
                }
                if (corrOk && tightOk) {
                    base = {
                        startIdx: postStart,
                        endIdx: postStart + len - 1,
                        startDate: data[postStart].date,
                        endDate: data[postStart + len - 1].date,
                        days: len,
                        correctionPct: corrPct,
                        isLowPrice,
                        tightOk
                    };
                    break;
                }
            }
            if (!base) return null;

            // 3) 触发：上穿基底高点
            const baseHigh = Math.max(...data.slice(base.startIdx, base.endIdx + 1).map(d => d.high));
            const lastClose = data[data.length - 1]?.close;
            const breakout = Number.isFinite(lastClose) && Number.isFinite(baseHigh) ? (lastClose > baseHigh) : false;

            const qualifies = Boolean(
                (best.returnPct >= thresholds.explosivePctMin) &&
                (best.volMult == null || best.volMult >= thresholds.explosiveVolMult) &&
                (base.days >= thresholds.baseMinAltDays && base.days <= thresholds.baseMaxDays) &&
                (base.correctionPct <= (base.isLowPrice ? thresholds.correctionMaxPctLowPrice : thresholds.correctionMaxPct))
            );

            const reasons = [];
            if (best.volMult != null && best.volMult < thresholds.explosiveVolMult) reasons.push(`爆发量能不足（${best.volMult.toFixed(2)}x < ${thresholds.explosiveVolMult}x）`);
            if (!(base.days >= thresholds.baseMinAltDays)) reasons.push(`横盘时长不足（${base.days} < ${thresholds.baseMinAltDays} 日）`);
            if (base.days > thresholds.baseMaxDays) reasons.push(`横盘时间过长（${base.days} > ${thresholds.baseMaxDays} 日）`);
            const corrLimit = base.isLowPrice ? thresholds.correctionMaxPctLowPrice : thresholds.correctionMaxPct;
            if (base.correctionPct > corrLimit) reasons.push(`基底回撤 ${base.correctionPct.toFixed(1)}% 超限（>${corrLimit}%）`);

            return {
                qualifies,
                reasons,
                thresholds,
                explosive: {
                    startDate: best.startDate, endDate: best.endDate, returnPct: best.returnPct, volMult: best.volMult, preQuiet: best.preQuiet
                },
                base: {
                    startDate: base.startDate, endDate: base.endDate, days: base.days, correctionPct: base.correctionPct, isLowPrice: base.isLowPrice, tightOk: base.tightOk, high: baseHigh
                },
                trigger: {
                    breakout,
                    lastClose,
                    baseHigh
                }
            };
        } catch { return null; }
    }

    const powerPlay = analyzePowerPlay(stockData);

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
        pivot,
        cheat,
        cheatLow,
        powerPlay
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


