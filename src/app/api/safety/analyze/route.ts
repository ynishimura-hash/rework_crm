import { NextRequest, NextResponse } from 'next/server';
import { analyzePhoto } from '@/lib/gemini-safety';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json(
        { error: '画像を送信してください' },
        { status: 400 }
      );
    }

    const result = await analyzePhoto(image);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Safety analyze error:', error);
    return NextResponse.json(
      { error: '安全分析に失敗しました' },
      { status: 500 }
    );
  }
}
