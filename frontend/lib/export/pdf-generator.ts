import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RatingData {
  company: string;
  ratings: {
    fitch?: any;
    sp?: any;
    moodys?: any;
  };
  summary: any;
  enrichment?: any;
  searchedAt: string;
  processingTime: string;
}

export async function generatePDF(data: RatingData): Promise<Blob> {
  const pdf = new jsPDF();

  // Company colors
  const primaryColor = '#0066CC';
  const secondaryColor = '#666666';

  // Page setup
  const pageWidth = pdf.internal.pageSize.width;
  const margin = 20;
  let yPosition = 20;

  // Header
  pdf.setFillColor(0, 102, 204);
  pdf.rect(0, 0, pageWidth, 40, 'F');

  // Title
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Credit Ratings Report', margin, 25);

  // Date
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin - 50, 25);

  yPosition = 55;

  // Company Name Section
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text(data.company, margin, yPosition);
  yPosition += 10;

  // Executive Summary Box
  pdf.setDrawColor(200, 200, 200);
  pdf.setFillColor(245, 245, 245);
  pdf.roundedRect(margin, yPosition, pageWidth - 2 * margin, 40, 3, 3, 'FD');

  yPosition += 10;
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Executive Summary', margin + 5, yPosition);

  yPosition += 8;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Average Rating: ${data.summary?.averageNormalized?.toFixed(1) || 'N/A'}/21`, margin + 5, yPosition);

  yPosition += 6;
  pdf.text(`Category: ${data.summary?.category || 'N/A'}`, margin + 5, yPosition);

  yPosition += 6;
  pdf.text(`Data Quality: ${data.enrichment?.dataQuality || 'Standard'}`, margin + 5, yPosition);

  yPosition += 20;

  // Ratings Table
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Credit Ratings', margin, yPosition);
  yPosition += 5;

  const ratingsData = [];

  // Fitch
  if (data.ratings.fitch?.found) {
    ratingsData.push([
      'Fitch Ratings',
      data.ratings.fitch.rating,
      data.ratings.fitch.outlook || 'N/A',
      `${data.ratings.fitch.normalized}/21`,
      'Active'
    ]);
  } else {
    ratingsData.push(['Fitch Ratings', 'Not Rated', '-', '-', 'No Coverage']);
  }

  // S&P
  if (data.ratings.sp?.found) {
    ratingsData.push([
      'S&P Global',
      data.ratings.sp.rating,
      data.ratings.sp.outlook || 'N/A',
      `${data.ratings.sp.normalized}/21`,
      'Active'
    ]);
  } else {
    ratingsData.push(['S&P Global', 'Not Rated', '-', '-', 'No Coverage']);
  }

  // Moody's
  if (data.ratings.moodys?.found) {
    ratingsData.push([
      "Moody's",
      data.ratings.moodys.rating,
      data.ratings.moodys.outlook || 'N/A',
      `${data.ratings.moodys.normalized}/21`,
      'Active'
    ]);
  } else {
    ratingsData.push(["Moody's", 'Not Rated', '-', '-', 'No Coverage']);
  }

  // Create ratings table
  (pdf as any).autoTable({
    startY: yPosition,
    head: [['Agency', 'Rating', 'Outlook', 'Score', 'Status']],
    body: ratingsData,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 102, 204],
      textColor: [255, 255, 255],
      fontSize: 11,
      fontStyle: 'bold'
    },
    bodyStyles: {
      fontSize: 10
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245]
    },
    margin: { left: margin, right: margin }
  });

  yPosition = (pdf as any).lastAutoTable.finalY + 15;

  // Company Information Section (if enrichment data exists)
  if (data.enrichment) {
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Company Information', margin, yPosition);
    yPosition += 5;

    const companyData = [];

    if (data.enrichment.ticker) {
      companyData.push(['Ticker Symbol', data.enrichment.ticker]);
    }
    if (data.enrichment.industry) {
      companyData.push(['Industry', data.enrichment.industry]);
    }
    if (data.enrichment.sector) {
      companyData.push(['Sector', data.enrichment.sector]);
    }
    if (data.enrichment.country) {
      companyData.push(['Country', data.enrichment.country]);
    }
    if (data.enrichment.marketCap) {
      companyData.push(['Market Cap', formatCurrency(data.enrichment.marketCap)]);
    }
    if (data.enrichment.revenue) {
      companyData.push(['Revenue', formatCurrency(data.enrichment.revenue)]);
    }
    if (data.enrichment.employees) {
      companyData.push(['Employees', formatNumber(data.enrichment.employees)]);
    }
    if (data.enrichment.website) {
      companyData.push(['Website', data.enrichment.website]);
    }

    if (companyData.length > 0) {
      (pdf as any).autoTable({
        startY: yPosition,
        body: companyData,
        theme: 'plain',
        bodyStyles: {
          fontSize: 10
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 40 },
          1: { cellWidth: 'auto' }
        },
        margin: { left: margin, right: margin }
      });

      yPosition = (pdf as any).lastAutoTable.finalY + 15;
    }
  }

  // Rating Scale Reference
  if (yPosition < 220) {  // Only add if there's space
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Rating Scale Reference', margin, yPosition);
    yPosition += 5;

    const scaleData = [
      ['AAA / Aaa', '21', 'Prime - Highest Quality'],
      ['AA+ / Aa1', '20', 'High Grade'],
      ['AA / Aa2', '19', 'High Grade'],
      ['AA- / Aa3', '18', 'High Grade'],
      ['A+ / A1', '17', 'Upper Medium Grade'],
      ['A / A2', '16', 'Upper Medium Grade'],
      ['A- / A3', '15', 'Upper Medium Grade'],
      ['BBB+ / Baa1', '14', 'Lower Medium Grade'],
      ['BBB / Baa2', '13', 'Lower Medium Grade'],
      ['BBB- / Baa3', '12', 'Lower Medium Grade'],
      ['BB+ / Ba1', '11', 'Non-Investment Grade'],
      ['BB / Ba2', '10', 'Speculative'],
      ['BB- / Ba3', '9', 'Speculative'],
    ];

    (pdf as any).autoTable({
      startY: yPosition,
      head: [['Rating', 'Score', 'Category']],
      body: scaleData.slice(0, 8), // Show top ratings
      theme: 'striped',
      headStyles: {
        fillColor: [100, 100, 100],
        textColor: [255, 255, 255],
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 9
      },
      margin: { left: margin, right: margin }
    });
  }

  // Footer
  pdf.setFillColor(240, 240, 240);
  pdf.rect(0, pdf.internal.pageSize.height - 20, pageWidth, 20, 'F');

  pdf.setTextColor(100, 100, 100);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');

  const footerText = 'Credit Ratings Terminal - Enterprise Credit Analysis Platform';
  pdf.text(footerText, margin, pdf.internal.pageSize.height - 10);

  const pageText = `Page 1 of 1`;
  pdf.text(pageText, pageWidth - margin - 20, pdf.internal.pageSize.height - 10);

  // Metadata
  pdf.setProperties({
    title: `Credit Ratings Report - ${data.company}`,
    subject: 'Credit Ratings Analysis',
    author: 'Credit Ratings Terminal',
    keywords: 'credit, ratings, analysis',
    creator: 'Credit Ratings Terminal'
  });

  // Generate blob
  return pdf.output('blob');
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  return `$${value.toLocaleString()}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}