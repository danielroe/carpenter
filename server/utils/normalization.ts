// Feature issues
const FEATURE_REQUEST_TITLE = '### Describe the feature'

// Bug report issues
const BUG_REPORT_REPRODUCTION_TITLE = '### Reproduction'
const BUG_REPORT_LOGS_TITLE = '### Logs'

const MAX_CONTENT_LENGTH = 5000

/**
 * Normalize the issue content by removing comments, stackblitz links, diacritics, and trimming the content.
 * @param txt The issue content to normalize.
 */
export function getNormalizedIssueContent(txt: string) {
  const text = txt
    .replace(/<!--.*?-->/g, ' ')
    .replace(/https:\/\/stackblitz.com\/github\/nuxt\/starter/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const featureRequestContentStart = text.indexOf(FEATURE_REQUEST_TITLE)
  // Trim feature requests
  if (featureRequestContentStart !== -1) {
    return text.slice(featureRequestContentStart, MAX_CONTENT_LENGTH).trim()
  }

  // Trim bug reports
  const bugReportContentStart = text.indexOf(BUG_REPORT_REPRODUCTION_TITLE)
  if (bugReportContentStart !== -1) {
    // Exclude logs from the content, if present
    const bugReportLogsStart = text.indexOf(BUG_REPORT_LOGS_TITLE)
    if (bugReportLogsStart !== -1) {
      return text.slice(bugReportContentStart, Math.min(bugReportLogsStart, MAX_CONTENT_LENGTH)).trim()
    }

    return text.slice(bugReportContentStart, MAX_CONTENT_LENGTH).trim()
  }

  return text.slice(0, MAX_CONTENT_LENGTH).trim()
}

/**
 * Normalize the language code (ISO 639-1) to lowercase and remove the region code, if present.
 * @param lang The language code to normalize.
 * @returns The normalized language code or 'en' if the language code is not valid.
 */
export function getNormalizedLanguage(lang?: string | null) {
  if (!lang) {
    return 'en'
  }
  const language = lang.toLowerCase().split('-')[0]
  const langRegex = /^[a-z]{2}$/
  if (!langRegex.test(language)) {
    return 'en'
  }
  return language
}
