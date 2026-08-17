'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { parseEmployeeShifts } from '@/lib/csv-parsers/parse-employee-shifts';
import { parseZReports } from '@/lib/csv-parsers/parse-z-reports';
import { saveEmployeeShifts, saveZReports } from '../actions';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';

interface CSVUploadProps {
  reportType: 'employee-shifts' | 'z-reports';
}

export default function CSVUpload({ reportType }: CSVUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [totalParsed, setTotalParsed] = useState<number>(0);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string>('');

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setParseError('');
    setFileName(file.name);
    setPreviewData(null);
    setTotalParsed(0);

    try {
      const content = await file.text();

      if (reportType === 'employee-shifts') {
        const shifts = await parseEmployeeShifts(content);
        setTotalParsed(shifts.length);
        setPreviewData(shifts.slice(0, 5));
      } else {
        const reports = await parseZReports(content);
        setTotalParsed(reports.length);
        setPreviewData(reports.slice(0, 5));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to parse CSV';
      setParseError(message);
      toast.error(message);
    }
  };

  const handleConfirmUpload = async () => {
    const fileInput = document.querySelector(
      `input[data-report-type="${reportType}"]`
    ) as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file) return;

    setIsLoading(true);

    try {
      const content = await file.text();

      let result;
      if (reportType === 'employee-shifts') {
        const shifts = await parseEmployeeShifts(content);
        result = await saveEmployeeShifts(shifts);
        toast.success(
          `Imported ${result.totalSaved} shifts${
            result.newEmployees.length > 0
              ? ` (${result.newEmployees.length} new employees)`
              : ''
          }`
        );
      } else {
        const reports = await parseZReports(content);
        result = await saveZReports(reports);
        toast.success(
          `Imported ${result.totalSaved} Z reports (${result.dateRange?.start} to ${result.dateRange?.end})`
        );
      }

      if (result.errors.length > 0) {
        console.warn('Import warnings:', result.errors);
      }

      // Reset
      setPreviewData(null);
      setTotalParsed(0);
      setFileName('');
      fileInput.value = '';
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save data';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          disabled={isLoading}
          data-report-type={reportType}
          className="hidden"
          id={`csv-input-${reportType}`}
        />
        <label
          htmlFor={`csv-input-${reportType}`}
          className="flex-1 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Click to select CSV file</p>
          <p className="text-xs text-muted-foreground">
            or drag and drop a file
          </p>
        </label>
      </div>

      {fileName && (
        <div className="text-sm">
          <p className="font-medium">Selected: {fileName}</p>
        </div>
      )}

      {parseError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950 flex gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Parse Error
            </p>
            <p className="text-sm text-red-700 dark:text-red-300">
              {parseError}
            </p>
          </div>
        </div>
      )}

      {previewData && previewData.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950 flex gap-2">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Ready to import — {totalParsed} row{totalParsed !== 1 ? 's' : ''} found
              </p>
              {totalParsed > previewData.length && (
                <p className="text-xs text-green-700 dark:text-green-300">
                  Showing first {previewData.length} of {totalParsed}
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Preview
            </p>
            <div className="overflow-x-auto text-xs border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted">
                    {Object.keys(previewData[0] || {}).map((key) => (
                      <th key={key} className="px-3 py-2 text-left font-medium">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="border-b last:border-b-0">
                      {Object.values(row).map((val, colIdx) => (
                        <td key={colIdx} className="px-3 py-2">
                          {typeof val === 'number'
                            ? val.toFixed(2)
                            : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Button
            onClick={handleConfirmUpload}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Importing...' : 'Confirm & Import'}
          </Button>
        </div>
      )}
    </div>
  );
}
