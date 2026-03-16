/**
 * Gemini API client for AI-powered text/image extraction
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
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
2. 会社名は正式名称に変換（(株) → 株式会社、(有) → 有限会社 など）
3. 姓と名を分離してください（日本人名の場合）
4. ふりがなが推測できる場合は入れてください
5. 電話番号はハイフン区切りに統一
6. 存在しない情報はnullにしてください
7. URLはhttps://を含めてください

### 出力JSON形式（必ずこの形式で返してください。余分な説明は不要です）:
\`\`\`json
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
  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
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
