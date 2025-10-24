import { NextRequest, NextResponse } from 'next/server';
import { generatePDF } from '@/lib/export/pdf-generator';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    if (!data.company || !data.ratings) {
      return NextResponse.json(
        { error: 'Missing required data' },
        { status: 400 }
      );
    }

    console.log(`[EXPORT-PDF] Generating PDF for ${data.company}`);

    // Generate PDF blob
    const pdfBlob = await generatePDF(data);

    // Convert blob to buffer
    const buffer = await pdfBlob.arrayBuffer();

    console.log(`[EXPORT-PDF] ✅ PDF generated successfully (${buffer.byteLength} bytes)`);

    // Return PDF as response
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${data.company.replace(/[^a-z0-9]/gi, '_')}_credit_ratings.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[EXPORT-PDF] ❌ Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}