import { NextRequest, NextResponse } from 'next/server';
import { generateExcel } from '@/lib/export/excel-generator';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!data.company || !data.ratings) {
      return NextResponse.json(
        { error: 'Missing required data' },
        { status: 400 }
      );
    }

    console.log(`[EXPORT-EXCEL] Generating Excel for ${data.company}`);

    // Generate Excel blob
    const excelBlob = await generateExcel(data);

    // Convert blob to buffer
    const buffer = await excelBlob.arrayBuffer();

    console.log(`[EXPORT-EXCEL] ✅ Excel generated successfully (${buffer.byteLength} bytes)`);

    // Return Excel as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${data.company.replace(/[^a-z0-9]/gi, '_')}_credit_ratings.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[EXPORT-EXCEL] ❌ Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Excel' },
      { status: 500 }
    );
  }
}