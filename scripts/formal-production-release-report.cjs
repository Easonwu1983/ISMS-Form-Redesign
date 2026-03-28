const { writeReleaseReport } = require('./_formal-production-smoke-lib.cjs');

try {
  const releaseReportPaths = writeReleaseReport();
  console.log(`formal production release report json: ${releaseReportPaths.jsonPath}`);
  console.log(`formal production release report md: ${releaseReportPaths.mdPath}`);
} catch (error) {
  console.error('formal production release report failed:', error && error.stack ? error.stack : String(error));
  process.exit(1);
}
