import ExcelJS from 'exceljs';

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

export async function generateExcel(data: RatingData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();

  // Metadata
  workbook.creator = 'Credit Ratings Terminal';
  workbook.lastModifiedBy = 'Credit Ratings Terminal';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = true;

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('Summary', {
    properties: {
      tabColor: { argb: 'FF0066CC' },
    },
    views: [{
      showGridLines: false
    }]
  });

  // Header styling
  summarySheet.getRow(1).height = 30;
  summarySheet.mergeCells('A1:F1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = 'Credit Ratings Report';
  titleCell.font = {
    name: 'Arial',
    size: 20,
    bold: true,
    color: { argb: 'FFFFFFFF' }
  };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' }
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Company name
  summarySheet.getRow(3).height = 25;
  summarySheet.mergeCells('A3:C3');
  const companyCell = summarySheet.getCell('A3');
  companyCell.value = data.company;
  companyCell.font = { size: 16, bold: true };
  companyCell.alignment = { vertical: 'middle' };

  // Generated date
  summarySheet.getCell('E3').value = 'Generated:';
  summarySheet.getCell('F3').value = new Date();
  summarySheet.getCell('F3').numFmt = 'mm/dd/yyyy hh:mm AM/PM';

  // Summary section
  let row = 5;
  summarySheet.getCell(`A${row}`).value = 'Executive Summary';
  summarySheet.getCell(`A${row}`).font = { size: 14, bold: true };
  summarySheet.mergeCells(`A${row}:C${row}`);

  row = 7;
  const summaryData = [
    ['Average Rating Score:', data.summary?.averageNormalized?.toFixed(1) || 'N/A'],
    ['Rating Category:', data.summary?.category || 'N/A'],
    ['Agencies with Ratings:', getAgencyCount(data.ratings)],
    ['Data Quality:', data.enrichment?.dataQuality || 'Standard'],
    ['Last Updated:', new Date(data.searchedAt).toLocaleString()],
    ['Processing Time:', data.processingTime],
  ];

  summaryData.forEach(([label, value]) => {
    summarySheet.getCell(`A${row}`).value = label;
    summarySheet.getCell(`A${row}`).font = { bold: true };
    summarySheet.getCell(`B${row}`).value = value;
    summarySheet.mergeCells(`B${row}:C${row}`);
    row++;
  });

  // Column widths
  summarySheet.columns = [
    { width: 25 },
    { width: 20 },
    { width: 20 },
    { width: 15 },
    { width: 15 },
    { width: 20 }
  ];

  // Ratings Sheet
  const ratingsSheet = workbook.addWorksheet('Credit Ratings', {
    properties: {
      tabColor: { argb: 'FF00AA00' }
    }
  });

  // Ratings header
  ratingsSheet.getRow(1).height = 25;
  const ratingsHeaders = ['Rating Agency', 'Current Rating', 'Outlook', 'Score (1-21)', 'Status', 'Last Action'];

  ratingsHeaders.forEach((header, index) => {
    const cell = ratingsSheet.getCell(1, index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0066CC' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Ratings data
  const ratingsData = [];

  // Fitch
  ratingsData.push([
    'Fitch Ratings',
    data.ratings.fitch?.found ? data.ratings.fitch.rating : 'Not Rated',
    data.ratings.fitch?.found ? (data.ratings.fitch.outlook || 'N/A') : '-',
    data.ratings.fitch?.found ? data.ratings.fitch.normalized : '-',
    data.ratings.fitch?.found ? 'Active' : 'No Coverage',
    data.ratings.fitch?.found ? new Date(data.searchedAt).toLocaleDateString() : '-'
  ]);

  // S&P
  ratingsData.push([
    'S&P Global Ratings',
    data.ratings.sp?.found ? data.ratings.sp.rating : 'Not Rated',
    data.ratings.sp?.found ? (data.ratings.sp.outlook || 'N/A') : '-',
    data.ratings.sp?.found ? data.ratings.sp.normalized : '-',
    data.ratings.sp?.found ? 'Active' : 'No Coverage',
    data.ratings.sp?.found ? new Date(data.searchedAt).toLocaleDateString() : '-'
  ]);

  // Moody's
  ratingsData.push([
    "Moody's Investors Service",
    data.ratings.moodys?.found ? data.ratings.moodys.rating : 'Not Rated',
    data.ratings.moodys?.found ? (data.ratings.moodys.outlook || 'N/A') : '-',
    data.ratings.moodys?.found ? data.ratings.moodys.normalized : '-',
    data.ratings.moodys?.found ? 'Active' : 'No Coverage',
    data.ratings.moodys?.found ? new Date(data.searchedAt).toLocaleDateString() : '-'
  ]);

  // Add ratings data to sheet
  ratingsData.forEach((rowData, rowIndex) => {
    const currentRow = rowIndex + 2;
    rowData.forEach((value, colIndex) => {
      const cell = ratingsSheet.getCell(currentRow, colIndex + 1);
      cell.value = value;
      cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'left' : 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      // Color code ratings
      if (colIndex === 1 && value !== 'Not Rated') {
        const score = rowData[3] as number;
        if (score >= 17) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F5E9' }
          };
        } else if (score >= 12) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F5DC' }
          };
        } else if (score >= 1) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEBEE' }
          };
        }
      }
    });
    ratingsSheet.getRow(currentRow).height = 20;
  });

  // Set column widths
  ratingsSheet.columns = [
    { width: 25 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 20 }
  ];

  // Company Details Sheet (if enrichment data exists)
  if (data.enrichment) {
    const detailsSheet = workbook.addWorksheet('Company Details', {
      properties: {
        tabColor: { argb: 'FF4285F4' }
      }
    });

    detailsSheet.getRow(1).height = 25;
    detailsSheet.mergeCells('A1:B1');
    const detailsTitle = detailsSheet.getCell('A1');
    detailsTitle.value = 'Company Information';
    detailsTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    detailsTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4285F4' }
    };
    detailsTitle.alignment = { vertical: 'middle', horizontal: 'center' };

    const companyDetails = [
      ['Company Name', data.company],
      ['Ticker Symbol', data.enrichment.ticker || 'N/A'],
      ['ISIN', data.enrichment.isin || 'N/A'],
      ['Industry', data.enrichment.industry || 'N/A'],
      ['Sector', data.enrichment.sector || 'N/A'],
      ['Country', data.enrichment.country || 'N/A'],
      ['Headquarters', data.enrichment.headquarters || 'N/A'],
      ['Founded', data.enrichment.founded || 'N/A'],
      ['Website', data.enrichment.website || 'N/A'],
      ['Employees', data.enrichment.employees ? formatNumber(data.enrichment.employees) : 'N/A'],
      ['Market Cap', data.enrichment.marketCap ? formatCurrency(data.enrichment.marketCap) : 'N/A'],
      ['Revenue', data.enrichment.revenue ? formatCurrency(data.enrichment.revenue) : 'N/A'],
      ['Debt to Equity', data.enrichment.debtToEquity?.toFixed(2) || 'N/A'],
      ['Data Sources', data.enrichment.sources?.join(', ') || 'Standard'],
    ];

    let detailRow = 3;
    companyDetails.forEach(([label, value]) => {
      const labelCell = detailsSheet.getCell(`A${detailRow}`);
      labelCell.value = label;
      labelCell.font = { bold: true };
      labelCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      const valueCell = detailsSheet.getCell(`B${detailRow}`);
      valueCell.value = value;
      valueCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      detailRow++;
    });

    detailsSheet.columns = [
      { width: 20 },
      { width: 40 }
    ];
  }

  // Rating Scale Reference Sheet
  const scaleSheet = workbook.addWorksheet('Rating Scale', {
    properties: {
      tabColor: { argb: 'FFFFC107' }
    }
  });

  scaleSheet.getRow(1).height = 25;
  const scaleHeaders = ['S&P / Fitch', "Moody's", 'Numeric Score', 'Grade', 'Description'];

  scaleHeaders.forEach((header, index) => {
    const cell = scaleSheet.getCell(1, index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFC107' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const scaleData = [
    ['AAA', 'Aaa', 21, 'Prime', 'Highest quality and lowest risk'],
    ['AA+', 'Aa1', 20, 'High Grade', 'Very high quality'],
    ['AA', 'Aa2', 19, 'High Grade', 'Very high quality'],
    ['AA-', 'Aa3', 18, 'High Grade', 'Very high quality'],
    ['A+', 'A1', 17, 'Upper Medium Grade', 'High quality'],
    ['A', 'A2', 16, 'Upper Medium Grade', 'High quality'],
    ['A-', 'A3', 15, 'Upper Medium Grade', 'High quality'],
    ['BBB+', 'Baa1', 14, 'Lower Medium Grade', 'Medium quality'],
    ['BBB', 'Baa2', 13, 'Lower Medium Grade', 'Medium quality'],
    ['BBB-', 'Baa3', 12, 'Lower Medium Grade', 'Medium quality'],
    ['BB+', 'Ba1', 11, 'Non-Investment Grade', 'Speculative'],
    ['BB', 'Ba2', 10, 'Non-Investment Grade', 'Speculative'],
    ['BB-', 'Ba3', 9, 'Non-Investment Grade', 'Speculative'],
    ['B+', 'B1', 8, 'Highly Speculative', 'Highly speculative'],
    ['B', 'B2', 7, 'Highly Speculative', 'Highly speculative'],
    ['B-', 'B3', 6, 'Highly Speculative', 'Highly speculative'],
    ['CCC+', 'Caa1', 5, 'Substantial Risk', 'Substantial credit risk'],
    ['CCC', 'Caa2', 4, 'Substantial Risk', 'Substantial credit risk'],
    ['CCC-', 'Caa3', 3, 'Substantial Risk', 'Substantial credit risk'],
    ['CC', 'Ca', 2, 'Very High Risk', 'Very high credit risk'],
    ['D', 'C', 1, 'Default', 'In default'],
  ];

  scaleData.forEach((row, index) => {
    const rowNum = index + 2;
    row.forEach((value, colIndex) => {
      const cell = scaleSheet.getCell(rowNum, colIndex + 1);
      cell.value = value;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      // Color coding based on grade
      if (colIndex === 0) {
        const score = row[2] as number;
        if (score >= 17) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8F5E9' }
          };
        } else if (score >= 12) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFF9C4' }
          };
        } else {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFEBEE' }
          };
        }
      }
    });
  });

  scaleSheet.columns = [
    { width: 12 },
    { width: 12 },
    { width: 15 },
    { width: 20 },
    { width: 35 }
  ];

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function getAgencyCount(ratings: any): string {
  let count = 0;
  if (ratings.fitch?.found) count++;
  if (ratings.sp?.found) count++;
  if (ratings.moodys?.found) count++;
  return `${count} of 3`;
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