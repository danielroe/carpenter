import { describe, it, expect } from 'vitest'
import { deriveNewIssueLabels, hasInstantReproductionLink, isPlatformDiscussed, buildNewIssueInput, isResolutionAcknowledgement, shouldReopenClosedIssue } from '../server/utils/triage'
import type { ReopenDecisionOptions } from '../server/utils/triage'
import type { EnhancedAnalysis, NewIssueAnalysis } from '../server/utils/schema'

const baseAnalysis: NewIssueAnalysis = {
  issueType: 'bug',
  reproductionProvided: true,
  goodReproduction: false,
  needsDetails: false,
  spokenLanguage: 'en',
  possibleRegression: false,
  nitro: false,
  nuxtVersion: '4.5.2',
  areas: [],
  bundler: 'none',
  platform: 'none',
}

const derive = (overrides: Partial<NewIssueAnalysis>, options: Partial<Parameters<typeof deriveNewIssueLabels>[1]> = {}) =>
  deriveNewIssueLabels({ ...baseAnalysis, ...overrides }, { existingLabels: [], mainBranchMajor: '5', ...options })

describe('deriveNewIssueLabels', () => {
  it('should return only the spam label for spam', () => {
    expect(derive({ issueType: 'spam', areas: ['pages'], nuxtVersion: '4.0.0' })).toEqual(['spam'])
  })

  it('should add pending triage when no triage label applies and the issue has no labels', () => {
    expect(derive({})).toEqual(['pending triage', '4.x'])
    expect(derive({}, { existingLabels: ['pending triage'] })).toEqual(['4.x'])
  })

  it('should not count good reproduction as a triage decision', () => {
    const body = 'https://stackblitz.com/edit/nuxt-repro-abc'
    expect(derive({ goodReproduction: true }, { body })).toEqual(['✨ good reproduction', 'pending triage', '4.x'])
  })

  it('should label missing reproductions and vague reports', () => {
    expect(derive({ reproductionProvided: false, needsDetails: true })).toEqual(['needs reproduction', 'needs details', '4.x'])
  })

  it('should only apply good reproduction when an instant reproduction link is present', () => {
    expect(derive({ goodReproduction: true }, { body: 'see https://github.com/foo/bar' })).not.toContain('✨ good reproduction')
    expect(derive({ goodReproduction: true }, { body: 'https://codesandbox.io/p/devbox/xyz' })).toContain('✨ good reproduction')
    expect(derive({ goodReproduction: true, reproductionProvided: false }, { body: 'https://stackblitz.com/edit/x' })).not.toContain('✨ good reproduction')
  })

  it('should map areas, bundler and platform to repository labels', () => {
    const body = '### Environment\n- OS: Windows\n### Describe the bug\nPaths use backslashes on Windows'
    expect(derive({ areas: ['pages', 'performance'], bundler: 'rspack', platform: 'windows' }, { body }))
      .toEqual(['pending triage', 'pages', '⚡ performance', 'bundler:rspack', 'platform:windows', '4.x'])
  })

  it('should not apply a platform label when only the environment section mentions the platform', () => {
    const body = '### Environment\n- OS: Windows 11\n- Package manager: bun\n### Describe the bug\nIt breaks'
    expect(derive({ platform: 'windows' }, { body })).not.toContain('platform:windows')
    expect(derive({ platform: 'bun' }, { body })).not.toContain('platform:bun')
  })

  it('should only apply version labels to bugs', () => {
    expect(derive({ issueType: 'enhancement', nuxtVersion: '4.5.2' })).toEqual(['pending triage'])
    expect(derive({ nuxtVersion: 'nightly' })).toContain('5.x')
  })
})

describe('hasInstantReproductionLink', () => {
  it('should detect StackBlitz and CodeSandbox links but not the starter templates', () => {
    expect(hasInstantReproductionLink('https://stackblitz.com/edit/nuxt-starter-abc123')).toBe(true)
    expect(hasInstantReproductionLink('https://codesandbox.io/p/devbox/abc')).toBe(true)
    expect(hasInstantReproductionLink('https://stackblitz.com/github/nuxt/starter/tree/v4-stackblitz')).toBe(false)
    expect(hasInstantReproductionLink('https://codesandbox.io/s/github/nuxt/starter/tree/v4')).toBe(false)
    expect(hasInstantReproductionLink('https://github.com/foo/repro')).toBe(false)
    expect(hasInstantReproductionLink(null)).toBe(false)
  })
})

describe('isPlatformDiscussed', () => {
  it('should ignore mentions inside the environment section', () => {
    expect(isPlatformDiscussed('windows', '### Environment\nWindows 11\n### Reproduction\nfoo')).toBe(false)
    expect(isPlatformDiscussed('windows', '### Environment\nmacOS\n### Reproduction\nfails on Windows only')).toBe(true)
    expect(isPlatformDiscussed('bun', 'running `bunx nuxt dev` crashes')).toBe(true)
  })
})

describe('buildNewIssueInput', () => {
  it('should include the environment section alongside the trimmed body', () => {
    const body = '### Environment\n- Nuxt: 4.5.2\n### Reproduction\nhttps://stackblitz.com/edit/x\n### Logs\nnoise'
    const input = buildNewIssueInput({ title: 'Bug', body })
    expect(input.environment).toBe('- Nuxt: 4.5.2')
    expect(input.body).toContain('### Reproduction')
    expect(input.body).not.toContain('noise')
  })
})

describe('isResolutionAcknowledgement', () => {
  it('should detect short comments confirming the issue is resolved', () => {
    expect(isResolutionAcknowledgement('Thank you! It works now with `#imports/server`')).toBe(true)
    expect(isResolutionAcknowledgement('thanks, that fixed it')).toBe(true)
    expect(isResolutionAcknowledgement('Works now for me, cheers')).toBe(true)
  })

  it('should not detect comments that still report a problem', () => {
    expect(isResolutionAcknowledgement('Thanks, but it still fails for me')).toBe(false)
    expect(isResolutionAcknowledgement('Thanks! Repro: https://stackblitz.com/edit/x')).toBe(false)
    expect(isResolutionAcknowledgement('This is broken again in 4.6.0')).toBe(false)
    expect(isResolutionAcknowledgement(`thanks\n${'a'.repeat(250)}`)).toBe(false)
  })
})

describe('shouldReopenClosedIssue', () => {
  const baseEnhanced: EnhancedAnalysis = {
    commentIntent: 'still-affected',
    reproductionProvided: false,
    possibleRegression: false,
    shouldReopen: false,
    isDifferentFromDuplicate: false,
    confidence: 'low',
  }
  const decide = (overrides: Partial<EnhancedAnalysis>, options: Partial<ReopenDecisionOptions> = {}) =>
    shouldReopenClosedIssue({ ...baseEnhanced, ...overrides }, {
      hasNeedsReproductionLabel: false,
      wasClosedAsDuplicate: false,
      hasBeenReopenedMultipleTimes: false,
      ...options,
    })

  it('should not reopen when the comment is not reporting an ongoing problem', () => {
    expect(decide({ commentIntent: 'resolved', possibleRegression: true })).toBe(false)
    expect(decide({ commentIntent: 'question', shouldReopen: true, confidence: 'high' })).toBe(false)
    expect(decide({ commentIntent: 'other', possibleRegression: true })).toBe(false)
  })

  it('should reopen on new evidence of an ongoing problem', () => {
    expect(decide({ possibleRegression: true })).toBe(true)
    expect(decide({ shouldReopen: true, confidence: 'high' })).toBe(true)
    expect(decide({ shouldReopen: true, confidence: 'medium' })).toBe(false)
    expect(decide({ reproductionProvided: true }, { hasNeedsReproductionLabel: true })).toBe(true)
  })

  it('should keep the duplicate and repeat-reopen guards', () => {
    expect(decide({ possibleRegression: true }, { wasClosedAsDuplicate: true })).toBe(false)
    expect(decide({ possibleRegression: true, isDifferentFromDuplicate: true }, { wasClosedAsDuplicate: true })).toBe(true)
    expect(decide({ possibleRegression: true }, { hasBeenReopenedMultipleTimes: true })).toBe(false)
    expect(decide({ possibleRegression: true, confidence: 'high' }, { hasBeenReopenedMultipleTimes: true })).toBe(true)
  })
})
