import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getGoogleCalendarEvents } from '@/lib/google-calendar';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface TimeSlot {
  date: string;
  start: string;
  end: string;
  label: string;
}

/**
 * POST /api/schedule-match
 * Body: { text?: string, image?: string (base64), daysAhead?: number, timeFilter?: 'all' | 'morning' | 'afternoon' | 'evening' }
 * Returns: { slots: TimeSlot[], analysis: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { text, image, mediaType, daysAhead = 14, timeFilter = 'all' } = body;

    if (!text && !image) {
      return NextResponse.json({ error: 'テキストまたは画像が必要です' }, { status: 400 });
    }

    // 1. Get user's Google Calendar events for the next N days
    const serviceSupabase = createServiceRoleClient();
    const { data: userData } = await serviceSupabase
      .from('scheduling_users')
      .select('google_access_token, google_refresh_token')
      .eq('id', user.id)
      .single();

    const now = new Date();
    const rangeEnd = addDays(now, daysAhead);
    let calendarEvents: Array<{ start: string; end: string; summary: string }> = [];

    if (userData?.google_access_token && userData?.google_refresh_token) {
      try {
        const events = await getGoogleCalendarEvents(
          userData.google_access_token,
          userData.google_refresh_token,
          startOfDay(now).toISOString(),
          endOfDay(rangeEnd).toISOString(),
          user.id
        );
        calendarEvents = (events as Array<{ start?: { dateTime?: string }; end?: { dateTime?: string }; summary?: string }>)
          .filter(e => e.start?.dateTime && e.end?.dateTime)
          .map(e => ({
            start: e.start!.dateTime!,
            end: e.end!.dateTime!,
            summary: e.summary || '',
          }));
      } catch (error) {
        console.error('Failed to fetch calendar events:', error);
      }
    }

    // 2. Build busy times summary
    const busyTimesStr = calendarEvents
      .map(e => {
        const start = new Date(e.start);
        const end = new Date(e.end);
        return `${format(start, 'M/d(E) HH:mm', { locale: ja })}-${format(end, 'HH:mm')} ${e.summary}`;
      })
      .join('\n');

    // 3. Time filter description
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    const todayStr = format(now, 'yyyy年M月d日(E)', { locale: ja });
    const tomorrowStr = format(addDays(now, 1), 'yyyy年M月d日(E)', { locale: ja });

    let timeFilterInstruction = '';
    switch (timeFilter) {
      case 'morning':
        timeFilterInstruction = '候補時間帯のフィルター: 午前（9:00〜12:00）のみ';
        break;
      case 'afternoon':
        timeFilterInstruction = '候補時間帯のフィルター: 午後（13:00〜18:00）のみ';
        break;
      case 'evening':
        timeFilterInstruction = '候補時間帯のフィルター: 夜（18:00〜23:00）のみ';
        break;
      default:
        timeFilterInstruction = '候補時間帯: 9:00〜23:00の範囲';
        break;
    }

    // 4. Ask Gemini to analyze the request and find matching times
    const systemInstruction = `あなたは予定調整アシスタントです。
相手から送られた予定調整の依頼内容（テキスト、画像、またはスクリーンショット）を注意深く分析し、以下の情報を正確に抽出してください：
- 相手が希望している日付（具体的な日付が言及されている場合は必ず含める）
- 相手が希望している時間帯
- 会話の文脈（リスケ依頼、新規打ち合わせ、など）

今日は${todayStr}、現在時刻は${currentTimeStr}です。
明日は${tomorrowStr}です。

【重要ルール】
1. 相手が具体的な日付を明示している場合（例: 「20日」「来週の火曜」など）、その日付は必ず候補に含めること。相手が「○日でいいか」と聞いていたり、「○日は大丈夫」と回答している場合、その日は最優先候補にすること。
2. 今日の残り時間（${currentTimeStr}以降）にも空きがあれば候補に入れてよいが、通常は翌日以降の候補を優先すること。
3. ${timeFilterInstruction}
4. 既存予定と重なる時間帯は除外すること
5. 候補は最大15件まで（相手の希望日は必ず含める）
6. 画像やスクリーンショットの場合、会話の流れを読み取り、最新のやりとりを重視すること

ユーザーの既存予定（ブロック済み時間）:
${busyTimesStr || '（予定なし）'}

必ず以下のJSON形式のみで回答してください（説明文不要、JSONのみ）:
{
  "analysis": "相手の希望の要約（日本語で簡潔に。相手が具体的な日付や時間帯を言っている場合は必ず明記すること）",
  "requestedTimes": [
    { "description": "相手が希望している時間帯の説明" }
  ],
  "matchingSlots": [
    {
      "date": "2026-03-20",
      "start": "15:00",
      "end": "16:00",
      "label": "3/20(金) 15:00-16:00"
    }
  ],
  "suggestedReply": "相手への返信文案（候補時間を含む、丁寧なビジネス日本語で）"
}

追加ルール:
- matchingSlotsは日付順にソートすること
- 相手が明示した日付・時間は最優先で含め、その他の候補も追加すること
- 相手が「○日の○時で大丈夫」と確定的な返答をしている場合、その日時を第一候補にすること
- labelは「3/20(金) 15:00-16:00」の形式で日本語で読みやすく
- suggestedReplyは丁寧なビジネス日本語で、相手の確定した日時がある場合はそれを反映すること
- 候補の時間帯は基本9:00〜23:00（ただし相手の希望に従う）`;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      systemInstruction,
    });

    // Build content parts for Gemini
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    if (image) {
      parts.push({
        inlineData: {
          mimeType: mediaType || 'image/png',
          data: image,
        },
      });
      parts.push({
        text: 'この画像（LINEやメールのスクリーンショット等）から予定調整の情報を読み取ってください。会話の流れを注意深く読み、相手が具体的に言及している日付や時間帯を正確に抽出してください。相手が確認済み・OKした日時がある場合は、それを最優先候補にしてください。',
      });
    } else {
      parts.push({
        text: `以下の内容から予定調整の情報を読み取り、空き時間の候補を出してください。相手が具体的に言及している日付があれば、必ず候補に含めてください。\n\n${text}`,
      });
    }

    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        analysis: responseText,
        slots: [],
        suggestedReply: '',
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      analysis: parsed.analysis || '',
      requestedTimes: parsed.requestedTimes || [],
      slots: parsed.matchingSlots || [],
      suggestedReply: parsed.suggestedReply || '',
    });
  } catch (error) {
    console.error('Schedule match error:', error);
    return NextResponse.json(
      { error: '予定調整の処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
