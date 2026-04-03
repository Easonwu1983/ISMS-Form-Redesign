// @ts-check
function cleanText(value) {
  return String(value || '').trim();
}

function cleanTextArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => cleanText(entry)).filter(Boolean))).sort();
}

function normalizeValue(value, kind) {
  switch (kind) {
    case 'array':
      return cleanTextArray(value);
    case 'number': {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'boolean':
      return value === true || cleanText(value).toLowerCase() === 'true';
    case 'string':
    default:
      return cleanText(value);
  }
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildFieldChanges(beforeItem, afterItem, definitions) {
  return (Array.isArray(definitions) ? definitions : []).reduce((result, definition) => {
    const config = definition && typeof definition === 'object'
      ? definition
      : { key: cleanText(definition) };
    const key = cleanText(config.key || config.label);
    if (!key) return result;
    const label = cleanText(config.label || key);
    const selector = typeof config.get === 'function'
      ? config.get
      : function (entry) { return entry ? entry[key] : ''; };
    const normalizedBefore = normalizeValue(selector(beforeItem), config.kind || 'string');
    const normalizedAfter = normalizeValue(selector(afterItem), config.kind || 'string');
    if (!valuesEqual(normalizedBefore, normalizedAfter)) {
      result[label] = {
        before: normalizedBefore,
        after: normalizedAfter
      };
    }
    return result;
  }, {});
}

function buildMembershipDiff(beforeValues, afterValues) {
  const previous = cleanTextArray(beforeValues);
  const next = cleanTextArray(afterValues);
  return {
    before: previous,
    after: next,
    added: next.filter((entry) => !previous.includes(entry)),
    removed: previous.filter((entry) => !next.includes(entry)),
    retained: next.filter((entry) => previous.includes(entry))
  };
}

function summarizeAttachments(value) {
  const items = Array.isArray(value) ? value : [];
  return {
    count: items.length,
    names: items
      .map((entry) => cleanText(entry && (entry.name || entry.fileName || entry.attachmentId)))
      .filter(Boolean)
      .slice(0, 10)
  };
}

function summarizeChecklistResults(value) {
  const map = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let answered = 0;
  let evidenceFileCount = 0;
  Object.values(map).forEach((entry) => {
    if (cleanText(entry && entry.compliance)) answered += 1;
    if (Array.isArray(entry && entry.evidenceFiles)) {
      evidenceFileCount += entry.evidenceFiles.length;
    }
  });
  return {
    answeredCount: answered,
    evidenceFileCount
  };
}

module.exports = {
  cleanText,
  cleanTextArray,
  buildFieldChanges,
  buildMembershipDiff,
  summarizeAttachments,
  summarizeChecklistResults
};
