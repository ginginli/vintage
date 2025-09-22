# 股票分析助手

基于《笑傲牛熊》的股票分析工具，帮助投资者进行技术分析和决策。

## 功能特点

- MA20核心指标分析
- 量价配合分析
- 市场特征判断
- 操作建议生成
- K线图表展示

## 新增：独立分析接口（/api/analysis）

提供两种使用方式：

1) GET 在线拉取并分析（通过 Alpha Vantage 获取数据）

```
GET /api/analysis?symbol=AAPL

响应示例：
{
  "success": true,
  "source": "remote",
  "symbol": "AAPL",
  "analysis": {
    "indicators": {
      "lastClose": 123.45,
      "ma20": 120.12,
      "ma50": 118.88,
      "rsi14": 56.3,
      "avgVol20": 1234567
    },
    "signal": "bullish|bearish|neutral",
    "reasons": ["MA20 上穿 MA50，趋势偏强", "RSI 超过 70，存在超买风险"]
  }
}
```

2) POST 传入前端已获取的 K 线数据进行分析（离线/自有数据）

```
POST /api/analysis
Content-Type: application/json

{
  "stockData": [
    {"date":"2024-01-01","open":1,"high":2,"low":0.8,"close":1.5,"volume":1000},
    {"date":"2024-01-02","open":1.6,"high":2.1,"low":1.2,"close":1.9,"volume":1500}
    // ... 按时间升序排列，至少包含 close/volume 字段
  ]
}

响应结构与 GET 相同（source=client）。
```

说明：
- 该接口与现有 `/api/stock` 相互独立，不影响原有逻辑；
- `GET` 模式需要配置环境变量 `ALPHA_VANTAGE_API_KEY`（可在 Vercel 项目中配置）。

### IBD RS 与 RS 线（第七条标准）
- 若配置了 IBD 网关：
  - `IBD_API_BASE_URL`、`IBD_API_KEY` 用于获取 IBD 的 RS Rating 与 RS 线；
  - 第七条标准：RS Rating ≥ 70 且 RS 线近 6 周上行（优选 ≥ 90 和 13 周）。
- 若未配置 IBD：
  - 启用“RS 评级代理”（横截面百分位 1–99）。优先顺序：
    1) `peers` 请求参数提供的股票池；
    2) `SP500_SYMBOLS` 环境变量提供的标普500成分（需同时传 `pool=SP500` 或 `use_sp500_pool=1`）。
  - 始终保留 RS 线用 SPY 为基准判断上行周数（兜底方案）。

### 环境变量
- `ALPHA_VANTAGE_API_BASE_URL`（可选）
- `ALPHA_VANTAGE_API_KEY`（必需）
- `IBD_API_BASE_URL`（可选，存在则启用 IBD 数据）
- `IBD_API_KEY`（可选，存在则启用 IBD 数据）
- `SP500_SYMBOLS`（可选，逗号分隔的标普500成分，用于 RS 评级代理）

### GET 使用示例
```
# 直接分析（仅大盘与基本指标）
/api/analysis?symbol=AAPL

# 使用自定义 peers 计算 RS 评级代理（横截面百分位）
/api/analysis?symbol=AAPL&peers=MSFT,GOOGL,NVDA,AMZN&rs_lookback_days=126

# 使用标普500成分作为股票池（需配置 SP500_SYMBOLS）
/api/analysis?symbol=AAPL&pool=SP500&pool_limit=50&rs_lookback_days=126
```

## 使用说明

1. 输入美股代码（如：AAPL、GOOGL、MSFT）
2. 点击"分析"按钮
3. 等待数据加载和分析完成
4. 查看分析结果和操作建议

## 注意事项

- 每次查询后需等待12秒才能进行下一次查询
- 每分钟最多查询5次
- 每天最多查询500次 