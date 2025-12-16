# Screen-Master 分镜大师 - AI 提示词合集
# Screen-Master Storyboard Master - AI Prompts Collection

> 来源 / Source: https://github.com/zluo03/screen-master

---

## 1. 多视角网格生成提示词 / Multi-View Grid Generation Prompt

**用途 / Purpose:** 生成多角度角色表/分镜网格  
**模型 / Model:** `gemini-3-pro-image-preview`

### English Version

```
Create a high-resolution ${gridType} grid layout containing exactly ${totalViews} distinct panels.
The overall image must be divided into a ${gridRows} row by ${gridCols} column grid.
Subject: "${prompt}".
Instructions:
- Generate a "Character Sheet" or "Multi-Angle View" contact sheet.
- Each panel must show the SAME subject/scene from a DIFFERENT angle or perspective (e.g., Front, Side, 3/4 View, Back, Close-up, Wide Action).
- Maintain PERFECTION in consistency: The character/object must look identical in design, clothing, and lighting across all panels.
- Use invisible or very thin black borders between panels.
- Ensure the composition fits the grid perfectly so it can be sliced later.
```

### 中文版本

```
创建一个高分辨率的 ${gridType} 网格布局，包含正好 ${totalViews} 个独立面板。
整体图像必须分成 ${gridRows} 行 ${gridCols} 列的网格。
主题: "${prompt}"。
指令:
- 生成"角色设定表"或"多角度视图"联系表。
- 每个面板必须从不同的角度或视角展示相同的主题/场景（例如：正面、侧面、3/4视角、背面、特写、全景动作）。
- 保持完美的一致性：角色/物体在所有面板中的设计、服装和光照必须完全相同。
- 使用不可见或非常细的黑色边框分隔面板。
- 确保构图完美适应网格，以便后续切片处理。
```

### 变量说明 / Variables

| 变量 / Variable | 说明 / Description |
|----------------|-------------------|
| `${gridType}` | 网格类型，如 "2x2" 或 "3x3" / Grid type, e.g., "2x2" or "3x3" |
| `${totalViews}` | 总视图数，如 4 或 9 / Total views, e.g., 4 or 9 |
| `${gridRows}` | 行数 / Number of rows |
| `${gridCols}` | 列数 / Number of columns |
| `${prompt}` | 用户输入的主题描述 / User's subject description |

---

## 2. 提示词增强 / Prompt Enhancement

**用途 / Purpose:** 将简单描述转为专业影视提示词  
**模型 / Model:** `gemini-2.5-flash`

### English Version

```
You are a film director's assistant. Rewrite the following scene description into a detailed, cinematic image generation prompt. Focus on lighting, camera angle, texture, and mood. Keep it under 100 words.

Input: "${rawPrompt}"
```

### 中文版本

```
你是一位电影导演的助手。将以下场景描述改写成详细的、电影级的图像生成提示词。重点关注光照、摄影机角度、质感和氛围。保持在100字以内。

输入: "${rawPrompt}"
```

### 变量说明 / Variables

| 变量 / Variable | 说明 / Description |
|----------------|-------------------|
| `${rawPrompt}` | 用户输入的原始场景描述 / User's original scene description |

---

## 3. 智能分镜系统提示词 / Storyboard Master System Prompt

**用途 / Purpose:** 结合参考图进行专业分镜画面设计  
**模型 / Model:** `gemini-3-pro-image-preview`

### 系统提示词 / System Prompt

```
你是一位资深影视分镜师和视觉叙事专家，擅长将简单的场景描述转化为专业的分镜画面。

## 参考图片说明
用户会按顺序提供参考图片：
- {{characterImages}}: 角色参考图，提取角色的外貌、服装、体态特征
- {{sceneImages}}: 场景参考图，提取环境、空间、道具信息
- {{styleImage}}: 风格参考图，提取色调、光影、画风

## 你的任务
根据用户的简单描述"{{userInput}}"，结合参考图片，设计{{totalViews}}个连续分镜画面。

## 输出要求
为每个画面生成详细的视觉描述，包含：
1. **角色动作**：参考图中角色在此画面的具体姿态和表情
2. **场景构图**：前景、中景、背景的空间布局
3. **镜头语言**：机位(特写/中景/全景)、角度(平视/俯视/仰视)、运动(推/拉/摇/移)
4. **光影氛围**：光源方向、明暗对比、情绪渲染
5. **画面连贯性**：与前后画面的视觉衔接

## 格式规范
生成{{gridType}}网格布局，每格一个分镜画面。
保持角色造型、场景风格在所有画面中高度一致。
使用细黑边框分隔画面，便于后续切片。

直接输出分镜描述，不要添加任何解释性文字。
```

### 用户提示词模板 / User Prompt Template

```
{{characterImages}}中的角色在{{sceneImages}}的场景里{{userInput}}。
使用{{styleImage}}的艺术风格。
生成{{gridType}}网格，共{{totalViews}}个连续分镜画面。
宽高比：{{aspectRatio}}
```

### 变量说明 / Variables

| 变量 / Variable | 说明 / Description | 示例 / Example |
|----------------|-------------------|----------------|
| `{{characterImages}}` | 角色参考图位置 | 图1-图2 |
| `{{sceneImages}}` | 场景参考图位置 | 图3 |
| `{{styleImage}}` | 风格参考图位置 | 图4 |
| `{{userInput}}` | 用户输入的场景描述 | 吃火锅 |
| `{{gridType}}` | 网格类型 | 2x2 |
| `{{totalViews}}` | 总画面数 | 4 |
| `{{aspectRatio}}` | 宽高比 | 16:9 |

### 使用示例 / Usage Example

**用户输入：** 吃火锅  
**参考图：** 2张角色图 + 1张火锅店场景图 + 1张动漫风格图

**生成的提示词：**
```
图1-图2中的角色在图3的场景里吃火锅。
使用图4的艺术风格。
生成2x2网格，共4个连续分镜画面。
宽高比：16:9
```

**AI理解后生成的分镜：**
- 画面1：角色A和角色B走进火锅店，中景镜头，温暖的暖光从店内透出
- 画面2：两人相对而坐，桌上火锅沸腾冒着热气，俯视特写镜头
- 画面3：角色A用筷子夹菜，角色B微笑等待，侧面中景
- 画面4：两人举杯碰饮，欢快表情，正面双人特写

---

## 4. 资产分析 / Asset Analysis

**用途 / Purpose:** 对上传的图像或视频进行 AI 分析  
**模型 / Model:** `gemini-3-pro-preview`

### 使用方式 / Usage

此功能接收用户自定义的分析指令，没有固定的系统提示词。用户可以输入如下指令：

**示例 / Examples:**

| 英文 / English | 中文 / Chinese |
|---------------|---------------|
| "Describe this image in detail" | "详细描述这张图片" |
| "What is the lighting style?" | "这是什么光照风格？" |
| "Analyze the composition" | "分析构图" |
| "What mood does this convey?" | "这传达了什么氛围？" |

---

## 总结 / Summary

| 功能 / Feature | 模型 / Model | 用途 / Purpose |
|---------------|-------------|---------------|
| Grid Prompt | `gemini-3-pro-image-preview` | 多角度角色表/分镜网格 |
| Enhance Prompt | `gemini-2.5-flash` | 简单描述 → 专业影视提示词 |
| Auto-Director | `gemini-2.5-flash` | 参考图 + 概念 → 电影级提示词 |
| Asset Analysis | `gemini-3-pro-preview` | 图像/视频分析 |

---

## 技术参数 / Technical Parameters

### 支持的宽高比 / Supported Aspect Ratios

| 值 / Value | 说明 / Description |
|-----------|-------------------|
| `1:1` | 正方形 / Square |
| `4:3` | 标准 / Standard |
| `3:4` | 竖版标准 / Portrait Standard |
| `16:9` | 宽屏 / Wide |
| `9:16` | 移动端竖屏 / Mobile Portrait |
| `21:9` | 电影宽银幕 / Cinema |

### 支持的图像尺寸 / Supported Image Sizes

| 值 / Value | 说明 / Description |
|-----------|-------------------|
| `1K` | 1K 分辨率 |
| `2K` | 2K 分辨率 |
| `4K` | 4K 分辨率 |

### 生成模式 / Generation Modes

| 值 / Value | 说明 / Description |
|-----------|-------------------|
| `Single Shot` | 单张图片 / Single image |
| `2x2 Grid (4 Views)` | 2x2 网格（4视图）|
| `3x3 Grid (9 Views)` | 3x3 网格（9视图）|

---

*文档创建于 / Document created: 2024-12-14*
