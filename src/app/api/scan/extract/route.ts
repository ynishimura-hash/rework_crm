import { NextRequest, NextResponse } from 'next/server';
import { extractFromImage, extractFromImages, extractFromText, extractMultipleFromImage, enrichFromWebsite, searchCompanyHP } from '@/lib/gemini';

// HP情報の自動補完（既存URLからの補完 + 会社名からの検索）
async function enrichResult(data: any): Promise<any> {
  // 1) hp_urlがある場合は既存の enrichFromWebsite で補完
  if (data.company?.hp_url) {
    return enrichFromWebsite(data);
  }

  // 2) hp_urlがないが会社名がある場合はGeminiで検索
  if (data.company?.name) {
    const hpInfo = await searchCompanyHP(data.company.name);
    const updatedCompany = { ...data.company };
    if (hpInfo.hp_url) updatedCompany.hp_url = hpInfo.hp_url;
    if (hpInfo.industry && !updatedCompany.industry) updatedCompany.industry = hpInfo.industry;
    if (hpInfo.address && !updatedCompany.address) updatedCompany.address = hpInfo.address;

    const enriched = { ...data, company: updatedCompany };

    // hp_urlが見つかったらさらにWebサイトから詳細を補完
    if (hpInfo.hp_url) {
      return enrichFromWebsite(enriched);
    }
    return enriched;
  }

  return data;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, images, text, skipEnrich, detectMultiple } = body;

    if (!image && !images && !text) {
      return NextResponse.json(
        { error: '画像またはテキストを入力してください' },
        { status: 400 }
      );
    }

    // 1枚の画像から複数名刺を検出するモード
    if (image && detectMultiple) {
      const results = await extractMultipleFromImage(image);
      if (!skipEnrich) {
        const enriched = await Promise.all(results.map(r => enrichResult(r)));
        return NextResponse.json({ results: enriched });
      }
      return NextResponse.json({ results });
    }

    // 複数画像の場合（それぞれ1枚の名刺）
    if (images && Array.isArray(images) && images.length > 0) {
      const results = await extractFromImages(images);
      if (!skipEnrich) {
        const enriched = await Promise.all(results.map(r => enrichResult(r)));
        return NextResponse.json({ results: enriched });
      }
      return NextResponse.json({ results });
    }

    // 単一画像またはテキスト
    let result;
    if (image) {
      result = await extractFromImage(image);
    } else {
      result = await extractFromText(text);
    }

    // HP自動リサーチで不足情報を補完
    if (!skipEnrich) {
      result = await enrichResult(result);
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
