#!/usr/bin/env node
/**
 * Gemini Agent Delegation Script
 *
 * Usage:
 *   node delegate-gemini.js -a <agent> -t "<task>" [-f <file>] [-i <image>]
 *
 * Agents:
 *   - ui-reviewer: UI/UXデザインレビュー
 *   - image-analyst: 画像分析
 *
 * Environment:
 *   GEMINI_API_KEY or GOOGLE_API_KEY
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let agent = '';
let task = '';
let file = '';
let image = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-a' && args[i + 1]) {
    agent = args[++i];
  } else if (args[i] === '-t' && args[i + 1]) {
    task = args[++i];
  } else if (args[i] === '-f' && args[i + 1]) {
    file = args[++i];
  } else if (args[i] === '-i' && args[i + 1]) {
    image = args[++i];
  }
}

if (!agent || !task) {
  console.error('Usage: node delegate-gemini.js -a <agent> -t "<task>" [-f <file>] [-i <image>]');
  console.error('Agents: ui-reviewer, image-analyst');
  process.exit(1);
}

// Agent prompts
const AGENT_PROMPTS = {
  'ui-reviewer': `あなたはUI/UXデザインの専門家です。以下の観点でレビューします。

## 評価観点
- 視覚的階層: 情報の優先度が明確か
- 一貫性: デザインシステムに沿っているか
- アクセシビリティ: コントラスト、タップ領域、フォントサイズ
- ユーザビリティ: 直感的に操作できるか

## 出力形式（JSON）
{
  "scores": {
    "visual_hierarchy": 0-5,
    "consistency": 0-5,
    "accessibility": 0-5,
    "usability": 0-5
  },
  "total": 0-20,
  "issues": [{ "severity": "critical|major|minor", "area": "", "description": "", "suggestion": "" }],
  "strengths": [],
  "summary": ""
}`,

  'image-analyst': `あなたは画像分析の専門家です。

## 分析内容
- 画像の内容を詳細に説明
- 技術的な問題（解像度、構図、色彩）を指摘
- 改善提案

## 出力形式
### 画像の説明
### 技術的分析
### 改善提案`
};

// Get agent prompt
const agentPrompt = AGENT_PROMPTS[agent];
if (!agentPrompt) {
  console.error(`Unknown agent: ${agent}`);
  console.error('Available agents:', Object.keys(AGENT_PROMPTS).join(', '));
  process.exit(1);
}

// Check API key
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('Error: GEMINI_API_KEY or GOOGLE_API_KEY environment variable is required');
  process.exit(1);
}

// Build request
async function callGemini() {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  // Use Gemini 3 Pro for all tasks
  const modelName = 'gemini-3-pro-preview';
  const model = genAI.getGenerativeModel({ model: modelName });

  let prompt = `${agentPrompt}\n\n## タスク\n${task}`;

  // Read file content if provided
  if (file && fs.existsSync(file)) {
    const fileContent = fs.readFileSync(file, 'utf-8');
    prompt += `\n\n## 対象コード/ファイル\n\`\`\`\n${fileContent}\n\`\`\``;
  }

  console.log(`\n🎨 Delegating to Gemini (${agent})...\n`);

  try {
    let result;

    if (image && fs.existsSync(image)) {
      // Image analysis
      const imageData = fs.readFileSync(image);
      const base64Image = imageData.toString('base64');
      const mimeType = image.endsWith('.png') ? 'image/png' : 'image/jpeg';

      result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
      ]);
    } else {
      // Text only
      result = await model.generateContent(prompt);
    }

    const response = await result.response;
    console.log(response.text());

    // Save result
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const outputFile = path.join(outputDir, `gemini-${agent}-${timestamp}.md`);
    fs.writeFileSync(outputFile, response.text());
    console.log(`\n📁 Result saved to: ${outputFile}`);

  } catch (error) {
    console.error('Error calling Gemini:', error.message);
    process.exit(1);
  }
}

callGemini();
