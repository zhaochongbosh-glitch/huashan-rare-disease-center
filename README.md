# Huashan Rare Disease Center 官网原型

这是第一版静态官网原型，重点验证信息架构和合规边界：

- 中心网站负责导诊、说明、分流、科普、研究展示。
- 正式预约挂号、会诊申请、支付、病历上传等医疗行为回到医院官方平台。
- 第一版不收集身份证、医保、病历、基因检测报告等敏感个人信息。
- 疾病知识库仅覆盖中国第一批、第二批罕见病目录中的疾病，目录外疾病不建立百科条目。
- 疾病、政策、临床研究内容需建立作者、医学审核、更新时间和复审机制。

## 页面

- `index.html` 首页
- `about.html` 中心介绍
- `visit.html` 我要看病
- `team.html` 专家与 MDT 团队
- `mdt.html` MDT 申请说明
- `diseases.html` 疾病知识库
- `research.html` 临床研究
- `policy.html` 政策与医保
- `news.html` 新闻科普
- `contact.html` 联系我们
- `governance.html` 合规治理、隐私声明、医学免责声明

## 数据文件

- `data/diseases.json` 中国第一批、第二批罕见病目录 207 种疾病索引
- `data/clinic-services.json` 门办确认的官方入口、材料清单、MDT 申请渠道和院区门诊链接
- `data/mdt-directory.json` 附件 1 提取的全院区 MDT 团队目录
- `data/pediatric-scope.json` 附件 2 提取的未成年患者接诊资质与业务范围
- `data/floorplans.json` 附件 3 提取的各院区门诊平面图索引
- `data/experts.json` 专家与 MDT 团队数据结构
- `data/trials.json` 临床研究数据结构
- `data/news.json` 新闻科普数据结构
- `data/policies.json` 政策医保数据结构
- `data/site-data.js` 面向 `file://` 直接打开的内置数据包

## 附件更新

附件 1、2、3 的提取脚本位于 `tools/extract_attachments.py`。当门办更新附件后，可以重新运行：

```powershell
& 'C:\Users\zhaochob\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' tools\extract_attachments.py
```

脚本会更新 MDT 目录、未成年接诊资质和 `assets/floorplans/` 下的平面图资源。

如果修改了 `data/*.json`，请重新生成内置数据包：

```powershell
node tools\build_site_data.js
```

## 本地预览

现在可以直接双击 `index.html` 或各页面 HTML 预览；页面会优先使用 `data/site-data.js` 中的内置数据。

也可以在当前目录启动静态服务器预览：

```powershell
node server.js
```

然后访问 `http://localhost:8000`。

如果通过服务器预览，页面会在内置数据不可用时读取 `data/*.json`。

## 上线前需要替换

- 医院批准的视觉识别、Logo、版权和备案信息。
- 官方预约挂号、MDT、互联网医院、伦理委员会、临床试验机构等准确链接。
- 专家名单、专病组、出诊信息、门诊地址和联系方式。
- 经医学审核的疾病百科、临床研究和政策医保内容。
- 政策与医保页面中的摘要、适用地区、适用时间和复审日期。
