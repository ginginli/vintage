// 1. 全局变量声明
let stockController;

// 2. StockAPI 类定义
class StockAPI {
    constructor() {
        this.lastRequestTime = 0;
        this.API_BASE_URL = this.getApiBaseUrl();
        this.ANALYSIS_API_BASE_URL = this.getAnalysisApiBaseUrl();
    }

    getApiBaseUrl() {
        // 获取当前页面的端口
        const currentPort = window.location.port;
        
        // 如果是本地开发环境
        if (window.location.hostname === 'localhost') {
            return `http://localhost:${currentPort}/api/stock`;
        }
        
        // 生产环境使用相对路径
        return '/api/stock';
    }

    getAnalysisApiBaseUrl() {
        const currentPort = window.location.port;
        if (window.location.hostname === 'localhost') {
            return `http://localhost:${currentPort}/api/analysis`;
        }
        return '/api/analysis';
    }

    async fetchStockData(symbol) {
        return await this._fetchStockData(symbol);
    }

    async _fetchStockData(symbol) {
        try {
            const maxRetries = 3;
            let retryCount = 0;
            
            while (retryCount < maxRetries) {
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                
                if (timeSinceLastRequest < 15000) {
                    const waitTime = 15000 - timeSinceLastRequest;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
                
                this.lastRequestTime = Date.now();
                
                try {
                    const response = await fetch(`${this.API_BASE_URL}?symbol=${symbol}`);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    if (data.error) {
                        throw new Error(data.error);
                    }
                    
                    return data.stockData;
                } catch (error) {
                    retryCount++;
                    if (retryCount === maxRetries) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        } catch (error) {
            console.error('获取股票数据时出错:', error);
            throw error;
        }
    }
}
// 2.5 ChartManager 类
class ChartManager {
    constructor() {
        this.mainChart = echarts.init(document.getElementById('mainChart'));
        this.currentPeriod = 250;
        this.fullData = [];
        
        window.addEventListener('resize', () => {
            this.mainChart.resize();
        });
    }

    renderChart(data) {
        const closePrices = data.map(item => item.close);
        
        const option = {
            title: { 
                text: `价格走势与成交量分析 (${this.currentPeriod}天)`,
                left: 'center'
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            legend: {
                data: ['K线', 'MA5', 'MA10', 'MA20', 'MA60', '成交量'],
                top: 30
            },
            grid: [{
                left: '10%',
                right: '10%',
                height: '60%'
            }, {
                left: '10%',
                right: '10%',
                top: '75%',
                height: '15%'
            }],
            xAxis: [{
                type: 'category',
                data: data.map(item => item.date),
                gridIndex: 0
            }, {
                type: 'category',
                data: data.map(item => item.date),
                gridIndex: 1
            }],
            yAxis: [{
                type: 'value',
                scale: true,
                gridIndex: 0
            }, {
                type: 'value',
                gridIndex: 1
            }],
            dataZoom: [{
                type: 'inside',
                xAxisIndex: [0, 1],
                start: 0,
                end: 100
            }, {
                show: true,
                xAxisIndex: [0, 1],
                type: 'slider',
                bottom: 5
            }],
            series: [
                {
                    name: 'K线',
                    type: 'candlestick',
                    data: data.map(item => [
                        item.open,
                        item.close,
                        item.low,
                        item.high
                    ]),
                    xAxisIndex: 0,
                    yAxisIndex: 0
                },
                {
                    name: 'MA5',
                    type: 'line',
                    data: this.calculateMA(5, closePrices),
                    smooth: true,
                    lineStyle: { opacity: 0.5 }
                },
                {
                    name: 'MA10',
                    type: 'line',
                    data: this.calculateMA(10, closePrices),
                    smooth: true,
                    lineStyle: { opacity: 0.5 }
                },
                {
                    name: 'MA20',
                    type: 'line',
                    data: this.calculateMA(20, closePrices),
                    smooth: true,
                    lineStyle: { opacity: 0.5 }
                },
                {
                    name: 'MA60',
                    type: 'line',
                    data: this.calculateMA(60, closePrices),
                    smooth: true,
                    lineStyle: { opacity: 0.5 }
                },
                {
                    name: '成交量',
                    type: 'line',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: data.map(item => item.volume),
                    smooth: true,
                    lineStyle: { width: 2, opacity: 0.8 },
                    areaStyle: { opacity: 0.2 },
                    symbol: 'none'
                }
            ]
        };
        
        this.mainChart.setOption(option);
    }

    calculateMA(days, prices) {
        const result = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < days - 1) {
                result.push('-');
                continue;
            }
            let sum = 0;
            for (let j = 0; j < days; j++) {
                sum += prices[i - j];
            }
            result.push((sum / days).toFixed(2));
        }
        return result;
    }

    changePeriod(period) {
        this.currentPeriod = period;
        const data = this.fullData.slice(-period);
        this.renderChart(data);
    }
}
// 2.8 StockAnalyzer 类
class StockAnalyzer {
    analyze(data) {
        const marketCharacter = this.determineMarketCharacter(data);
        
        return {
            ma20Analysis: this.analyzeTrend(data, marketCharacter),
            volumePriceAnalysis: this.analyzeVolumePrice(data, marketCharacter),
            marketCharacter: this.explainMarketCharacter(data, marketCharacter),
            operationAdvice: this.generateOperationAdvice(data, marketCharacter)
        };
    }

    determineMarketCharacter(data) {
        const prices = data.map(item => item.close);
        const volumes = data.map(item => item.volume);
        const ma20 = this.calculateMA(20, prices);
        
        const priceStability = this.checkPriceStability(prices, ma20);
        const ma20Trend = this.calculateMA20Trend(prices);
        const priceChange = this.calculatePriceChange(prices, 20);
        const volumeChange = this.calculateVolumeChange(volumes);

        if (priceStability === 'above' && ma20Trend === 'up' && 
            priceChange > 8 && volumeChange > 30) {
            return 'bullish';
        }
        
        if (priceStability === 'below' && ma20Trend === 'down' && 
            priceChange < -8 && volumeChange > 30) {
            return 'bearish';
        }
        
        return 'ranging';
    }

    analyzeTrend(data, marketCharacter) {
        const prices = data.map(item => item.close);
        const ma20 = this.calculateMA(20, prices);
        const priceStability = this.checkPriceStability(prices, ma20);
        const ma20Trend = this.calculateMA20Trend(prices);
        
        let analysis = "MA20核心指标分析：\n";
        analysis += `当前MA20：${ma20.toFixed(2)}\n`;
        analysis += `价格位置：${this.getPricePositionText(priceStability)}\n`;
        analysis += `MA20形：${this.getMA20TrendText(ma20Trend)}\n`;
        
        return analysis;
    }

    analyzeVolumePrice(data, marketCharacter) {
        const volumes = data.map(item => item.volume);
        const prices = data.map(item => item.close);
        const volumeChange = this.calculateVolumeChange(volumes);
        const priceChange = this.calculatePriceChange(prices, 20);
        
        let analysis = "量价配合分析：\n";
        analysis += `成交量变化：${volumeChange.toFixed(2)}%\n`;
        analysis += `价格涨跌幅：${priceChange.toFixed(2)}%\n\n`;
        
        if (volumeChange > 30) {
            if (priceChange > 8) {
                analysis += "放量上涨，买盘积极";
            } else if (priceChange < -8) {
                analysis += "放量下跌，卖盘活跃";
            }
        } else if (volumeChange < -30) {
            if (priceChange > 8) {
                analysis += "缩量上涨，上涨乏力";
            } else if (priceChange < -8) {
                analysis += "缩量下跌，下跌趋缓";
            }
        } else {
            analysis += "成交量基本平稳";
        }
        
        return analysis;
    }

    explainMarketCharacter(data, marketCharacter) {
        const prices = data.map(item => item.close);
        const ma20 = this.calculateMA(20, prices);
        const priceChange = this.calculatePriceChange(prices, 20);
        
        let explanation = "市场特征分析：\n";
        
        switch(marketCharacter) {
            case 'bullish':
                explanation += "多头市场特征\n";
                explanation += "1. 均线系统多头排列\n";
                explanation += `2. 价格站稳MA20上方 (当前MA20: ${ma20.toFixed(2)})\n`;
                explanation += `3. 20天涨幅${priceChange.toFixed(2)}%\n`;
                break;
                
            case 'bearish':
                explanation += "空头市场特征\n";
                explanation += "1. 均线系统空头排列\n";
                explanation += `2. 价格位于MA20下方 (当前MA20: ${ma20.toFixed(2)})\n`;
                explanation += `3. 20天跌幅${priceChange.toFixed(2)}%\n`;
                break;
                
            default:
                explanation += "盘整市场特征\n";
                explanation += "1. 均线系统交织\n";
                explanation += `2. 价格在MA20(${ma20.toFixed(2)})附近波动\n`;
                explanation += "3. 成交量和涨跌幅度均未达到趋势场特征\n";
        }
        
        return explanation;
    }

    generateOperationAdvice(data, marketCharacter) {
        const prices = data.map(item => item.close);
        const ma20 = this.calculateMA(20, prices);
        const volumes = data.map(item => item.volume);
        const volumeChange = this.calculateVolumeChange(volumes);
        const priceChange = this.calculatePriceChange(prices, 20);
        const ma20Trend = this.calculateMA20Trend(prices);
        
        let advice = "操作建议：\n\n";
        
        switch(marketCharacter) {
            case 'bullish':
                advice += "【多头市场 - MA20向上】\n";
                advice += "1. 未持有策略：\n";
                advice += "   买点选择：\n";
                advice += `   - 首选：回调至MA20（${ma20.toFixed(2)}）企稳\n`;
                advice += "     企稳标准：\n";
                advice += "     1) MA20持续向上倾斜\n";
                advice += "     2) 股价连续3天站稳MA20上方\n";
                advice += "     3) 成交量较前期温和放大\n";
                advice += "   买入方式：\n";
                advice += "   - 第一批：确认企稳后买入60%\n";
                advice += "   - 第二批：突破阶段新高后补仓30%\n";
                advice += "     阶段新高判断：\n";
                advice += "     1) 突破MA20上方20天内的最高点\n";
                advice += "     2) 突破时成交量较前期明显放大\n";
                advice += "     3) 收盘价站稳突破位之上\n";
                advice += `   止损位：MA20（${ma20.toFixed(2)}）下方\n\n`;
                
                advice += "2. 持有策略：\n";
                advice += "   - 持股为主，现金为辅\n";
                advice += "   - 当前建议仓位：80-90%\n";
                advice += "   离场条件（满足任一即离场）：\n";
                advice += "   1) MA20转向：\n";
                advice += "      - MA20由上升转平\n";
                advice += "      - 股价连续3天收在MA20下方\n";
                advice += "   2) 量价背离：\n";
                advice += "      - 股价创新高但成交量明显萎缩\n";
                advice += "      - 或出现放量滞涨：\n";
                advice += "        · 成交量较前期放大50%以上\n";
                advice += "        · 但股价涨幅显著收窄\n";
                advice += "        · 尤其注意尾盘跳水\n";
                break;
                
            case 'bearish':
                advice += "【空头市场 - MA20向下】\n";
                advice += "1. 未持有策略：\n";
                advice += "   - 以观望为主，现金为王\n";
                advice += "   企稳信号（需同时满足）：\n";
                advice += "   1) MA20形态：\n";
                advice += "      - 由下跌转平\n";
                advice += "      - 股价重返MA20上方\n";
                advice += "   2) 成交量：\n";
                advice += "      - 下跌时成交量持续萎缩\n";
                advice += "      - 反弹时成交量温和放大\n";
                advice += "   试探性买入：\n";
                advice += "   - 仅可用20%仓位\n";
                advice += `   - 止损位：MA20（${ma20.toFixed(2)}）下方\n\n`;
                
                advice += "2. 持有策略：\n";
                advice += "   - 现金为主，持股为辅\n";
                advice += "   - 当前建议仓位：0-30%\n";
                advice += "   减仓条件：\n";
                advice += "   1) 反弹无力：\n";
                advice += "      - 触及MA20即回落\n";
                advice += "      - 反弹时成交量未能有效放大\n";
                advice += "   2) 继续下跌：\n";
                advice += "      - MA20继续向下倾斜\n";
                advice += "      - 股价再创阶段新低\n";
                break;
                
            default:
                advice += "【盘整市场 - MA20横盘】\n";
                advice += "1. 未持有策略：\n";
                advice += "   - 等待MA20方向明确\n";
                advice += "   - 观察成交量变化\n";
                advice += "   试探性机会：\n";
                advice += `   - MA20（${ma20.toFixed(2)}）下方买入\n`;
                advice += "   - 仅可用30%仓位\n";
                advice += "   - 成交量需明显萎缩\n\n";
                
                advice += "2. 持有策略：\n";
                advice += "   - 轻仓为主，保持灵活\n";
                advice += "   - 当前建议仓位：30-50%\n";
                advice += "   操作建议：\n";
                advice += "   1) 减仓时机：\n";
                advice += "      - MA20上方且成交量放大\n";
                advice += "      - 股价涨幅过大但量能不继\n";
                advice += "   2) 补仓时机：\n";
                advice += "      - MA20下方且成交量萎缩\n";
                advice += "      - 股价企稳时成交量温和放大\n";
        }
        
        // 补充当前量价关系分析
        if (volumeChange > 50 && priceChange < 3) {
            advice += "\n当前量价关系：\n";
            advice += "· 属于放量滞涨：\n";
            advice += "  - 成交量较前期放大超50%\n";
            advice += "  - 涨幅低于3%\n";
            advice += "  - 建议注意风险\n";
        }
        
        return advice;
    }

    // 辅助方法
    calculateMA(days, prices) {
        const sum = prices.slice(-days).reduce((a, b) => a + b, 0);
        return sum / days;
    }

    checkPriceStability(prices, ma20) {
        const recentPrices = prices.slice(-3);
        const deviations = recentPrices.map(price => 
            (price - ma20) / ma20 * 100
        );
        
        if (deviations.every(dev => dev > 0 && dev <= 8)) {
            return 'above';
        }
        if (deviations.every(dev => dev < 0 && dev <= -3)) {
            return 'below';
        }
        return 'ranging';
    }

    calculateMA20Trend(prices) {
        const ma20Values = prices.slice(-5).map((_, i) => 
            this.calculateMA(20, prices.slice(0, prices.length - 4 + i))
        );
        
        const trend = ma20Values[ma20Values.length - 1] - ma20Values[0];
        if (trend > 0) return 'up';
        if (trend < 0) return 'down';
        return 'flat';
    }

    calculateVolumeChange(volumes) {
        const recent = volumes.slice(-5);
        const previous = volumes.slice(-10, -5);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / 5;
        const previousAvg = previous.reduce((a, b) => a + b, 0) / 5;
        return ((recentAvg - previousAvg) / previousAvg) * 100;
    }

    calculatePriceChange(prices, days) {
        const latest = prices[prices.length - 1];
        const previous = prices[prices.length - days];
        return ((latest - previous) / previous) * 100;
    }

    getPricePositionText(stability) {
        switch(stability) {
            case 'above': return "站稳MA20上方";
            case 'below': return "跌破MA20下方";
            default: return "在MA20附近徘徊";
        }
    }

    getMA20TrendText(trend) {
        switch(trend) {
            case 'up': return "向上倾斜（趋势向好）";
            case 'down': return "向下倾斜（趋势转弱）";
            default: return "横盘震荡";
        }
    }
}

function renderPowerPlay(pp) {
    const summary = document.getElementById('ppSummary');
    const meta = document.getElementById('ppMeta');
    const reasonsEl = document.getElementById('ppReasons');
    const thresholdsEl = document.getElementById('ppThresholds');
    const checklist = document.getElementById('ppChecklist');
    if (!summary || !meta || !reasonsEl) return;
    if (!pp) {
        summary.textContent = '—';
        meta.innerHTML = '';
        reasonsEl.innerHTML = '';
        if (thresholdsEl) thresholdsEl.innerHTML = '';
        if (checklist) checklist.innerHTML = '';
        return;
    }

    summary.textContent = `资格判定：${pp.qualifies ? 'YES' : 'NO'}  ｜ 爆发涨幅：${pp.explosive?.returnPct?.toFixed ? pp.explosive.returnPct.toFixed(1) : pp.explosive?.returnPct}%`;

    function box(label, value) {
        const d = document.createElement('div');
        d.style.background = '#f8f9fa';
        d.style.border = '1px solid #eee';
        d.style.borderRadius = '6px';
        d.style.padding = '6px 8px';
        d.textContent = `${label}: ${value}`;
        meta.appendChild(d);
    }
    meta.innerHTML = '';
    if (pp.explosive) {
        box('爆发区间', `${pp.explosive.startDate || ''} → ${pp.explosive.endDate || ''}`);
        if (pp.explosive.volMult != null) box('量能倍数', `${pp.explosive.volMult.toFixed ? pp.explosive.volMult.toFixed(2) : pp.explosive.volMult}x`);
        if (pp.explosive.preQuiet != null) box('爆发前安静', pp.explosive.preQuiet ? 'Yes' : 'No');
    }
    if (pp.base) {
        box('横盘时长', `${pp.base.days} 日`);
        box('回撤', `${pp.base.correctionPct?.toFixed ? pp.base.correctionPct.toFixed(1) : pp.base.correctionPct}%`);
        box('低价股', pp.base.isLowPrice ? 'Yes' : 'No');
        box('紧致达标', pp.base.tightOk ? 'Yes' : 'No');
    }
    if (pp.trigger) {
        box('突破', pp.trigger.breakout ? 'Yes' : 'No');
        if (pp.trigger.baseHigh != null) box('基底高点', pp.trigger.baseHigh.toFixed ? pp.trigger.baseHigh.toFixed(2) : pp.trigger.baseHigh);
        if (pp.trigger.lastClose != null) box('最新收盘', pp.trigger.lastClose.toFixed ? pp.trigger.lastClose.toFixed(2) : pp.trigger.lastClose);
    }

    reasonsEl.innerHTML = '';
    const reasons = Array.isArray(pp.reasons) ? pp.reasons : [];
    if (reasons.length) {
        const ul = document.createElement('ul'); ul.style.margin = '0'; ul.style.paddingLeft = '18px';
        reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
        reasonsEl.appendChild(ul);
    }

    if (thresholdsEl) {
        thresholdsEl.innerHTML = '';
        const th = pp.thresholds || {};
        function tbox(label, value) {
            const d = document.createElement('div'); d.style.background = '#f8f9fa'; d.style.border = '1px solid #eee'; d.style.borderRadius = '6px'; d.style.padding = '6px 8px'; d.textContent = `${label}: ${value}`; thresholdsEl.appendChild(d); }
        if (th.explosivePctMin != null) tbox('爆发涨幅≥', `${th.explosivePctMin}%（${th.explosiveLookbackDays}日）`);
        if (th.explosiveVolMult != null) tbox('爆发量能', `≥ 前50日均量 × ${th.explosiveVolMult}`);
        if (th.baseMinAltDays != null && th.baseMaxDays != null) tbox('横盘时长', `${th.baseMinAltDays}–${th.baseMaxDays} 日`);
        if (th.correctionMaxPct != null && th.correctionMaxPctLowPrice != null) tbox('回撤上限', `≤${th.correctionMaxPct}%（低价股≤${th.correctionMaxPctLowPrice}%）`);
        if (th.noTightNeededPct != null) tbox('无需额外收紧阈值', `回撤≤${th.noTightNeededPct}%`);
        if (th.tightAtrPctMax != null) tbox('紧致度 ATR/Close ≤', `${(th.tightAtrPctMax * 100).toFixed(1)}%`);
        if (th.lowPriceThreshold != null) tbox('低价股阈值', `$${th.lowPriceThreshold}`);
    }

    if (checklist) {
        checklist.innerHTML = '';
        function addCheck(title, pass, extras) {
            const li = document.createElement('li'); li.className = 'criteria-item';
            const head = document.createElement('div'); head.style.display = 'flex'; head.style.justifyContent = 'space-between'; head.style.alignItems = 'center';
            const titleEl = document.createElement('span'); titleEl.className = 'criteria-title'; titleEl.textContent = title;
            const badge = document.createElement('span'); badge.className = `criteria-badge ${pass ? 'criteria-pass' : 'criteria-fail'}`; badge.textContent = pass ? '达标' : '未达标';
            head.appendChild(titleEl); head.appendChild(badge); li.appendChild(head);
            if (extras && extras.length) {
                const ex = document.createElement('div'); ex.style.marginTop = '8px'; ex.style.display = 'grid'; ex.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))'; ex.style.gap = '8px';
                extras.forEach(([label, value]) => { const b = document.createElement('div'); b.style.background = '#f8f9fa'; b.style.border = '1px solid #eee'; b.style.borderRadius = '6px'; b.style.padding = '6px 8px'; b.textContent = `${label}: ${value}`; ex.appendChild(b); });
                li.appendChild(ex);
            }
            checklist.appendChild(li);
        }
        const th = pp.thresholds || {};
        addCheck('8周爆发涨幅（≥100%）', pp.explosive?.returnPct != null && pp.explosive.returnPct >= (th.explosivePctMin ?? 100), [[ '涨幅(%)', pp.explosive?.returnPct != null ? pp.explosive.returnPct.toFixed(1) + '%' : '-' ]]);
        const volPass = (pp.explosive?.volMult == null) || (pp.explosive?.volMult >= (th.explosiveVolMult ?? 2));
        addCheck('爆发量能（≥前50日×倍率）', volPass, [[ '量能倍数', pp.explosive?.volMult != null ? (pp.explosive.volMult.toFixed ? pp.explosive.volMult.toFixed(2) : pp.explosive.volMult) + 'x' : '-' ]]);
        const days = pp.base?.days; const daysPass = days != null && days >= (th.baseMinAltDays ?? 10) && days <= (th.baseMaxDays ?? 30);
        addCheck('横盘时长（10–30日，优选15–30）', daysPass, [[ '时长(日)', days ?? '-' ]]);
        const corr = pp.base?.correctionPct; const limit = pp.base?.isLowPrice ? (th.correctionMaxPctLowPrice ?? 25) : (th.correctionMaxPct ?? 20);
        addCheck('回撤上限（≤20%，低价股≤25%）', corr != null && corr <= limit, [[ '回撤(%)', corr != null ? corr.toFixed(1) + '%' : '-' ], [ '上限(%)', limit ]]);
        // 若回撤>10%，需紧致
        const noTight = (corr != null && corr <= (th.noTightNeededPct ?? 10));
        addCheck('紧致度（ATR/Close ≤ 3% 或回撤≤10%）', noTight || !!pp.base?.tightOk, [[ 'ATR/Close', (pp.base?.tightOk != null ? (pp.base.tightOk ? '<=3% (OK)' : '>3% (不达标)') : '-') ]]);
        addCheck('触发：上穿基底高点', !!pp.trigger?.breakout, [[ '基底高点', pp.trigger?.baseHigh?.toFixed ? pp.trigger.baseHigh.toFixed(2) : (pp.trigger?.baseHigh ?? '-') ], [ '最新收盘', pp.trigger?.lastClose?.toFixed ? pp.trigger.lastClose.toFixed(2) : (pp.trigger?.lastClose ?? '-') ]]);
    }
}
function renderLowCheat(cheat) {
    const summary = document.getElementById('lowCheatSummary');
    const meta = document.getElementById('lowCheatMeta');
    const reasonsEl = document.getElementById('lowCheatReasons');
    const stepsEl = document.getElementById('lowCheatSteps');
    const thresholdsEl = document.getElementById('lowCheatThresholds');
    const checklist = document.getElementById('lowCheatChecklist');
    if (!summary || !meta || !reasonsEl) return;
    if (!cheat) {
        summary.textContent = '—';
        meta.innerHTML = '';
        reasonsEl.innerHTML = '';
        if (stepsEl) stepsEl.innerHTML = '';
        if (thresholdsEl) thresholdsEl.innerHTML = '';
        if (checklist) checklist.innerHTML = '';
        return;
    }

    summary.textContent = `资格判定：${cheat.qualifies ? 'YES' : 'NO'}  ｜ Low Cheat：${cheat.buyPoints?.lowCheatPivot?.price?.toFixed ? cheat.buyPoints.lowCheatPivot.price.toFixed(2) : (cheat.buyPoints?.lowCheatPivot?.price ?? '-')}`;

    function box(label, value) {
        const d = document.createElement('div');
        d.style.background = '#f8f9fa';
        d.style.border = '1px solid #eee';
        d.style.borderRadius = '6px';
        d.style.padding = '6px 8px';
        d.textContent = `${label}: ${value}`;
        meta.appendChild(d);
    }
    meta.innerHTML = '';
    if (cheat.window) box('窗口', `${cheat.window.startDate || ''} → ${cheat.window.endDate || ''}`);
    if (cheat.cup) {
        box('杯深', `${cheat.cup.depthPct?.toFixed ? cheat.cup.depthPct.toFixed(1) : cheat.cup.depthPct}%`);
        box('时长', `${cheat.cup.durationWeeks ?? '-'} 周`);
        box('下三分之一阈值', `${cheat.cup.lowerThird?.toFixed ? cheat.cup.lowerThird.toFixed(2) : (cheat.cup.lowerThird ?? '-')}`);
        if (cheat.buyPoints?.lowCheatPivot?.price != null) {
            box('Low Cheat', cheat.buyPoints.lowCheatPivot.price.toFixed ? cheat.buyPoints.lowCheatPivot.price.toFixed(2) : cheat.buyPoints.lowCheatPivot.price);
        }
    }

    reasonsEl.innerHTML = '';
    const reasons = Array.isArray(cheat.reasons) ? cheat.reasons : [];
    if (reasons.length) {
        const ul = document.createElement('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '18px';
        reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
        reasonsEl.appendChild(ul);
    }

    // 阈值参数
    if (thresholdsEl) {
        thresholdsEl.innerHTML = '';
        const th = cheat.thresholds || {};
        function tbox(label, value) {
            const d = document.createElement('div');
            d.style.background = '#f8f9fa'; d.style.border = '1px solid #eee'; d.style.borderRadius = '6px'; d.style.padding = '6px 8px';
            d.textContent = `${label}: ${value}`; thresholdsEl.appendChild(d);
        }
        if (th.depthPct) tbox('杯深范围', `${th.depthPct.min}%–${th.depthPct.max}%（过深>${th.depthPct.tooDeep}%）`);
        if (th.durationWeeks) tbox('时长范围', `${th.durationWeeks.min}–${th.durationWeeks.max} 周`);
        if (th.priorRunupPctMin != null) tbox('先前涨幅≥', `${th.priorRunupPctMin}%`);
        if (th.ma200UpDaysMin != null) tbox('200MA上行≥', `${th.ma200UpDaysMin} 天`);
        if (th.plateauWidthPct) tbox('平台宽度', `${th.plateauWidthPct.min}%–${th.plateauWidthPct.max}%`);
        if (th.atrPctMax != null) tbox('ATR/Close ≤', `${(th.atrPctMax * 100).toFixed(1)}%`);
        if (th.dryFactor != null) tbox('缩量阈值', `10日均量 < 50日均量 × ${th.dryFactor}`);
        if (th.region) tbox('区域', th.region);
    }

    // 清单
    if (checklist) {
        checklist.innerHTML = '';
        function addCheck(title, pass, extras) {
            const li = document.createElement('li'); li.className = 'criteria-item';
            const head = document.createElement('div'); head.style.display = 'flex'; head.style.justifyContent = 'space-between'; head.style.alignItems = 'center';
            const titleEl = document.createElement('span'); titleEl.className = 'criteria-title'; titleEl.textContent = title;
            const badge = document.createElement('span'); badge.className = `criteria-badge ${pass ? 'criteria-pass' : 'criteria-fail'}`; badge.textContent = pass ? '达标' : '未达标';
            head.appendChild(titleEl); head.appendChild(badge); li.appendChild(head);
            if (extras && extras.length) {
                const ex = document.createElement('div'); ex.style.marginTop = '8px'; ex.style.display = 'grid'; ex.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))'; ex.style.gap = '8px';
                extras.forEach(([label, value]) => { const b = document.createElement('div'); b.style.background = '#f8f9fa'; b.style.border = '1px solid #eee'; b.style.borderRadius = '6px'; b.style.padding = '6px 8px'; b.textContent = `${label}: ${value}`; ex.appendChild(b); });
                li.appendChild(ex);
            }
            checklist.appendChild(li);
        }
        const depth = cheat.cup?.depthPct; addCheck('杯深（15%–50%）', depth != null && depth >= 15 && depth <= 50, [[ '杯深(%)', depth != null ? depth.toFixed(1) + '%' : '-' ]]);
        const dur = cheat.cup?.durationWeeks; addCheck('基底时长（3–45周）', dur != null && dur >= 3 && dur <= 45, [[ '时长(周)', dur ?? '-' ]]);
        const prior = cheat.prior?.priorRunupPct; addCheck('先前涨幅（≥25%）', prior != null && prior >= 25, [[ '先前涨幅(%)', prior != null ? prior.toFixed(1) + '%' : '-' ]]);
        const above200 = null; // Low Cheat 允许更早启动，这里不强制展示 above200，若需要可接入：cheat.trend?.above200ma
        addCheck('位置（≤下三分之一）', (cheat.buyPoints?.lowCheatPivot?.price != null && cheat.cup?.lowerThird != null) ? (cheat.buyPoints.lowCheatPivot.price <= cheat.cup.lowerThird) : false, [
            ['Low Cheat', cheat.buyPoints?.lowCheatPivot?.price?.toFixed ? cheat.buyPoints.lowCheatPivot.price.toFixed(2) : (cheat.buyPoints?.lowCheatPivot?.price ?? '-')],
            ['下三分之一阈值', cheat.cup?.lowerThird?.toFixed ? cheat.cup.lowerThird.toFixed(2) : (cheat.cup?.lowerThird ?? '-')]
        ]);
        const widthPct = cheat.plateau?.widthPct; 
        addCheck('平台宽度（5%–10%）', widthPct != null && widthPct >= 5 && widthPct <= 10, [[ '平台宽度(%)', widthPct != null ? widthPct.toFixed(2) + '%' : '-' ]]);
    }

    // 阶段
    if (stepsEl) {
        stepsEl.innerHTML = '';
        function step(name, pass) { const d = document.createElement('div'); d.style.background = pass ? '#e8f5e9' : '#f5f5f5'; d.style.border = `1px solid ${pass ? '#c8e6c9' : '#eee'}`; d.style.borderRadius = '6px'; d.style.padding = '8px 10px'; d.style.fontWeight = '600'; d.style.color = pass ? '#1b5e20' : '#666'; d.textContent = `${name}：${pass ? '完成/满足' : '未满足'}`; stepsEl.appendChild(d); }
        const s = cheat.steps || {};
        step('Downtrend', !!s.downtrend);
        step('Uptrend', !!s.uptrend);
        step('Pause (5–10%)', !!s.pause);
        step('Breakout', !!s.breakout);
    }
}
// 3. 新增：调用后端 /api/analysis 获取 8 条标准
async function fetchCriteria(symbol) {
    const api = new StockAPI();
    const url = `${api.ANALYSIS_API_BASE_URL}?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`分析接口错误: ${res.status}`);
    }
    const data = await res.json();
    if (!data.success) {
        throw new Error(data.error || '分析失败');
    }
    return data.analysis;
}

function renderCriteria(criteria) {
    const list = document.getElementById('criteriaList');
    if (!list) return;
    list.innerHTML = '';
    (criteria || []).forEach(item => {
        const li = document.createElement('li');
        li.className = 'criteria-item';

        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.width = '100%';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';

        const title = document.createElement('span');
        title.className = 'criteria-title';
        title.textContent = `${item.id}. ${item.title}`;

        const badge = document.createElement('span');
        badge.className = `criteria-badge ${item.pass ? 'criteria-pass' : 'criteria-fail'}`;
        badge.textContent = item.pass ? '满足' : '不满足';

        header.appendChild(title);
        header.appendChild(badge);
        container.appendChild(header);

        // 附加数据与备注
        const detail = item.detail || {};
        const extras = document.createElement('div');
        extras.style.marginTop = '8px';
        extras.style.display = 'grid';
        extras.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))';
        extras.style.gap = '8px';

        function addBox(label, value) {
            const box = document.createElement('div');
            box.style.background = '#f8f9fa';
            box.style.border = '1px solid #eee';
            box.style.borderRadius = '6px';
            box.style.padding = '6px 8px';
            box.textContent = `${label}: ${value}`;
            extras.appendChild(box);
        }

        function addNote(text) {
            const note = document.createElement('div');
            note.style.marginTop = '6px';
            note.style.color = '#666';
            note.style.fontSize = '12px';
            note.textContent = text;
            container.appendChild(note);
        }

        if (item.id === 3) {
            // 标准3：展示200日均线上涨交易日天数
            if (typeof detail.upDays === 'number') {
                addBox('200日均线上涨天数', `${detail.upDays} 天`);
            }
            // 标准3备注
            addNote('备注：最好 4 到 5 个月或更长时间。');
        }

        if (item.id === 5) {
            // 标准5：低点与高于低点的百分比
            if (typeof detail.low52w === 'number') {
                addBox('52周低点', detail.low52w.toFixed(2));
            }
            if (typeof detail.aboveLowPct === 'number') {
                addBox('高于52周低点', `${detail.aboveLowPct.toFixed(2)}%`);
            }
            addNote('备注：许多最佳选择在走出健康的盘整期并大幅上涨之前，将比其52周低点高出100%、300%或更多。');
        }

        if (item.id === 6) {
            // 标准6：高点与低于高点的百分比（新定义）
            if (typeof detail.high52w === 'number') {
                addBox('52周高点', detail.high52w.toFixed(2));
            }
            if (typeof detail.belowHighPct === 'number') {
                addBox('低于52周高点', `${detail.belowHighPct.toFixed(2)}%`);
            }
            addNote('备注：越接近新高越好。');
        }

        if (item.id === 7) {
            // 标准7：IBD RS Rating 与 RS 线上行周数
            if (typeof detail.rsRating === 'number') {
                addBox('RS Rating(IBD)', `${detail.rsRating}`);
            } else if (typeof detail.rsApprox === 'number') {
                // 回退显示
                addBox('RS值(近似)', detail.rsApprox.toFixed(2));
            }
            if (typeof detail.rsTrendWeeks === 'number') {
                addBox('RS线上行', `${detail.rsTrendWeeks} 周`);
            }
            addNote('备注：目标 RS Rating≥70，优选≥90；RS线至少上行6周，优选13周+。');
        }

        if (extras.childElementCount > 0) {
            container.appendChild(extras);
        }

        li.appendChild(container);
        list.appendChild(li);
    });
}

function renderVcp(vcp) {
    const summaryEl = document.getElementById('vcpSummary');
    const metaEl = document.getElementById('vcpMeta');
    const tableEl = document.getElementById('vcpTable');
    const footprintEl = document.getElementById('vcpFootprint');
    if (!summaryEl || !metaEl || !tableEl) return;

    if (!vcp) {
        summaryEl.textContent = '—';
        metaEl.innerHTML = '';
        tableEl.querySelector('tbody').innerHTML = '';
        return;
    }

    summaryEl.textContent = `VCP 判定：${vcp.isVCP ? 'YES' : 'NO'}（对称性：${(vcp.contractions||[]).length} 次）`;

    function addBox(label, value) {
        const box = document.createElement('div');
        box.style.background = '#f8f9fa';
        box.style.border = '1px solid #eee';
        box.style.borderRadius = '6px';
        box.style.padding = '6px 8px';
        box.textContent = `${label}: ${value}`;
        metaEl.appendChild(box);
    }

    metaEl.innerHTML = '';
    addBox('基底总时长', `${vcp.baseBars || 0} bars`);
    addBox('收缩次数', `${(vcp.contractions||[]).length}`);
    addBox('bars 说明', 'bars = K线根数（按当前周期）');

    const tbody = tableEl.querySelector('tbody');
    tbody.innerHTML = '';
    const rows = (vcp.contractions || []).slice().sort((a, b) => {
        const da = new Date(a.endDate || a.startDate || 0).getTime();
        const db = new Date(b.endDate || b.startDate || 0).getTime();
        return db - da; // 按结束日期降序
    });
    rows.forEach((c, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="padding:6px; border:1px solid #eee;">${idx+1}</td>`+
                       `<td style=\"padding:6px; border:1px solid #eee;\">${c.startDate || ''}</td>`+
                       `<td style=\"padding:6px; border:1px solid #eee;\">${c.endDate || ''}</td>`+
                       `<td style=\"padding:6px; border:1px solid #eee;\">${c.bars}</td>`+
                       `<td style=\"padding:6px; border:1px solid #eee;\">${(c.depthPct).toFixed(1)}%</td>`+
                       `<td style=\"padding:6px; border:1px solid #eee;\">${(c.highPrice ?? '').toString()}</td>`+
                       `<td style=\"padding:6px; border:1px solid #eee;\">${(c.lowPrice ?? '').toString()}</td>`;
        tbody.appendChild(tr);
    });

    // 绘制简易 VCP Footprint（基于 best 子序列）
    if (!footprintEl) return;
    footprintEl.innerHTML = '';
    const best = vcp.best;
    if (!best || !best.isVCP) return;

    const depths = best.depths;         // 示例： [27, 17, 8]
    const widths = best.widthsBars;     // bars 宽度数组
    if (!depths || !depths.length) return;

    const w = 520, h = 180, pad = 20;
    const maxDepth = Math.max(...depths);
    const maxWidth = Math.max(...widths);
    const colGap = 40; // 列之间的水平间隔

    function yForDepth(d) { return pad + (h - 2*pad) * (1 - d / (maxDepth || 1)); }
    function xForIndex(i) { return pad + i * colGap; }

    let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
    // 画深度刻度（左侧）
    svg += `<text x="${pad}" y="${pad - 4}" fill="#666" font-size="12">depth</text>`;

    for (let i = 0; i < depths.length; i++) {
        const d = depths[i];
        const y = yForDepth(d);
        const x = xForIndex(i) + 180; // 将列整体右移以留白
        const lineLen = 80 * (widths[i] / (maxWidth || 1)); // 用bars宽度比例体现在横线长度
        svg += `<line x1="${x}" y1="${y}" x2="${x + lineLen}" y2="${y}" stroke="#333" stroke-width="3" stroke-dasharray="8,6"/>`;
        svg += `<text x="${x + lineLen + 8}" y="${y + 4}" fill="#333" font-size="12">${d.toFixed(1)}%</text>`;
    }
    // 底部 width 标签
    svg += `<text x="${w/2 - 18}" y="${h - 4}" fill="#666" font-size="12">width</text>`;
    svg += `</svg>`;
    footprintEl.innerHTML = svg;
}

function renderPivot(pivot) {
    const summary = document.getElementById('pivotSummary');
    const meta = document.getElementById('pivotMeta');
    if (!summary || !meta) return;
    if (!pivot) {
        summary.textContent = '—';
        meta.innerHTML = '';
        return;
    }
    // 总结：枢轴价与位置状态
    summary.textContent = `Pivot：${pivot.pivot?.toFixed ? pivot.pivot.toFixed(2) : pivot.pivot}  (${pivot.isAbovePivot ? '价格已在枢轴上方' : '价格在枢轴下方'})`;
    meta.innerHTML = '';
    function box(label, value) {
        const d = document.createElement('div');
        d.style.background = '#f8f9fa';
        d.style.border = '1px solid #eee';
        d.style.borderRadius = '6px';
        d.style.padding = '6px 8px';
        d.textContent = `${label}: ${value}`;
        meta.appendChild(d);
    }
    // 基本信息
    box('枢轴日期', pivot.pivotDate || '-');
    box('区间', `${pivot.range?.startDate || ''} → ${pivot.range?.endDate || ''}`);
    box('买入区间From', pivot.buyZone?.from?.toFixed ? pivot.buyZone.from.toFixed(2) : pivot.buyZone?.from);
    box('买入区间To', pivot.buyZone?.to?.toFixed ? pivot.buyZone.to.toFixed(2) : pivot.buyZone?.to);
    box('允许追高', `${pivot.buyZone?.maxChasePct || 0}%`);
    if (pivot.lastClose != null) box('最新收盘', pivot.lastClose.toFixed ? pivot.lastClose.toFixed(2) : pivot.lastClose);

    // 量能评估：缩量与极低量日
    if (pivot.volume) {
        const v = pivot.volume;
        const v10 = (v.volSMA10 != null && v.volSMA10.toLocaleString) ? v.volSMA10.toLocaleString() : v.volSMA10;
        const v50 = (v.volSMA50 != null && v.volSMA50.toLocaleString) ? v.volSMA50.toLocaleString() : v.volSMA50;
        box('10日均量', v10 ?? '-');
        box('50日均量', v50 ?? '-');
        box('缩量达标', v.dryOk === null ? '-' : (v.dryOk ? 'Yes' : 'No'));
        box('极低量日(近10日)', v.extremeLowDays ?? '-');
    }

    // 紧致度评估：ATR/Close
    if (pivot.tightness) {
        const t = pivot.tightness;
        const pct = (t.atrPct != null) ? `${(t.atrPct*100).toFixed(2)}%` : '-';
        box('ATR/Close', pct);
        box('紧致达标(≤3%)', t.tightOk === null ? '-' : (t.tightOk ? 'Yes' : 'No'));
    }

    // 突破放量建议阈值
    if (pivot.breakout) {
        const b = pivot.breakout;
        const needed = (b.volNeeded != null && b.volNeeded.toLocaleString) ? b.volNeeded.toLocaleString() : b.volNeeded;
        box('突破量倍率', `${b.volMult}x(10日均量)`);
        box('建议最低突破量', needed ?? '-');
    }
}

function renderCheat(cheat) {
    const summary = document.getElementById('cheatSummary');
    const meta = document.getElementById('cheatMeta');
    const reasonsEl = document.getElementById('cheatReasons');
    const stepsEl = document.getElementById('cheatSteps');
    const thresholdsEl = document.getElementById('cheatThresholds');
    if (!summary || !meta || !reasonsEl) return;
    if (!cheat) {
        summary.textContent = '—';
        meta.innerHTML = '';
        reasonsEl.innerHTML = '';
        if (stepsEl) stepsEl.innerHTML = '';
        if (thresholdsEl) thresholdsEl.innerHTML = '';
        return;
    }

    summary.textContent = `资格判定：${cheat.qualifies ? 'YES' : 'NO'}  ｜ 提前买点：${cheat.buyPoints?.cheatPivot?.price?.toFixed ? cheat.buyPoints.cheatPivot.price.toFixed(2) : (cheat.buyPoints?.cheatPivot?.price ?? '-')}`;

    function box(label, value) {
        const d = document.createElement('div');
        d.style.background = '#f8f9fa';
        d.style.border = '1px solid #eee';
        d.style.borderRadius = '6px';
        d.style.padding = '6px 8px';
        d.textContent = `${label}: ${value}`;
        meta.appendChild(d);
    }

    meta.innerHTML = '';
    // 时间窗口与趋势
    if (cheat.window) {
        box('窗口', `${cheat.window.startDate || ''} → ${cheat.window.endDate || ''}`);
    }
    if (cheat.trend) {
        box('站上200MA', cheat.trend.above200ma ? 'Yes' : 'No');
        box('200MA上行天数', `${cheat.trend.ma200UpDays ?? '-'}`);
    }
    // 杯属性
    if (cheat.cup) {
        box('杯深', `${cheat.cup.depthPct?.toFixed ? cheat.cup.depthPct.toFixed(1) : cheat.cup.depthPct}%`);
        box('基底时长', `${cheat.cup.durationWeeks ?? '-'} 周`);
        box('左峰', cheat.cup.leftPeak?.price?.toFixed ? cheat.cup.leftPeak.price.toFixed(2) : (cheat.cup.leftPeak?.price ?? '-'));
        box('低点', cheat.cup.lowPoint?.price?.toFixed ? cheat.cup.lowPoint.price.toFixed(2) : (cheat.cup.lowPoint?.price ?? '-'));
    }
    // 先前涨幅
    if (cheat.prior) {
        box('先前涨幅', `${cheat.prior.priorRunupPct?.toFixed ? cheat.prior.priorRunupPct.toFixed(1) : cheat.prior.priorRunupPct}%`);
    }
    // 买点
    if (cheat.buyPoints) {
        const cp = cheat.buyPoints.cheatPivot;
        const sp = cheat.buyPoints.standardPivot;
        box('Cheat Pivot', cp?.price?.toFixed ? cp.price.toFixed(2) : (cp?.price ?? '-'));
        box('标准Pivot(杯左峰)', sp?.price?.toFixed ? sp.price.toFixed(2) : (sp?.price ?? '-'));
    }

    // 不合格原因
    reasonsEl.innerHTML = '';
    const reasons = Array.isArray(cheat.reasons) ? cheat.reasons : [];
    if (reasons.length) {
        const ul = document.createElement('ul');
        ul.style.margin = '0';
        ul.style.paddingLeft = '18px';
        reasons.forEach(r => {
            const li = document.createElement('li');
            li.textContent = r;
            ul.appendChild(li);
        });
        reasonsEl.appendChild(ul);
    }

    // 阈值判定清单
    const checklist = document.getElementById('cheatChecklist');
    if (checklist) {
        checklist.innerHTML = '';

        function addCheck(title, pass, extraBoxes) {
            const li = document.createElement('li');
            li.className = 'criteria-item';
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            const spanTitle = document.createElement('span');
            spanTitle.className = 'criteria-title';
            spanTitle.textContent = title;
            const badge = document.createElement('span');
            badge.className = `criteria-badge ${pass ? 'criteria-pass' : 'criteria-fail'}`;
            badge.textContent = pass ? '达标' : '未达标';
            header.appendChild(spanTitle);
            header.appendChild(badge);
            li.appendChild(header);

            if (extraBoxes && extraBoxes.length) {
                const extras = document.createElement('div');
                extras.style.marginTop = '8px';
                extras.style.display = 'grid';
                extras.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))';
                extras.style.gap = '8px';
                extraBoxes.forEach(([label, value]) => {
                    const box = document.createElement('div');
                    box.style.background = '#f8f9fa';
                    box.style.border = '1px solid #eee';
                    box.style.borderRadius = '6px';
                    box.style.padding = '6px 8px';
                    box.textContent = `${label}: ${value}`;
                    extras.appendChild(box);
                });
                li.appendChild(extras);
            }
            checklist.appendChild(li);
        }

        // 1) 杯深 15–50%，>60% 判为过深
        const depth = cheat.cup?.depthPct;
        const depthPass = depth != null && depth >= 15 && depth <= 50;
        addCheck('杯深（15%–50%，>60% 风险）', depthPass, [
            ['杯深(%)', depth != null ? depth.toFixed(1) + '%' : '-']
        ]);

        // 2) 基底时长 3–45 周
        const dur = cheat.cup?.durationWeeks;
        const durPass = dur != null && dur >= 3 && dur <= 45;
        addCheck('基底时长（3–45周）', durPass, [
            ['时长(周)', dur ?? '-']
        ]);

        // 3) 先前涨幅 ≥25%
        const prior = cheat.prior?.priorRunupPct;
        const priorPass = prior != null && prior >= 25;
        addCheck('先前涨幅（≥25%）', priorPass, [
            ['先前涨幅(%)', prior != null ? prior.toFixed(1) + '%' : '-']
        ]);

        // 4) 200MA 向上且站上
        const above200 = !!cheat.trend?.above200ma;
        const maUpDays = cheat.trend?.ma200UpDays ?? null;
        const maSlopePass = maUpDays != null && maUpDays >= 21;
        addCheck('价格在200MA上方', above200, []);
        addCheck('200MA 向上（≥21天）', maSlopePass, [
            ['200MA上行天数', maUpDays ?? '-']
        ]);

        // 5) 提前买点位置（位于杯中三分之一及以上）
        const cp = cheat.buyPoints?.cheatPivot?.price;
        const mid = cheat.cup?.midLine;
        const upperOk = (cp != null && mid != null) ? (cp >= mid) : false;
        addCheck('提前买点位置（≥杯中位线）', upperOk, [
            ['Cheat Pivot', cp != null && cp.toFixed ? cp.toFixed(2) : (cp ?? '-')],
            ['中位线', mid != null && mid.toFixed ? mid.toFixed(2) : (mid ?? '-')]
        ]);
    }

    // 四步法阶段渲染
    if (stepsEl) {
        stepsEl.innerHTML = '';
        function stepBox(name, pass) {
            const d = document.createElement('div');
            d.style.background = pass ? '#e8f5e9' : '#f5f5f5';
            d.style.border = `1px solid ${pass ? '#c8e6c9' : '#eee'}`;
            d.style.borderRadius = '6px';
            d.style.padding = '8px 10px';
            d.style.fontWeight = '600';
            d.style.color = pass ? '#1b5e20' : '#666';
            d.textContent = `${name}：${pass ? '完成/满足' : '未满足'}`;
            stepsEl.appendChild(d);
        }
        const s = cheat.steps || {};
        stepBox('Downtrend', !!s.downtrend);
        stepBox('Uptrend', !!s.uptrend);
        // Pause补充显示平台宽度、缩量、紧致
        const pausePass = !!s.pause;
        stepBox('Pause (5–10%)', pausePass);
        if (pausePass) {
            const info = document.createElement('div');
            info.style.gridColumn = '1 / -1';
            info.style.background = '#fff';
            info.style.border = '1px dashed #ddd';
            info.style.borderRadius = '6px';
            info.style.padding = '8px 10px';
            info.style.fontSize = '12px';
            info.style.color = '#333';
            const widthPct = cheat.plateau?.widthPct != null ? `${cheat.plateau.widthPct.toFixed(2)}%` : '-';
            const dry = cheat.endMetrics?.dryOk === null ? '-' : (cheat.endMetrics?.dryOk ? 'Yes' : 'No');
            const tight = cheat.endMetrics?.tightOk === null ? '-' : (cheat.endMetrics?.tightOk ? 'Yes' : 'No');
            const shake = cheat.plateau?.shakeout ? 'Yes' : 'No';
            info.textContent = `平台宽度: ${widthPct} ｜ 缩量: ${dry} ｜ 紧致: ${tight} ｜ Shakeout: ${shake}`;
            stepsEl.appendChild(info);
        }
        stepBox('Breakout', !!s.breakout);
    }

    // 阈值参数渲染
    if (thresholdsEl) {
        thresholdsEl.innerHTML = '';
        const th = cheat.thresholds || {};
        function box(label, value) {
            const d = document.createElement('div');
            d.style.background = '#f8f9fa';
            d.style.border = '1px solid #eee';
            d.style.borderRadius = '6px';
            d.style.padding = '6px 8px';
            d.textContent = `${label}: ${value}`;
            thresholdsEl.appendChild(d);
        }
        if (th.depthPct) box('杯深范围', `${th.depthPct.min}%–${th.depthPct.max}%（过深>${th.depthPct.tooDeep}%）`);
        if (th.durationWeeks) box('时长范围', `${th.durationWeeks.min}–${th.durationWeeks.max} 周`);
        if (th.priorRunupPctMin != null) box('先前涨幅≥', `${th.priorRunupPctMin}%`);
        if (th.ma200UpDaysMin != null) box('200MA上行≥', `${th.ma200UpDaysMin} 天`);
        if (th.plateauWidthPct) box('平台宽度', `${th.plateauWidthPct.min}%–${th.plateauWidthPct.max}%`);
        if (th.atrPctMax != null) box('ATR/Close ≤', `${(th.atrPctMax * 100).toFixed(1)}%`);
        if (th.dryFactor != null) box('缩量阈值', `10日均量 < 50日均量 × ${th.dryFactor}`);
        if (th.breakoutVolMult != null) box('突破量阈值', `≥ 10日均量 × ${th.breakoutVolMult}`);
    }
}

// 3. StockController 类
class StockController {
    constructor() {
        this.stockAPI = new StockAPI();
        this.chartManager = new ChartManager();
        this.analyzer = new StockAnalyzer();
        this.loading = document.getElementById('loading');
        this.errorMessage = document.getElementById('errorMessage');
    }
    
    showLoading() {
        this.loading.style.display = 'block';
    }
    
    hideLoading() {
        this.loading.style.display = 'none';
    }
    
    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }
    
    hideError() {
        this.errorMessage.style.display = 'none';
    }
    
    async analyzeStock(symbol) {
        try {
            this.hideError();
            this.showLoading();
            
            const stockData = await this.stockAPI.fetchStockData(symbol);
            
            if (!stockData || stockData.length === 0) {
                throw new Error('未获取到有效的股票数据');
            }

            // 更新图表
            this.chartManager.fullData = stockData;
            this.chartManager.renderChart(stockData);
            
            // 执行分析
            const analysis = this.analyzer.analyze(stockData);
            
            // 更新分析结果
            setTextareaContent('ma20Analysis', analysis.ma20Analysis);
            setTextareaContent('volumePriceAnalysis', analysis.volumePriceAnalysis);
            setTextareaContent('marketCharacter', analysis.marketCharacter);
            setTextareaContent('operationAdvice', analysis.operationAdvice);
            
        } catch (error) {
            console.error('分析股票时出错:', error);
            this.showError(error.message || '分析过程中出现错误');
            throw error;
        } finally {
            this.hideLoading();
        }
    }
}

// 4. 初始化代码
function initializeController() {
    if (!stockController) {
        stockController = new StockController();
    }
    return stockController;
}

// 5. DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeController();
    
    // 设置textarea自动调整高度
    document.querySelectorAll('textarea').forEach(textarea => {
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    });
});

// 6. 分析函数
window.analyzeStock = async function() {
    try {
        const controller = initializeController();
        
        const symbol = document.getElementById('stockCode').value.trim().toUpperCase();
        
        if (!symbol) {
            throw new Error('请输入股票代码');
        }
        
        if (!/^[A-Z]{1,5}$/.test(symbol)) {
            throw new Error('请输入正确的美股代码格式');
        }
        
        await controller.analyzeStock(symbol);

        // 获取并渲染 8 条标准
        try {
            const analysis = await fetchCriteria(symbol);
            renderCriteria(analysis.criteria || []);
            renderVcp(analysis.vcp);
            renderPivot(analysis.pivot);
            renderCheat(analysis.cheat);
            renderLowCheat(analysis.cheatLow);
            renderPowerPlay(analysis.powerPlay);
        } catch (e) {
            console.warn('获取8条标准失败：', e);
            const list = document.getElementById('criteriaList');
            if (list) {
                list.innerHTML = '<li class="criteria-item"><span class="criteria-title">无法获取8条标准</span><span class="criteria-badge criteria-fail">错误</span></li>';
            }
            renderVcp(null);
            renderPivot(null);
            renderCheat(null);
            renderLowCheat(null);
            renderPowerPlay(null);
        }

    } catch (error) {
        console.error('分析过程中出错:', error);
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = error.message || '分析过程中出现错误';
        errorMessage.style.display = 'block';
    }
};

// 辅助函数
window.setTextareaContent = function(id, content) {
    const textarea = document.getElementById(id);
    if (textarea) {
        textarea.value = content;
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
    }
};

window.changePeriod = function() {
    const period = parseInt(document.getElementById('periodSelector').value);
    stockController.chartManager.changePeriod(period);
};
