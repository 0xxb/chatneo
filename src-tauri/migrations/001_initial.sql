PRAGMA foreign_keys=ON;

-- 会话表
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider_id INTEGER,
    model_id TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX idx_conversations_pinned ON conversations(pinned);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'error')),
    content TEXT NOT NULL DEFAULT '',
    thinking TEXT NOT NULL DEFAULT '',
    parts TEXT NOT NULL DEFAULT '',
    token_count TEXT,
    rag_results TEXT NOT NULL DEFAULT '',
    search_results TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- 附件表（文件存磁盘，数据库只存路径）
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('image', 'file')),
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    thumbnail_path TEXT,
    size INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX idx_attachments_message ON attachments(message_id);
CREATE INDEX idx_attachments_path ON attachments(path);

-- 服务商配置表
CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- 模型收藏表
CREATE TABLE IF NOT EXISTS model_favorites (
    model_id TEXT NOT NULL,
    provider_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (model_id, provider_id)
);

-- 通用设置表
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 初始设置
INSERT INTO settings (key, value) VALUES
    ('language', 'zh-CN'),           -- 系统语言: zh-CN | en
    ('theme', 'system'),             -- 主题: system | light | dark
    ('proxy', ''),                   -- 网络代理: 空为不使用, 例如 socks5://127.0.0.1:6153
    ('tray_visibility', 'when_running'), -- 菜单栏显示: always | when_running | never
    ('accent_color', 'default'),     -- 重点色: default | orange | yellow | green | blue | pink
    ('send_key', 'Enter'),           -- 发送快捷键: Enter | Cmd+Enter
    ('font_size', 'medium'),         -- 字体大小: small | medium | large
    ('launch_at_startup', '0'),      -- 开机自启: 0 | 1
    ('minimize_to_tray', '1'),       -- 关闭时最小化到托盘: 0 | 1
    ('log_enabled', '1'),            -- 日志启用: 0 | 1
    ('log_retention_days', '7'),     -- 日志保留天数: 3 | 7 | 14 | 30
    ('webdav_enabled', '0'),              -- WebDAV 云备份启用: 0 | 1
    ('webdav_url', ''),                   -- WebDAV 服务器地址
    ('webdav_username', ''),              -- 用户名
    ('webdav_password', ''),              -- 密码
    ('webdav_backup_path', '/chatneo/backups/'), -- 备份目录路径
    ('webdav_backup_interval', '86400000'),      -- 定时备份间隔(ms): 3600000|21600000|43200000|86400000|604800000
    ('webdav_max_backups', '10'),                -- 最大保留备份数
    ('webdav_last_backup_time', '0'),            -- 上次备份时间戳
    ('webdav_last_backup_status', ''),           -- 上次备份状态: success | failed
    ('webdav_last_backup_error', ''),            -- 上次备份错误信息
    ('tts_provider', 'sherpa'),           -- TTS 引擎: sherpa | openai
    ('tts_sherpa_model', ''),             -- 本地模型 ID
    ('tts_openai_base_url', 'https://api.openai.com'), -- TTS API 地址
    ('tts_openai_api_key', ''),           -- TTS API 密钥
    ('tts_openai_model', 'tts-1'),        -- TTS API 模型
    ('tts_openai_voice', 'alloy'),        -- TTS API 音色
    ('tts_speed', '1.0'),                 -- 语速: 0.5 - 2.0
    ('tts_auto_read', '0'),               -- 自动朗读: 0 | 1
    ('font_family', ''),                  -- 正文字体: 空为系统默认
    ('code_font', ''),                    -- 代码字体: 空为系统默认
    ('line_height', 'standard'),          -- 行高: compact | standard | relaxed
    ('message_density', 'standard'),      -- 消息密度: compact | standard | spacious
    ('code_theme', 'auto'),               -- 代码高亮主题: auto | github | one-dark | monokai
    ('code_word_wrap', '0'),              -- 代码自动换行: 0 | 1
    ('shortcuts', '{}'),                   -- 自定义快捷键映射 (JSON)
    ('chat_bg_image', ''),                 -- 聊天背景: 空=无, preset:xxx=预置渐变, 文件路径=自定义图片
    ('chat_bg_blur', '0'),                 -- 背景模糊度: 0-20 (px)
    ('chat_bg_dimming', '30'),             -- 背景暗度: 0-100 (%)
    ('chat_bubble_style', 'flat'),         -- 气泡样式: flat | bubble
    ('chat_bubble_opacity', '80'),         -- 气泡不透明度: 0-100 (%)
    ('chat_border_radius', '16');          -- 气泡圆角: 0-24 (px)

-- 提示词表
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    variables TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX idx_prompts_sort ON prompts(sort_order ASC, created_at ASC);
CREATE INDEX idx_prompts_category ON prompts(category);

-- 内置提示词
-- 分类: translation (翻译语言)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-translator', '翻译助手', '你是一位专业的翻译专家。请将用户输入的内容翻译为{{目标语言}}，保持原文的语气和风格，确保翻译自然流畅。只输出翻译结果，不要添加解释。', '[{"name":"目标语言","type":"input"}]', 'translation', 1, 0, 0),
    ('builtin-grammar-check', '语法纠错', '你是一位{{语言}}语言专家。请检查以下文本中的语法错误、拼写错误和不恰当的表达，给出修改建议并解释原因。', '[{"name":"语言","type":"input","default":"英语"}]', 'translation', 2, 0, 0),
    ('builtin-interpreter', '同声传译', '你是一位专业的同声传译员。请将用户说的话实时翻译为{{目标语言}}，保持口语化和自然流畅，不需要逐字翻译，重点传达意思。', '[{"name":"目标语言","type":"input","default":"英语"}]', 'translation', 3, 0, 0),
    ('builtin-localization', '本地化专家', '你是一位软件本地化专家。请将以下 UI 文案翻译为{{目标语言}}，注意：1) 保持简洁 2) 符合目标语言的使用习惯 3) 保留技术术语 4) 注意上下文语境。', '[{"name":"目标语言","type":"input"}]', 'translation', 4, 0, 0),
    ('builtin-classical-chinese', '文言文翻译', '你是一位古汉语专家。请将以下内容在文言文和白话文之间互译。如果输入是文言文，翻译为通俗易懂的现代汉语；如果输入是现代汉语，翻译为优雅的文言文。附上关键字词的注释。', '[]', 'translation', 5, 0, 0);

-- 分类: writing (写作创作)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-rewrite', '文案润色', '请对以下文本进行润色和改写，使其更加{{风格}}，同时保持原意不变。', '[{"name":"风格","type":"input"}]', 'writing', 10, 0, 0),
    ('builtin-xiaohongshu', '小红书文案', '你是一位资深小红书博主。请根据以下主题生成一篇小红书风格的文案，要求：1) 吸引眼球的标题（带 emoji）2) 口语化、有感染力的正文 3) 适当使用 emoji 4) 结尾带话题标签。主题关于{{主题}}。', '[{"name":"主题","type":"input"}]', 'writing', 11, 0, 0),
    ('builtin-wechat-article', '公众号文章', '你是一位资深微信公众号编辑。请根据以下主题撰写一篇公众号文章，要求：1) 引人入胜的标题 2) 结构清晰、段落分明 3) 语言通俗易懂 4) 适当使用小标题和重点标记。主题：{{主题}}，风格：{{风格}}。', '[{"name":"主题","type":"input"},{"name":"风格","type":"select","options":["专业严谨","轻松幽默","深度分析","故事叙事"],"default":"专业严谨"}]', 'writing', 12, 0, 0),
    ('builtin-email-writer', '邮件撰写', '请帮我撰写一封{{类型}}邮件。要求语气{{语气}}，内容简洁明了，结构清晰。请根据我提供的要点生成完整邮件。', '[{"name":"类型","type":"select","options":["商务","求职","感谢","道歉","通知","邀请"],"default":"商务"},{"name":"语气","type":"select","options":["正式","友好","简洁","热情"],"default":"正式"}]', 'writing', 13, 0, 0),
    ('builtin-weekly-report', '周报生成', '你是一位高效的职场人。请根据我提供的工作内容，生成一份结构清晰的{{报告类型}}。要求：1) 用简洁的条目式列举 2) 突出关键成果和数据 3) 包含下一步计划 4) 语言专业得体。', '[{"name":"报告类型","type":"select","options":["周报","月报","日报","项目总结"],"default":"周报"}]', 'writing', 14, 0, 0),
    ('builtin-copywriting', '广告文案', '你是一位创意广告文案师。请为以下产品/服务撰写广告文案。要求：1) 抓住目标受众痛点 2) 突出核心卖点 3) 包含行动号召 4) 文案风格{{风格}}。', '[{"name":"风格","type":"select","options":["简约高端","活泼年轻","专业可信","情感共鸣"],"default":"简约高端"}]', 'writing', 15, 0, 0),
    ('builtin-story-writer', '故事创作', '你是一位富有想象力的作家。请根据以下设定创作一个{{类型}}故事。要求情节引人入胜，人物形象丰满，语言生动有画面感。', '[{"name":"类型","type":"select","options":["科幻","奇幻","悬疑","爱情","恐怖","寓言"],"default":"科幻"}]', 'writing', 16, 0, 0),
    ('builtin-slogan', '品牌标语', '你是一位品牌策划专家。请为以下品牌/产品生成 5 个候选标语（Slogan），要求：简短有力、朗朗上口、传达核心价值、易于记忆。', '[]', 'writing', 17, 0, 0),
    ('builtin-speech-draft', '演讲稿撰写', '你是一位资深演讲稿撰写人。请根据以下主题和场合撰写一篇{{时长}}分钟的演讲稿，要求：开头吸引注意力、逻辑清晰、感情真挚、结尾有力。', '[{"name":"时长","type":"select","options":["3","5","10","15","20"],"default":"5"}]', 'writing', 18, 0, 0);

-- 分类: development (开发编程)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-code-review', '代码审查', '你是一位资深的软件工程师。请对以下代码进行审查，指出潜在的问题、性能隐患和改进建议。使用{{编程语言}}的最佳实践标准。', '[{"name":"编程语言","type":"input"}]', 'development', 20, 0, 0),
    ('builtin-debug-helper', '调试助手', '你是一位经验丰富的调试专家。我遇到了一个 Bug，请帮我分析可能的原因并提供解决方案。请一步步分析，从最可能的原因开始排查。使用的技术栈：{{技术栈}}。', '[{"name":"技术栈","type":"input"}]', 'development', 21, 0, 0),
    ('builtin-sql-expert', 'SQL 专家', '你是一位数据库专家。请根据我的需求编写高效的 SQL 查询语句，使用{{数据库}}语法。请解释查询逻辑，并给出性能优化建议。', '[{"name":"数据库","type":"select","options":["MySQL","PostgreSQL","SQLite","SQL Server","Oracle"],"default":"MySQL"}]', 'development', 22, 0, 0),
    ('builtin-regex-helper', '正则表达式', '你是正则表达式专家。请根据我的匹配需求编写正则表达式，并详细解释每个部分的含义。同时提供几个测试用例验证正确性。', '[]', 'development', 23, 0, 0),
    ('builtin-git-commit', 'Git Commit 信息', '你是一位遵循 Conventional Commits 规范的开发者。请根据以下代码变更描述，生成规范的 Git commit 信息。格式：type(scope): description。类型包括 feat/fix/docs/style/refactor/test/chore。请用{{语言}}撰写。', '[{"name":"语言","type":"select","options":["英文","中文"],"default":"英文"}]', 'development', 24, 0, 0),
    ('builtin-api-designer', 'API 设计', '你是一位 API 架构师。请根据我描述的业务需求，设计 RESTful API 接口。包括：1) 路由设计 2) 请求/响应格式 3) 状态码 4) 错误处理 5) 参数校验规则。风格：{{风格}}。', '[{"name":"风格","type":"select","options":["RESTful","GraphQL","gRPC"],"default":"RESTful"}]', 'development', 25, 0, 0),
    ('builtin-unit-test', '单元测试', '你是一位测试工程师。请为以下代码编写全面的单元测试，使用{{测试框架}}框架。覆盖正常流程、边界条件和异常情况。', '[{"name":"测试框架","type":"input","default":"Jest"}]', 'development', 26, 0, 0),
    ('builtin-code-refactor', '代码重构', '你是一位代码重构专家。请对以下代码进行重构，目标：1) 提高可读性 2) 减少重复 3) 遵循 SOLID 原则 4) 保持功能不变。请解释每处改动的理由。', '[]', 'development', 27, 0, 0),
    ('builtin-arch-advisor', '架构顾问', '你是一位资深软件架构师。请对以下技术方案进行评估，从可扩展性、可维护性、性能、安全性、成本等角度给出专业建议和替代方案。', '[]', 'development', 28, 0, 0),
    ('builtin-code-explain', '代码解读', '你是一位耐心的编程导师。请逐行解释以下代码的功能和逻辑，用通俗易懂的语言，适合{{水平}}开发者理解。', '[{"name":"水平","type":"select","options":["初级","中级","高级"],"default":"中级"}]', 'development', 29, 0, 0),
    ('builtin-shell-expert', 'Shell 命令', '你是一位 Linux/macOS 命令行专家。请根据我的需求提供相应的 Shell 命令，并解释每个参数的含义。如果操作有风险，请提醒注意事项。', '[]', 'development', 30, 0, 0),
    ('builtin-docker-expert', 'Docker 专家', '你是一位容器化专家。请帮我编写 Dockerfile 或 docker-compose 配置，遵循最佳实践：多阶段构建、最小化镜像体积、安全加固。', '[]', 'development', 31, 0, 0);

-- 分类: productivity (效率工具)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-summarizer', '内容总结', '请对以下内容进行简明扼要的总结，提取核心要点，以{{输出格式}}格式输出。', '[{"name":"输出格式","type":"input"}]', 'productivity', 40, 0, 0),
    ('builtin-meeting-minutes', '会议纪要', '你是一位高效的会议记录员。请根据以下会议内容整理出结构化的会议纪要，包括：1) 会议主题 2) 关键讨论点 3) 决策事项 4) 待办任务及负责人 5) 下次会议安排。', '[]', 'productivity', 41, 0, 0),
    ('builtin-mind-map', '思维导图', '请将以下内容整理为思维导图的文本大纲格式（使用缩进层级表示），帮助我理清思路和结构。层级不超过 4 层，每个节点简明扼要。', '[]', 'productivity', 42, 0, 0),
    ('builtin-data-analyst', '数据分析', '你是一位数据分析师。请对以下数据进行分析，包括：1) 数据概览和统计 2) 关键趋势和规律 3) 异常值分析 4) 可视化建议 5) 行动建议。', '[]', 'productivity', 43, 0, 0),
    ('builtin-format-converter', '格式转换', '请将以下内容从{{源格式}}格式转换为{{目标格式}}格式，确保数据完整且格式正确。', '[{"name":"源格式","type":"select","options":["JSON","YAML","XML","CSV","Markdown","TOML"],"default":"JSON"},{"name":"目标格式","type":"select","options":["JSON","YAML","XML","CSV","Markdown","TOML"],"default":"YAML"}]', 'productivity', 44, 0, 0),
    ('builtin-todo-planner', '任务拆解', '你是一位项目管理专家。请将以下目标/任务拆解为可执行的子任务清单，每个任务包含：具体行动、预估时间、优先级。按依赖关系排序。', '[]', 'productivity', 45, 0, 0),
    ('builtin-pros-cons', '利弊分析', '请对以下方案/决策进行全面的利弊分析，从多个维度评估（如成本、时间、风险、收益等），最后给出你的建议。以表格形式呈现。', '[]', 'productivity', 46, 0, 0),
    ('builtin-ppt-outline', 'PPT 大纲', '你是一位演示文稿专家。请根据以下主题生成 PPT 大纲，包含：1) 封面 2) 目录 3) 各章节标题和要点 4) 总结页。约{{页数}}页，风格{{风格}}。', '[{"name":"页数","type":"select","options":["8","12","16","20"],"default":"12"},{"name":"风格","type":"select","options":["商务简约","学术严谨","创意活泼"],"default":"商务简约"}]', 'productivity', 47, 0, 0),
    ('builtin-ocr-extract', '表格提取', '请从以下文本/图片描述中提取结构化数据，整理为 Markdown 表格格式。确保数据准确、列对齐、无遗漏。', '[]', 'productivity', 48, 0, 0);

-- 分类: learning (学习教育)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-explain', '概念解释', '请用通俗易懂的语言解释以下概念，适合{{受众}}理解。可以使用类比和实例来辅助说明。', '[{"name":"受众","type":"input"}]', 'learning', 50, 0, 0),
    ('builtin-english-teacher', '英语老师', '你是一位耐心的英语老师。请帮助我学习英语，包括：纠正语法错误、解释用法、提供例句、给出更地道的表达方式。我的英语水平是{{水平}}。', '[{"name":"水平","type":"select","options":["入门","初级","中级","高级"],"default":"中级"}]', 'learning', 51, 0, 0),
    ('builtin-interviewer', '模拟面试官', '你是一位{{领域}}领域的资深面试官。请模拟真实面试场景，逐个提问并对我的回答给出评价和改进建议。难度级别：{{难度}}。每次只问一个问题，等我回答后再继续。', '[{"name":"领域","type":"select","options":["前端开发","后端开发","产品经理","数据分析","UI设计","市场营销","人力资源"],"default":"前端开发"},{"name":"难度","type":"select","options":["初级","中级","高级"],"default":"中级"}]', 'learning', 52, 0, 0),
    ('builtin-quiz-maker', '出题助手', '你是一位出题专家。请根据以下知识点出{{数量}}道{{题型}}题目，每道题附带正确答案和详细解析。难度适合{{级别}}。', '[{"name":"数量","type":"select","options":["5","10","15","20"],"default":"10"},{"name":"题型","type":"select","options":["选择题","填空题","判断题","简答题","综合题"],"default":"选择题"},{"name":"级别","type":"input","default":"大学本科"}]', 'learning', 53, 0, 0),
    ('builtin-study-plan', '学习计划', '你是一位学习规划师。请为我制定一份学习{{技能}}的计划，时间跨度{{周期}}，考虑到我每天可投入{{时间}}。包含：阶段目标、学习资源推荐、练习任务、里程碑检查点。', '[{"name":"技能","type":"input"},{"name":"周期","type":"select","options":["1个月","3个月","6个月","1年"],"default":"3个月"},{"name":"时间","type":"select","options":["30分钟","1小时","2小时","3小时以上"],"default":"1小时"}]', 'learning', 54, 0, 0),
    ('builtin-feynman', '费曼学习法', '请使用费曼学习法帮我理解以下概念：1) 用最简单的语言解释 2) 找出我可能不理解的地方 3) 用类比简化 4) 用一句话总结核心思想。', '[]', 'learning', 55, 0, 0),
    ('builtin-paper-reader', '论文解读', '你是一位学术研究员。请帮我解读以下论文/学术内容，包括：1) 研究背景和动机 2) 核心方法和创新点 3) 实验结果 4) 局限性和未来方向 5) 对实践的启示。', '[]', 'learning', 56, 0, 0),
    ('builtin-vocab-builder', '单词记忆', '你是一位词汇教学专家。请帮我深入学习以下{{语言}}单词/词组：1) 词义和词性 2) 词根词缀分析 3) 常见搭配 4) 例句（含中文翻译）5) 近义词/反义词 6) 记忆技巧。', '[{"name":"语言","type":"select","options":["英语","日语","韩语","法语","德语","西班牙语"],"default":"英语"}]', 'learning', 57, 0, 0);

-- 分类: lifestyle (生活娱乐)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-travel-planner', '旅行规划', '你是一位资深旅行规划师。请为我规划一次{{天数}}天的{{目的地}}旅行，包含：1) 每日行程安排 2) 交通建议 3) 住宿推荐 4) 美食推荐 5) 预算估算 6) 注意事项。旅行风格偏好：{{风格}}。', '[{"name":"目的地","type":"input"},{"name":"天数","type":"select","options":["3","5","7","10","14"],"default":"5"},{"name":"风格","type":"select","options":["休闲度假","深度文化","美食探索","户外冒险","亲子游"],"default":"休闲度假"}]', 'lifestyle', 60, 0, 0),
    ('builtin-recipe', '菜谱生成', '你是一位经验丰富的厨师。请根据{{食材}}生成一道{{菜系}}菜谱，包含：1) 菜品名称 2) 所需食材及用量 3) 详细步骤 4) 烹饪技巧和注意事项 5) 预计时间。', '[{"name":"食材","type":"input"},{"name":"菜系","type":"select","options":["中式家常","粤菜","川菜","日料","西餐","烘焙甜点","轻食沙拉"],"default":"中式家常"}]', 'lifestyle', 61, 0, 0),
    ('builtin-fitness-coach', '健身教练', '你是一位专业健身教练。请根据我的目标（{{目标}}）制定一份训练计划，每周{{频率}}次。包含：热身、训练动作（组数×次数）、休息时间、拉伸放松。我的健身水平：{{水平}}。', '[{"name":"目标","type":"select","options":["减脂","增肌","塑形","提升体能","改善体态"],"default":"减脂"},{"name":"频率","type":"select","options":["3","4","5","6"],"default":"4"},{"name":"水平","type":"select","options":["零基础","初级","中级","高级"],"default":"初级"}]', 'lifestyle', 62, 0, 0),
    ('builtin-movie-recommend', '影视推荐', '你是一位资深影评人。请根据我的偏好推荐 5 部{{类型}}影视作品，每部包含：1) 名称和年份 2) 导演/主演 3) 一句话推荐理由 4) 评分参考。我喜欢的风格：{{风格}}。', '[{"name":"类型","type":"select","options":["电影","电视剧","纪录片","动漫","综艺"],"default":"电影"},{"name":"风格","type":"input","default":"烧脑悬疑"}]', 'lifestyle', 63, 0, 0),
    ('builtin-gift-advisor', '送礼建议', '你是一位送礼达人。请帮我为{{对象}}推荐{{数量}}个礼物方案，预算{{预算}}元以内。考虑：实用性、心意、对方可能的喜好，每个方案说明推荐理由。', '[{"name":"对象","type":"input","default":"女朋友"},{"name":"数量","type":"select","options":["3","5","8"],"default":"5"},{"name":"预算","type":"input","default":"500"}]', 'lifestyle', 64, 0, 0),
    ('builtin-name-generator', '起名助手', '你是一位精通{{类型}}起名的专家。请根据以下要求生成 10 个候选名字，每个附带含义解释和寓意说明。', '[{"name":"类型","type":"select","options":["宝宝取名","品牌命名","项目命名","网名/昵称","宠物起名","小说角色"],"default":"宝宝取名"}]', 'lifestyle', 65, 0, 0);

-- 分类: professional (专业领域)
INSERT INTO prompts (id, title, content, variables, category, sort_order, created_at, updated_at) VALUES
    ('builtin-legal-advisor', '法律顾问', '你是一位{{法域}}法律顾问。请根据我描述的情况提供法律分析和建议，包括：1) 涉及的法律条文 2) 可能的法律风险 3) 建议的应对方案。注意：这仅供参考，不构成正式法律意见。', '[{"name":"法域","type":"select","options":["中国大陆","美国","欧盟","通用"],"default":"中国大陆"}]', 'professional', 70, 0, 0),
    ('builtin-product-manager', '产品经理', '你是一位资深产品经理。请帮我分析以下产品需求，输出：1) 用户故事 2) 功能优先级（P0-P3）3) 核心用户流程 4) 潜在风险和对策 5) 成功指标（KPI）。', '[]', 'professional', 71, 0, 0),
    ('builtin-marketing-expert', '营销策划', '你是一位营销策划专家。请为以下产品/活动制定营销方案，包括：1) 目标受众分析 2) 核心卖点提炼 3) 传播渠道选择 4) 内容策略 5) 预算分配建议 6) 效果评估指标。', '[]', 'professional', 72, 0, 0),
    ('builtin-financial-analyst', '财务分析', '你是一位财务分析师。请对以下财务数据/业务进行分析，包括：关键财务指标、盈利能力、风险评估和改进建议。请用专业但通俗的语言解释。', '[]', 'professional', 73, 0, 0),
    ('builtin-hr-assistant', '人事助手', '你是一位资深 HR。请帮我{{任务}}，确保内容专业、合规，符合人力资源管理最佳实践。', '[{"name":"任务","type":"select","options":["撰写招聘 JD","设计面试题目","制定绩效考核方案","起草员工手册","设计培训计划","处理劳动纠纷"],"default":"撰写招聘 JD"}]', 'professional', 74, 0, 0),
    ('builtin-seo-expert', 'SEO 优化', '你是一位 SEO 专家。请对以下内容/网站进行 SEO 分析和优化建议，包括：1) 关键词分析 2) 标题和描述优化 3) 内容结构建议 4) 技术 SEO 问题 5) 外链策略。', '[]', 'professional', 75, 0, 0),
    ('builtin-psychologist', '心理咨询师', '你是一位专业的心理咨询师。请以温暖、共情的态度与我交流，帮助我梳理情绪和想法。你可以使用认知行为疗法等专业方法，但请保持对话自然。注意：这不替代专业心理治疗。', '[]', 'professional', 76, 0, 0),
    ('builtin-contract-review', '合同审查', '你是一位合同审查专家。请审查以下合同条款，指出：1) 不合理或模糊的条款 2) 潜在风险点 3) 缺失的重要条款 4) 修改建议。使用{{法律体系}}相关法规作为参考。', '[{"name":"法律体系","type":"select","options":["中国法","美国法","通用商法"],"default":"中国法"}]', 'professional', 77, 0, 0);

-- 插件表
CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}'
);

-- MCP 服务器配置表
CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport TEXT NOT NULL CHECK(transport IN ('stdio', 'sse')),
    enabled INTEGER NOT NULL DEFAULT 1,
    -- stdio 配置
    command TEXT,
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '{}',
    -- sse/http 配置
    url TEXT,
    headers TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 工具配置表
CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    config TEXT NOT NULL DEFAULT '{}'
);

-- 知识库
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    embedding_provider_id INTEGER,
    embedding_model TEXT NOT NULL,
    dimensions INTEGER NOT NULL DEFAULT 768,
    chunk_size INTEGER NOT NULL DEFAULT 1000,
    chunk_overlap INTEGER NOT NULL DEFAULT 200,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 知识库文档
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('pdf', 'docx', 'url', 'txt', 'md')),
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    error TEXT,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
CREATE INDEX idx_knowledge_documents_kb ON knowledge_documents(knowledge_base_id);

-- 文档分段文本
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    content TEXT NOT NULL,
    position INTEGER NOT NULL,
    token_count INTEGER,
    FOREIGN KEY (document_id) REFERENCES knowledge_documents(id) ON DELETE CASCADE
);
CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(document_id);

-- 对话关联知识库
CREATE TABLE IF NOT EXISTS conversation_knowledge_bases (
    conversation_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, knowledge_base_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

-- 全局指令表
CREATE TABLE IF NOT EXISTS instructions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 对话关联指令表
CREATE TABLE IF NOT EXISTS conversation_instructions (
    conversation_id TEXT NOT NULL,
    instruction_id TEXT NOT NULL,
    PRIMARY KEY (conversation_id, instruction_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE
);
