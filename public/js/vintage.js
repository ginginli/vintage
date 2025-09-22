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
    (vcp.contractions || []).forEach((c, idx) => {
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
}

// 4. 接入现有 analyzeStock 流程
window.analyzeStock = async function() {
    try {
        const input = document.getElementById('stockCode');
        const symbol = input.value.trim().toUpperCase();
        if (!symbol) return;

        document.getElementById('errorMessage').style.display = 'none';
        document.getElementById('loading').style.display = 'block';

        const api = new StockAPI();
        const stockData = await api.fetchStockData(symbol);
        const chartManager = new ChartManager();
        chartManager.fullData = stockData;
        chartManager.changePeriod(parseInt(document.getElementById('periodSelector').value, 10));

        const analyzer = new StockAnalyzer();
        const result = analyzer.analyze(stockData);
        setTextareaContent('ma20Analysis', result.ma20Analysis);
        setTextareaContent('volumePriceAnalysis', result.volumePriceAnalysis);
        setTextareaContent('marketCharacter', result.marketCharacter);
        setTextareaContent('operationAdvice', result.operationAdvice);

        // 获取并渲染 8 条标准
        try {
            const criteria = await fetchCriteria(symbol);
            renderCriteria(criteria);
        } catch (e) {
            console.warn('获取8条标准失败：', e);
        }
    } catch (error) {
        const errEl = document.getElementById('errorMessage');
        errEl.textContent = error.message || '发生未知错误';
        errEl.style.display = 'block';
    } finally {
        document.getElementById('loading').style.display = 'none';
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
        } catch (e) {
            console.warn('获取8条标准失败：', e);
            const list = document.getElementById('criteriaList');
            if (list) {
                list.innerHTML = '<li class="criteria-item"><span class="criteria-title">无法获取8条标准</span><span class="criteria-badge criteria-fail">错误</span></li>';
            }
            renderVcp(null);
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
