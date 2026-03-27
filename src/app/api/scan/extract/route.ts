import { NextRequest, NextResponse } from 'next/server';
import { extractFromImage, extractFromImages, extractFromText, extractMultipleFromImage } from '@/lib/gemini';

// Next.js App Router: タイムアウト60秒（base64画像のAI読取に必要）
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, images, text, detectMultiple } = body;

    if (!image && !images && !text) {
      return NextResponse.json(
        { error: '画像またはテキストを入力してください' },
        { status: 400 }
      );
    }

    // 1枚の画像から複数名刺を検出するモード
    if (image && detectMultiple) {
      const results = await extractMultipleFromImage(image);
      return NextResponse.json({ results });
    }

    // 複数画像の場合（それぞれ1枚の名刺）
    if (images && Array.isArray(images) && images.length > 0) {
      const results = await extractFromImages(images);
      return NextResponse.json({ results });
    }

    // 単一画像またはテキスト
    let result;
    if (image) {
      result = await extractFromImage(image);
    } else {
      result = await extractFromText(text);
    }

    // HP補完はregister後に非同期で実行（/api/scan/enrich）
    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan extract error:', error);
    return NextResponse.json(
      { error: '情報の抽出に失敗しました' },
      { status: 500 }
    );
  }
}
