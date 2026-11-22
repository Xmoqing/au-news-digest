# AU News Digest · 澳洲与国际热点速览

专为 **Samsung Galaxy Z Fold 8** 双屏体验、**长辈大字阅读**与 **NAS Docker 部署**打造的全栈澳洲 & 国际热点新闻聚合 PWA。

## 核心特性

- **16 大澳洲与国际主流 RSS 数据源**（含 5 大硬核股市证券与交易市场专属源，自动提取完整正文与高清配图）：
  - 澳洲本地：ABC News Australia、ABC Sydney / NSW、ABC Business、The Guardian Australia、SBS News、SMH Sydney
  - 股市证券与交易市场：ASX Markets (Small Caps)、CNBC Investing、CNBC Markets、MarketWatch Live、Seeking Alpha
  - 国际热点与科技：BBC World News、The Guardian World、Al Jazeera English、NPR News、TechCrunch
- **5 大精准分类体系**：`全部`、`澳洲要闻`、`国际热点`、`财经市场`（严格聚焦股市/财报/央行利率/外汇大宗商品，自动排除泛零售与个人生活理财）、`科技前沿`、`社会生活`。
- **Gemini AI 批量深度编译 + 核心要点提炼**：基于 `@google/genai` SDK Structured Outputs，每批合并 6 篇节省免费额度，内置多模型自动降级链（默认 `gemini-flash-lite-latest`，可通过 `GEMINI_MODEL` 热切换），生成中文标题、60 字摘要、**2～3 条分点核心要点（发生了什么 / 有什么影响）**与分段中文全文。
- **长辈友好阅读优化**：
  - 顶部导航栏内置 **`A- / 标准·大号·特大 / A+`** 字号切换开关（`localStorage` 持久记住）并兼容系统级字体缩放（`<meta name="text-scale" content="scale">`）。
  - 详情页顶部「核心速览」突出呈现清晰编号的分点要点，阅读更省力。
- **公网访问基础安全保护**：
  - 可选配置环境变量 `ACCESS_PASSWORD`：未设置时保持免密访问；设置后首次访问弹出简洁口令框，验证通过后 HttpOnly Cookie 记住 30 天，并同步保护 `GET /api/news` 与 `POST /api/refresh` 防止外部恶意刷接口消耗 API 额度。
- **实时澳元/人民币汇率胶囊 + 双向换算小工具**：通过 `/api/exchange-rate`（Frankfurter ECB 主源 + ExchangeRate-API 备用源，15 分钟内存缓存）展示 `🇦🇺 1 AUD ≈ ¥X.XXXX CNY`，点击胶囊展开双向澳元 ⇄ 人民币实时换算器。
- **跨媒体智能主题合并（去重防刷屏）**：抓取编译时自动结合近 24 小时已入库主新闻上下文，由 Gemini 识别同一突发事件并归并至同一 `cluster_id`；目录仅展示主题主卡片并高亮「综合 N 家媒体报道」，详情页内可直接点击媒体 Tab 切换不同媒体的报道正文。
- **历史文章分类一键校准 (`/api/reclassify-history`)**：支持在顶部工具栏点击「校准分类」图标按钮，或浏览器直接访问 `/api/reclassify-history?pwd=你的密码`（支持 `GET` / `POST`），按每批 50 篇将历史旧文章仅重新判定 `category` 字段写回 SQLite，不删除文章、不重新翻译正文。
- **无损平滑数据库迁移 + 1000 篇滚动持久化**：启动时通过 `PRAGMA table_info(articles)` 安全检查缺失列再 `ALTER TABLE`，100% 保留极空间 NAS 上现有的 `data/news.db` 历史新闻与译文。

## 极空间 / NAS Docker Compose 部署

无需隐藏的 `.env` 文件，直接在极空间 Docker Compose 环境变量中填入即可：

```yaml
services:
  au-news-digest:
    build:
      context: .
      dockerfile: Dockerfile
    image: au-news-digest:latest
    container_name: au-news-digest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - TZ=Australia/Sydney
      - DATABASE_PATH=/app/data/news.db
      - GEMINI_API_KEY=你的Gemini_Key
      - GEMINI_MODEL=gemini-flash-lite-latest
      - MAX_ITEMS_PER_FEED=6
      - ACCESS_PASSWORD=可选的家庭访问口令（留空则免密）
    volumes:
      - ./data:/app/data
```
