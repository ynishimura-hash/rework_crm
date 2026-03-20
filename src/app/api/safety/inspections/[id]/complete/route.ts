import { NextRequest, NextResponse } from 'next/server';
import { completeInspection } from '@/app/actions/safety';

// 点検を完了に更新
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await completeInspection(id);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to complete inspection:', error);
    return NextResponse.json({ error: '点検の完了に失敗しました' }, { status: 500 });
  }
}
