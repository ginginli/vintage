# 股票分析助手

基于《笑傲牛熊》的股票分析工具，帮助投资者进行技术分析和决策。

## 功能特点

- MA20核心指标分析
- 量价配合分析
- 市场特征判断
- 操作建议生成
- K线图表展示
- 8条标准判定
- VCP分析
- Pivot枢轴分析
- Cheat Setup提前买点
- Power Play强力突破

## 环境配置

### 必需的环境变量

在Vercel项目中配置以下环境变量：

```
ALPHA_VANTAGE_API_KEY=your_api_key_here
```

### 可选的环境变量

```
ALPHA_VANTAGE_BASE_URL=https://www.alphavantage.co/query
IBD_API_BASE_URL=your_ibd_api_url_here
IBD_API_KEY=your_ibd_api_key_here
SP500_SYMBOLS=AAPL,MSFT,GOOGL,AMZN,TSLA,...
```

### 获取Alpha Vantage API密钥

1. 访问 [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
2. 免费注册账户
3. 获取API密钥
4. 在Vercel项目设置中添加环境变量 `ALPHA_VANTAGE_API_KEY`

## 本地开发

1. 复制环境变量模板：
```bash
cp .env.example .env.local
```

2. 编辑 `.env.local` 文件，填入你的API密钥

3. 启动开发服务器：
```bash
npm run dev
```

## API接口

### /api/stock
获取股票数据并进行基础分析

```
GET /api/stock?symbol=AAPL
```

### /api/analysis
提供两种使用方式：

1) GET 在线拉取并分析（通过 Alpha Vantage 获取数据）

```
GET /api/analysis?symbol=AAPL
```

2) POST 传入前端已获取的 K 线数据进行分析

```
POST /api/analysis
Content-Type: application/json

{
  "stockData": [
    {"date":"2024-01-01","open":1,"high":2,"low":0.8,"close":1.5,"volume":1000},
    {"date":"2024-01-02","open":1.6,"high":2.1,"low":1.2,"close":1.9,"volume":1500}
  ]
}
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
- 确保已正确配置Alpha Vantage API密钥

## 故障排除

### 500 Internal Server Error
- 检查是否已配置 `ALPHA_VANTAGE_API_KEY` 环境变量
- 确认API密钥有效且未超出调用限制
- 查看Vercel函数日志获取详细错误信息

### JavaScript错误
- 确保所有文件都已正确部署
- 检查浏览器控制台获取详细错误信息
- 清除浏览器缓存后重试