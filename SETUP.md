# 配置指南

## 当前状态

✅ **前端代码** - 完全正常，所有JavaScript错误已修复  
❌ **后端API** - 需要配置环境变量

## 快速配置步骤

### 1. 获取Alpha Vantage API密钥

1. 访问：https://www.alphavantage.co/support/#api-key
2. 填写表单（姓名、邮箱等）
3. 点击 "GET FREE API KEY"
4. 复制你的API密钥（类似：`ABCD1234EFGH5678`）

### 2. 在Vercel中配置环境变量

#### 方法一：通过Vercel网页控制台

1. 登录 https://vercel.com
2. 选择你的项目 `vintage`
3. 点击 **Settings** 标签
4. 在左侧菜单选择 **Environment Variables**
5. 添加新的环境变量：
   - **Name**: `ALPHA_VANTAGE_API_KEY`
   - **Value**: 粘贴你的API密钥
   - **Environment**: 选择所有环境（Production, Preview, Development）
6. 点击 **Save**
7. 重新部署项目（Settings → Deployments → 最新部署 → Redeploy）

#### 方法二：通过Vercel CLI

```bash
# 安装Vercel CLI（如果还没安装）
npm i -g vercel

# 登录
vercel login

# 添加环境变量
vercel env add ALPHA_VANTAGE_API_KEY

# 按提示输入API密钥值
# 选择应用到所有环境

# 重新部署
vercel --prod
```

### 3. 验证配置

配置完成后：

1. 等待Vercel重新部署（约1-2分钟）
2. 访问你的网站：https://vintage-taupe.vercel.app
3. 输入股票代码（如：AAPL）
4. 点击"分析"按钮
5. 应该能看到数据加载和分析结果

## 常见问题

### Q: 配置后还是500错误？
A: 
- 确保已重新部署项目
- 检查环境变量名称是否正确（区分大小写）
- 查看Vercel函数日志：Settings → Functions → 查看日志

### Q: API调用频率限制？
A: Alpha Vantage免费版限制：
- 每分钟5次请求
- 每天500次请求
- 建议在查询间隔12秒以上

### Q: 如何查看详细错误？
A: 
1. 在Vercel控制台查看函数日志
2. 或在浏览器控制台查看网络请求详情

## 测试建议

推荐测试的股票代码：
- AAPL（苹果）
- MSFT（微软）
- GOOGL（谷歌）
- TSLA（特斯拉）
- NVDA（英伟达）

## 需要帮助？

如果遇到问题：
1. 检查Vercel函数日志
2. 查看浏览器控制台错误
3. 确认API密钥有效
4. 确认没有超出API调用限制