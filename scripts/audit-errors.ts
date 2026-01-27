import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface ErrorOccurrence {
  file: string;
  line: number;
  exceptionType: string;
  message: string;
  context: string;
}

interface ExceptionCategory {
  count: number;
  occurrences: ErrorOccurrence[];
}

interface ErrorAuditReport {
  totalFiles: number;
  totalErrors: number;
  exceptionTypes: {
    [key: string]: ExceptionCategory;
  };
  topErrorMessages: Array<{
    message: string;
    count: number;
    exceptionType: string;
  }>;
  filesWithMostErrors: Array<{
    file: string;
    errorCount: number;
  }>;
  summary: {
    businessExceptionCount: number;
    genericHttpExceptionCount: number;
    otherExceptionCount: number;
  };
}

/**
 * Extract exception type from throw statement
 */
function extractExceptionType(line: string): string | null {
  const throwMatch = line.match(/throw\s+new\s+(\w+)/);
  if (throwMatch) {
    return throwMatch[1];
  }
  return null;
}

/**
 * Extract error message from throw statement
 */
function extractErrorMessage(context: string): string {
  // Try to extract string literal
  const stringMatch = context.match(/['"`]([^'"`]+)['"`]/);
  if (stringMatch) {
    return stringMatch[1];
  }

  // Try to extract template literal
  const templateMatch = context.match(/`([^`]+)`/);
  if (templateMatch) {
    return templateMatch[1];
  }

  return 'Unable to extract message';
}

/**
 * Get context around throw statement (up to 3 lines)
 */
function getThrowContext(lines: string[], lineIndex: number): string {
  const start = Math.max(0, lineIndex);
  const end = Math.min(lines.length, lineIndex + 3);
  return lines.slice(start, end).join(' ').trim();
}

/**
 * Analyze a service file for error throw statements
 */
function analyzeServiceFile(filePath: string): ErrorOccurrence[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const errors: ErrorOccurrence[] = [];

  lines.forEach((line, index) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      // Skip comments
      return;
    }

    if (line.includes('throw new')) {
      const exceptionType = extractExceptionType(line);
      if (exceptionType) {
        const context = getThrowContext(lines, index);
        const message = extractErrorMessage(context);

        errors.push({
          file: filePath.replace(/\\/g, '/'),
          line: index + 1,
          exceptionType,
          message,
          context: context.substring(0, 200), // Limit context length
        });
      }
    }
  });

  return errors;
}

/**
 * Categorize exception by type
 */
function categorizeException(exceptionType: string): string {
  const businessExceptions = [
    'BusinessException',
    'InsufficientCreditsException',
    'NoActiveSubscriptionException',
    'SubscriptionLimitReachedException',
    'PaymentRequiredException',
  ];

  const httpExceptions = [
    'NotFoundException',
    'BadRequestException',
    'UnauthorizedException',
    'ForbiddenException',
    'ConflictException',
    'InternalServerErrorException',
    'NotAcceptableException',
    'ServiceUnavailableException',
  ];

  if (businessExceptions.includes(exceptionType)) {
    return 'BusinessException';
  } else if (httpExceptions.includes(exceptionType)) {
    return 'GenericHttpException';
  } else {
    return 'OtherException';
  }
}

/**
 * Main audit function
 */
async function auditErrors() {
  console.log('Starting error audit...\n');

  // Find all service files
  const serviceFiles = await glob('src/**/*.service.ts', { cwd: process.cwd() });
  const moduleServiceFiles = await glob('src/**/service.ts', { cwd: process.cwd() });

  const allServiceFiles = [...new Set([...serviceFiles, ...moduleServiceFiles])];

  console.log(`Found ${allServiceFiles.length} service files\n`);

  const allErrors: ErrorOccurrence[] = [];
  const fileErrorCounts: Map<string, number> = new Map();

  // Analyze each file
  for (const file of allServiceFiles) {
    const errors = analyzeServiceFile(file);
    if (errors.length > 0) {
      allErrors.push(...errors);
      fileErrorCounts.set(file, errors.length);
      console.log(`${file}: ${errors.length} errors`);
    }
  }

  console.log(`\nTotal errors found: ${allErrors.length}\n`);

  // Categorize exceptions
  const exceptionTypes: { [key: string]: ExceptionCategory } = {};
  allErrors.forEach((error) => {
    if (!exceptionTypes[error.exceptionType]) {
      exceptionTypes[error.exceptionType] = {
        count: 0,
        occurrences: [],
      };
    }
    exceptionTypes[error.exceptionType].count++;
    exceptionTypes[error.exceptionType].occurrences.push(error);
  });

  // Find top error messages
  const messageCounts: Map<string, { count: number; exceptionType: string }> = new Map();
  allErrors.forEach((error) => {
    const key = error.message;
    if (messageCounts.has(key)) {
      messageCounts.get(key)!.count++;
    } else {
      messageCounts.set(key, { count: 1, exceptionType: error.exceptionType });
    }
  });

  const topErrorMessages = Array.from(messageCounts.entries())
    .map(([message, data]) => ({
      message,
      count: data.count,
      exceptionType: data.exceptionType,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Files with most errors
  const filesWithMostErrors = Array.from(fileErrorCounts.entries())
    .map(([file, errorCount]) => ({ file, errorCount }))
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10);

  // Calculate summary
  let businessExceptionCount = 0;
  let genericHttpExceptionCount = 0;
  let otherExceptionCount = 0;

  allErrors.forEach((error) => {
    const category = categorizeException(error.exceptionType);
    if (category === 'BusinessException') {
      businessExceptionCount++;
    } else if (category === 'GenericHttpException') {
      genericHttpExceptionCount++;
    } else {
      otherExceptionCount++;
    }
  });

  // Build report
  const report: ErrorAuditReport = {
    totalFiles: allServiceFiles.length,
    totalErrors: allErrors.length,
    exceptionTypes,
    topErrorMessages,
    filesWithMostErrors,
    summary: {
      businessExceptionCount,
      genericHttpExceptionCount,
      otherExceptionCount,
    },
  };

  // Write report to file
  const reportPath = path.join(process.cwd(), 'error-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Total service files analyzed: ${report.totalFiles}`);
  console.log(`Total errors found: ${report.totalErrors}`);
  console.log(`\nException Categories:`);
  console.log(`  BusinessException: ${businessExceptionCount} (${((businessExceptionCount / allErrors.length) * 100).toFixed(1)}%)`);
  console.log(`  Generic HTTP Exception: ${genericHttpExceptionCount} (${((genericHttpExceptionCount / allErrors.length) * 100).toFixed(1)}%)`);
  console.log(`  Other: ${otherExceptionCount} (${((otherExceptionCount / allErrors.length) * 100).toFixed(1)}%)`);
  console.log(`\nTop Exception Types:`);
  Object.entries(exceptionTypes)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .forEach(([type, data]) => {
      console.log(`  ${type}: ${data.count}`);
    });
  console.log(`\nReport saved to: ${reportPath}`);
}

// Run the audit
auditErrors().catch((error) => {
  console.error('Error running audit:', error);
  process.exit(1);
});
