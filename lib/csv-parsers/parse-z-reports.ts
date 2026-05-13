import Papa from 'papaparse';
import { parseDate } from './parse-employee-shifts';

export interface ParsedZReport {
  reportDate: string; // YYYY-MM-DD
  totalSales: number;
  cashTips: number;
  ccTips: number;
}

/**
 * Parses Z report CSV data for daily sales and tips.
 * Expects columns: Date, Total Sales, Cash Tips, Credit Card Tips
 * 
 * Supports various column name variations (case-insensitive):
 * - Date: date, report_date, z_date, business_date
 * - Total Sales: sales, total_sales, total sales, gross_sales
 * - Cash Tips: cash_tips, cash tips, cash tip
 * - CC Tips: cc_tips, credit_card_tips, credit card tips, card_tips
 */
export function parseZReports(csvContent: string): Promise<ParsedZReport[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results: any) => {
        if (results.errors.length > 0) {
          reject(new Error(`CSV parse error: ${results.errors[0].message}`));
          return;
        }

        const reports: ParsedZReport[] = [];

        for (const row of results.data) {
          // Find the date column
          const dateKey = Object.keys(row).find(
            (key) =>
              /^(date|report_date|report\sdate|z_date|z\sdate|business_date|business\sdate)$/i.test(
                key
              )
          );
          const dateStr = dateKey ? row[dateKey]?.trim() : '';

          if (!dateStr) continue;

          const reportDate = parseDate(dateStr);
          if (!reportDate) continue;

          // Find total sales column
          const salesKey = Object.keys(row).find(
            (key) =>
              /^(sales|total_sales|total\ssales|gross_sales|gross\ssales|total)$/i.test(
                key
              )
          );
          const totalSales = salesKey ? parseFloat(row[salesKey]) || 0 : 0;

          // Find cash tips column
          const cashTipsKey = Object.keys(row).find(
            (key) =>
              /^(cash_tips|cash\stips|cash\stip|cash)$/i.test(key)
          );
          const cashTips = cashTipsKey
            ? parseFloat(row[cashTipsKey]) || 0
            : 0;

          // Find credit card tips column
          const ccTipsKey = Object.keys(row).find(
            (key) =>
              /^(cc_tips|credit_card_tips|credit\scard\stips|card_tips|card\stips|credit\scard|cc)$/i.test(
                key
              )
          );
          const ccTips = ccTipsKey ? parseFloat(row[ccTipsKey]) || 0 : 0;

          reports.push({
            reportDate,
            totalSales,
            cashTips,
            ccTips,
          });
        }

        resolve(reports);
      },
      error: (error: any) => {
        reject(new Error(`CSV parsing failed: ${error.message}`));
      },
    });
  });
}
