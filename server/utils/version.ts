const ENVIRONMENT_TITLE = '### Environment'
const MAX_ENVIRONMENT_LENGTH = 1500

export const VERSION_LABELS = ['3.x', '4.x', '5.x'] as const
export type VersionLabel = typeof VERSION_LABELS[number]

const NIGHTLY_KEYWORDS = /\b(?:main|nightly|edge|canary)\b/i

/**
 * Extract the "Environment" section of a bug report (the `nuxt info` output),
 * up to the next markdown heading.
 * @param txt The raw issue body.
 * @returns The environment section, or null if the body has none.
 */
export function getEnvironmentSection(txt: string) {
  const text = txt.replace(/<!--[\s\S]*?-->/g, ' ')
  const start = text.indexOf(ENVIRONMENT_TITLE)
  if (start === -1) {
    return null
  }
  const contentStart = start + ENVIRONMENT_TITLE.length
  const nextHeading = text.indexOf('\n### ', contentStart)
  const end = nextHeading === -1 ? text.length : nextHeading
  const section = text.slice(contentStart, Math.min(end, contentStart + MAX_ENVIRONMENT_LENGTH)).trim()
  return section || null
}

/**
 * Map a reported Nuxt version to a major-version label.
 *
 * Prerelease and nightly builds (`5.0.0-alpha.1`, `5.0.0-29810797.4436de29`)
 * resolve by their leading major, so this keeps working once a major is
 * released. Reports that only mention a branch or channel (`main`, `nightly`)
 * without a number resolve to `mainBranchMajor`.
 * @param version The version string as reported in the issue.
 * @param mainBranchMajor The major version currently developed on `main`.
 * @returns A label such as `4.x`, or null if the version is unknown or unsupported.
 */
export function getVersionLabel(version: string | null | undefined, mainBranchMajor: string): VersionLabel | null {
  if (!version) {
    return null
  }
  const match = version.match(/(?<![\w.])v?(\d+)(?=\.(?:\d+|x)\b|\b)/i)
  const major = match?.[1] ?? (NIGHTLY_KEYWORDS.test(version) ? mainBranchMajor : null)
  if (!major) {
    return null
  }
  const label = `${major}.x`
  return VERSION_LABELS.includes(label as VersionLabel) ? label as VersionLabel : null
}

/**
 * Extract the commit hash from a nightly version such as `5.0.0-29810797.4436de29`.
 * @returns The short commit hash, or null for release versions.
 */
export function getNightlyCommit(version: string | null | undefined) {
  return version?.match(/\d+\.\d+\.\d+-\d{6,}\.([0-9a-f]{7,40})\b/i)?.[1] ?? null
}
