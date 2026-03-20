/**
 * 建設現場安全分析用 Gemini AI モジュール
 * 写真から安全上の危険箇所を特定し、法的根拠付きで指摘する
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// 分析結果の型定義
export interface SafetyHazard {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  law_reference: string;
  law_detail: string;
  recommendation: string;
  bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;
}

export interface SafetyAnalysisResult {
  hazards: SafetyHazard[];
  overall_assessment: string;
  score: number;
}

const SAFETY_ANALYSIS_PROMPT = `あなたは建設現場の安全管理エキスパートです。
以下の建設現場の写真を分析し、安全上の危険箇所を特定してください。

### 分析ルール:
1. 写真内のすべての安全上の危険を特定する
2. 各危険に対して、該当する日本の法令を正確に引用する
3. 重篤度を判定する (critical / high / medium / low)
4. 危険箇所の概略位置をバウンディングボックス（正規化座標0.0-1.0）で示す。位置が特定できない場合はnullにする
5. 具体的な改善提案を記述する
6. 危険が見つからない場合は空配列を返し、高スコアにする

### 参照法令（主なもの）:
- 労働安全衛生法（安衛法）
- 労働安全衛生規則（安衛則）
- 建設業法
- クレーン等安全規則
- 足場先行工法に関するガイドライン
- 酸素欠乏症等防止規則
- 有機溶剤中毒予防規則
- 特定化学物質障害予防規則
- 車両系建設機械の安全規則

### 危険カテゴリ（以下から選択）:
墜落・転落 / 飛来・落下 / 感電 / 崩壊・倒壊 / 火災・爆発 / 酸欠・中毒 / 挟まれ・巻き込まれ / 熱中症 / 車両系建設機械 / 仮設・足場 / 保護具未着用 / その他

### 出力JSON形式:
{
  "hazards": [
    {
      "severity": "critical",
      "category": "墜落・転落",
      "description": "3階足場に手すりが設置されていない",
      "law_reference": "労働安全衛生規則第563条",
      "law_detail": "事業者は、足場における高さ2m以上の作業場所には、手すり等を設けなければならない",
      "recommendation": "直ちに手すり（高さ85cm以上）と中桟を設置すること",
      "bbox": { "x": 0.3, "y": 0.1, "w": 0.4, "h": 0.5 }
    }
  ],
  "overall_assessment": "重大な安全上の問題が検出されました。直ちに作業を中止し改善が必要です。",
  "score": 35
}

scoreは0-100で、100が最も安全（危険なし）、0が最も危険です。`;

/**
 * 建設現場写真を分析して安全上の危険箇所を特定
 */
export async function analyzePhoto(base64Image: string): Promise<SafetyAnalysisResult> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  // data URIからmimeTypeとデータを抽出
  const match = base64Image.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');

  const [, mimeType, data] = match;

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: SAFETY_ANALYSIS_PROMPT + '\n\n以下の建設現場写真を分析してください:' },
          {
            inlineData: {
              mimeType,
              data,
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Gemini Safety API error:', error);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  // JSONパース（markdownコードブロック対応）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
  const parsed = JSON.parse(jsonMatch[1] || text);

  // バリデーション・デフォルト値
  return {
    hazards: (parsed.hazards || []).map((h: SafetyHazard) => ({
      severity: h.severity || 'medium',
      category: h.category || 'その他',
      description: h.description || '',
      law_reference: h.law_reference || '',
      law_detail: h.law_detail || '',
      recommendation: h.recommendation || '',
      bbox: h.bbox && h.bbox.x !== undefined ? h.bbox : null,
    })),
    overall_assessment: parsed.overall_assessment || '分析完了',
    score: typeof parsed.score === 'number' ? parsed.score : 50,
  };
}

/**
 * 点検全体のAIサマリーを生成
 */
export async function generateInspectionSummary(
  hazards: SafetyHazard[],
  siteName: string
): Promise<string> {
  if (!GEMINI_API_KEY || hazards.length === 0) {
    return hazards.length === 0
      ? `${siteName}の安全点検を実施しました。特に問題は検出されませんでした。`
      : '';
  }

  const prompt = `以下は建設現場「${siteName}」の安全点検で検出された危険箇所の一覧です。
全体を簡潔にまとめた所見（3-5文）を日本語で書いてください。

検出された危険箇所:
${hazards.map((h, i) => `${i + 1}. [${h.severity}] ${h.category}: ${h.description} (${h.law_reference})`).join('\n')}

所見を文字列で返してください（JSON不要）。`;

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 512,
      },
    }),
  });

  if (!response.ok) return '';

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
