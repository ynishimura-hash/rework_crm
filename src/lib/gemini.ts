/**
 * Gemini API client for AI-powered text/image extraction
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface ExtractedInfo {
  company?: {
    name?: string;
    industry?: string;
    address?: string;
    hp_url?: string;
  };
  contact?: {
    last_name?: string;
    first_name?: string;
    furigana?: string;
    department?: string;
    position?: string;
    email?: string;
    phone?: string;
  };
}

const EXTRACTION_PROMPT = `あなたは名刺・ビジネス情報の読み取りエキスパートです。
以下の入力から、企業情報と担当者（個人）情報をJSON形式で抽出してください。

### ルール:
1. 日本語の名刺・ビジネス文書に最適化されています
2. 画像が斜め・回転・手持ち撮影でも、すべてのテキストを丁寧に読み取ってください
3. 会社名は正式名称に変換（(株) → 株式会社、(有) → 有限会社、(一財) → 一般財団法人 など）
4. 姓と名を分離してください。姓名の間にスペースがなくても推測して分離してください
5. ふりがなが名刺に記載されていれば必ず使用し、なければ推測してください
6. 電話番号はTEL/携帯/直通など区別せず、最初に見つかったものを使用。ハイフン区切りに統一
7. FAX番号も名刺に記載があれば phone フィールドではなく無視（現在未対応）
8. 住所は郵便番号含めてすべて記載してください（〒XXX-XXXX 都道府県...）
9. 存在しない情報はnullにしてください
10. URLはhttps://を含めてください
11. 役職・肩書きは名刺の表記のまま抽出してください（ライフプランナー、代表取締役など）
12. 部署名と役職名が混在している場合は適切に分類してください

### 出力JSON形式（必ずこの形式で返してください。余分な説明は不要です）:
\`\`\`json
{
  "company": {
    "name": "企業名（正式名称）",
    "industry": "業種（推定）",
    "address": "住所（郵便番号含む）",
    "hp_url": "WebサイトURL"
  },
  "contact": {
    "last_name": "姓",
    "first_name": "名",
    "furigana": "ふりがな（姓 名）",
    "department": "部署名",
    "position": "役職・肩書き",
    "email": "メールアドレス",
    "phone": "電話番号（ハイフン区切り）"
  }
}
\`\`\``;

// 1枚の画像に複数名刺がある場合の抽出プロンプト
const MULTI_CARD_EXTRACTION_PROMPT = `あなたは名刺・ビジネス情報の読み取りエキスパートです。
この画像には1〜4枚の名刺が写っている可能性があります。
画像内の全ての名刺を検出し、それぞれの情報をJSON配列で返してください。

### ルール:
1. 画像内に複数の名刺がある場合は、全て検出して配列で返す
2. 1枚しかない場合も配列で返す（要素1つの配列）
3. 画像が斜め・回転・手持ち撮影でも、すべてのテキストを丁寧に読み取ってください
4. 日本語の名刺・ビジネス文書に最適化されています
5. 会社名は正式名称に変換（(株) → 株式会社、(有) → 有限会社 など）
6. 姓と名を分離してください。姓名の間にスペースがなくても推測して分離してください
7. ふりがなが名刺に記載されていれば必ず使用し、なければ推測してください
8. 電話番号はハイフン区切りに統一
9. 住所は郵便番号含めてすべて記載してください
10. 役職・肩書きは名刺の表記のまま抽出してください
11. 存在しない情報はnullにしてください
12. URLはhttps://を含めてください

### 出力JSON形式（必ず配列で返してください。余分な説明は不要です）:
\`\`\`json
{
  "cards": [
    {
      "company": {
        "name": "企業名（正式名称）",
        "industry": "業種（推定）",
        "address": "住所",
        "hp_url": "WebサイトURL"
      },
      "contact": {
        "last_name": "姓",
        "first_name": "名",
        "furigana": "ふりがな（姓 名）",
        "department": "部署",
        "position": "役職",
        "email": "メールアドレス",
        "phone": "電話番号"
      }
    }
  ]
}
\`\`\``;

export async function extractFromImage(base64Image: string): Promise<ExtractedInfo> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  // Extract mime type and data from data URI
  const match = base64Image.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');

  const [, mimeType, data] = match;

  const parts: GeminiPart[] = [
    { text: EXTRACTION_PROMPT + '\n\n以下の画像から情報を抽出してください:' },
    {
      inlineData: {
        mimeType,
        data,
      },
    },
  ];

  return callGemini(parts);
}

/**
 * 複数画像から名刺情報を一括抽出
 * 各画像から個別にExtractedInfoを返す
 */
export async function extractFromImages(base64Images: string[]): Promise<ExtractedInfo[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const results: ExtractedInfo[] = [];
  for (const base64Image of base64Images) {
    const result = await extractFromImage(base64Image);
    results.push(result);
  }
  return results;
}

/**
 * 1枚の画像から複数名刺を検出して個別に抽出
 * 最大4枚の名刺を1枚の写真から検出
 */
export async function extractMultipleFromImage(base64Image: string): Promise<ExtractedInfo[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const match = base64Image.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');

  const [, mimeType, data] = match;

  const parts: GeminiPart[] = [
    { text: MULTI_CARD_EXTRACTION_PROMPT + '\n\n以下の画像から全ての名刺を検出して情報を抽出してください:' },
    {
      inlineData: {
        mimeType,
        data,
      },
    },
  ];

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini API error:', error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
  const parsed = JSON.parse(jsonMatch[1] || text);

  // { cards: [...] } 形式または直接配列
  const cards = parsed.cards || (Array.isArray(parsed) ? parsed : [parsed]);
  return cards as ExtractedInfo[];
}

/**
 * 会社名からWebサイトURLを検索して取得
 * Google検索を利用して公式HPを特定
 */
export async function searchCompanyHP(companyName: string): Promise<{ hp_url: string | null; industry: string | null; address: string | null }> {
  if (!GEMINI_API_KEY || !companyName) {
    return { hp_url: null, industry: null, address: null };
  }

  try {
    // Google検索でコーポレートサイトを探す
    const searchQuery = encodeURIComponent(`${companyName} 公式サイト 会社概要`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Google Custom Search API がなくてもGeminiのknowledgeで推定
    const prompt = `以下の企業について、公式Webサイト（コーポレートサイト）のURL、業種、本社所在地を教えてください。
確実に分かる情報のみ返してください。不明な場合はnullにしてください。

企業名: ${companyName}

### 出力JSON形式:
\`\`\`json
{
  "hp_url": "https://example.co.jp",
  "industry": "業種",
  "address": "本社所在地"
}
\`\`\`
余分な説明は不要です。JSONのみ返してください。`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) return { hp_url: null, industry: null, address: null };

    const result = await response.json();
    const resultText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) return { hp_url: null, industry: null, address: null };

    const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/) || [null, resultText];
    const parsed = JSON.parse(jsonMatch[1] || resultText);
    return {
      hp_url: parsed.hp_url || null,
      industry: parsed.industry || null,
      address: parsed.address || null,
    };
  } catch (error) {
    console.error('Company HP search failed:', error);
    return { hp_url: null, industry: null, address: null };
  }
}

export async function extractFromText(text: string): Promise<ExtractedInfo> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const parts: GeminiPart[] = [
    { text: EXTRACTION_PROMPT + '\n\n以下のテキストから情報を抽出してください:\n\n' + text },
  ];

  return callGemini(parts);
}

async function callGemini(parts: GeminiPart[]): Promise<ExtractedInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    }),
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini API error:', error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  // Parse JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
  const parsed = JSON.parse(jsonMatch[1] || text);

  return parsed as ExtractedInfo;
}

/**
 * AI-powered deduplication check
 * Uses Gemini to determine if a company/contact already exists
 */
export async function checkDuplicates(
  newData: ExtractedInfo,
  existingCompanies: Array<{ id: string; name: string }>,
  existingContacts: Array<{ id: string; name: string; email?: string; company_name?: string }>
): Promise<{
  companyMatch: { id: string; name: string; confidence: number } | null;
  contactMatch: { id: string; name: string; confidence: number } | null;
}> {
  if (!GEMINI_API_KEY) {
    // Fallback to simple string matching
    return simpleDuplicateCheck(newData, existingCompanies, existingContacts);
  }

  const prompt = `あなたは顧客データの重複判定エキスパートです。
新しい顧客情報が既存のデータベースに既に存在するか判定してください。

### 判定ルール:
- 「(株)」と「株式会社」は同一とみなす
- 「(有)」と「有限会社」は同一とみなす
- 「（合）」と「合同会社」は同一とみなす
- 略称や通称も考慮する（例: "NTTドコモ" = "株式会社NTTドコモ"）
- 人名は漢字の一致を重視（同姓同名は高一致）
- メールアドレスが一致すれば確実に同一人物
- 確信度を0-100で返す（80以上: 一致、50-79: 要確認、50未満: 不一致）

### 新しいデータ:
企業名: ${newData.company?.name || '不明'}
担当者名: ${newData.contact?.last_name || ''}${newData.contact?.first_name || ''}
メール: ${newData.contact?.email || 'なし'}

### 既存の企業リスト:
${existingCompanies.map((c, i) => `${i + 1}. [ID:${c.id}] ${c.name}`).join('\n') || '（なし）'}

### 既存の担当者リスト:
${existingContacts.map((c, i) => `${i + 1}. [ID:${c.id}] ${c.name} (${c.company_name || '所属不明'}) ${c.email ? `<${c.email}>` : ''}`).join('\n') || '（なし）'}

### 出力JSON形式（必ずこの形式で返してください）:
\`\`\`json
{
  "companyMatch": { "id": "一致した企業のID", "name": "企業名", "confidence": 85 },
  "contactMatch": { "id": "一致した担当者のID", "name": "担当者名", "confidence": 90 }
}
\`\`\`
一致なしの場合はnullを返してください:
\`\`\`json
{
  "companyMatch": null,
  "contactMatch": null
}
\`\`\``;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response');

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
    return JSON.parse(jsonMatch[1] || text);
  } catch (error) {
    console.error('AI dedup check failed, falling back to simple check:', error);
    return simpleDuplicateCheck(newData, existingCompanies, existingContacts);
  }
}

/**
 * 企業HPから不足情報を自動補完
 * hp_urlが存在し、industry/addressが不足している場合にWebサイトを解析
 */
export async function enrichFromWebsite(data: ExtractedInfo): Promise<ExtractedInfo> {
  const url = data.company?.hp_url;
  if (!url || !GEMINI_API_KEY) return data;

  // 補完が必要な項目があるかチェック
  const needsIndustry = !data.company?.industry;
  const needsAddress = !data.company?.address;
  if (!needsIndustry && !needsAddress) return data;

  try {
    // WebサイトのHTMLを取得（タイムアウト5秒）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ReworkCRM/1.0)' },
    });
    clearTimeout(timeout);

    if (!res.ok) return data;

    const html = await res.text();
    // HTMLからテキストのみ抽出（タグ除去、最大3000文字に制限）
    const textContent = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    if (textContent.length < 50) return data;

    const missingFields: string[] = [];
    if (needsIndustry) missingFields.push('industry（業種）');
    if (needsAddress) missingFields.push('address（住所・所在地）');

    const prompt = `以下は「${data.company?.name || '不明'}」という企業のWebサイトのテキストです。
以下の不足情報を抽出してJSON形式で返してください。

### 抽出したい情報:
${missingFields.map(f => `- ${f}`).join('\n')}

### Webサイトテキスト:
${textContent}

### 出力JSON形式（見つからない場合はnull）:
\`\`\`json
{
  ${needsIndustry ? '"industry": "業種",' : ''}
  ${needsAddress ? '"address": "住所",' : ''}
}
\`\`\`
余分な説明は不要です。JSONのみ返してください。`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) return data;

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return data;

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
    const enriched = JSON.parse(jsonMatch[1] || text);

    // 不足フィールドのみ補完（既存データは上書きしない）
    const updatedCompany = { ...data.company };
    if (needsIndustry && enriched.industry) updatedCompany.industry = enriched.industry;
    if (needsAddress && enriched.address) updatedCompany.address = enriched.address;

    return { ...data, company: updatedCompany };
  } catch (error) {
    // リサーチ失敗は無視（元データをそのまま返す）
    console.error('HP enrichment failed:', error);
    return data;
  }
}

function simpleDuplicateCheck(
  newData: ExtractedInfo,
  existingCompanies: Array<{ id: string; name: string }>,
  existingContacts: Array<{ id: string; name: string; email?: string; company_name?: string }>
): {
  companyMatch: { id: string; name: string; confidence: number } | null;
  contactMatch: { id: string; name: string; confidence: number } | null;
} {
  let companyMatch = null;
  let contactMatch = null;

  if (newData.company?.name) {
    const normalized = normalizeCompanyName(newData.company.name);
    for (const company of existingCompanies) {
      if (normalizeCompanyName(company.name) === normalized) {
        companyMatch = { id: company.id, name: company.name, confidence: 95 };
        break;
      }
    }
  }

  if (newData.contact?.email) {
    for (const contact of existingContacts) {
      if (contact.email && contact.email.toLowerCase() === newData.contact.email.toLowerCase()) {
        contactMatch = { id: contact.id, name: contact.name, confidence: 99 };
        break;
      }
    }
  }

  return { companyMatch, contactMatch };
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(/[\s　]+/g, '')
    .replace(/\(株\)|（株）/g, '株式会社')
    .replace(/\(有\)|（有）/g, '有限会社')
    .replace(/\(合\)|（合）/g, '合同会社')
    .replace(/\(社\)|（社）/g, '一般社団法人')
    .toLowerCase();
}
