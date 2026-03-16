import { NextRequest, NextResponse } from 'next/server';
import { extractFromImage, extractFromImages, extractFromText } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, images, text } = body;

    if (!image && !images && !text) {
      return NextResponse.json(
        { error: '画像またはテキストを入力してください' },
        { status: 400 }
      );
    }

    // 複数画像の場合
    if (images && Array.isArray(images) && images.length > 0) {
      const results = await extractFromImages(images);
      return NextResponse.json({ results });
    }

    // 単一画像の場合
    let result;
    if (image) {
      result = await extractFromImage(image);
    } else {
      result = await extractFromText(text);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Scan extract error:', error);
    return NextResponse.json(
      { error: '情報の抽出に失敗しました' },
      { status: 500 }
    );
  }
}
