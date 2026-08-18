import { describe, it, expect, vi } from 'vitest'
import { getLoggerProxy } from '../server/utils/proxy'
import { getNormalizedIssueContent, getNormalizedLanguage } from '../server/utils/normalization'
import { wasClosedAsNotPlanned, wasClosedAsDuplicate, wasClosedAsCompleted, hasBeenReopenedMultipleTimes, buildEnhancedPromptContent } from '../server/utils/context'
import type { EnhancedContext } from '../server/utils/context'

describe('getNormalizedIssueContent', () => {
  it('should strip HTML comments and diacritics', () => {
    expect(getNormalizedIssueContent('<!-- template boilerplate -->héllo wörld')).toBe('hello world')
  })

  it('should trim bug reports to the reproduction section, excluding logs', () => {
    const body = 'intro\n### Reproduction\nhttps://stackblitz.com/edit/my-repro\n### Logs\nlots of logs'
    const normalized = getNormalizedIssueContent(body)
    expect(normalized).toContain('### Reproduction')
    expect(normalized).toContain('my-repro')
    expect(normalized).not.toContain('lots of logs')
  })

  it('should trim feature requests to the relevant section', () => {
    const body = 'noise\n### Describe the feature\nplease add this'
    expect(getNormalizedIssueContent(body)).toBe('### Describe the feature\nplease add this')
  })
})

describe('getNormalizedLanguage', () => {
  it('should normalize region codes and invalid values', () => {
    expect(getNormalizedLanguage('pt-BR')).toBe('pt')
    expect(getNormalizedLanguage('ZH')).toBe('zh')
    expect(getNormalizedLanguage('english')).toBe('en')
    expect(getNormalizedLanguage(null)).toBe('en')
  })
})

describe('getLoggerProxy', () => {
  it('should not error when called with GitHub rest api methods', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const github = getLoggerProxy<any>()
    github.issues.removeLabel({})
    github.issues.update({})
    github.issues.addLabels({})
    github.issues.removeLabel({})
    github.graphql(``)

    expect(console.log).toHaveBeenCalledTimes(5)
  })
})

describe('Enhanced Context Analysis', () => {
  const createMockContext = (overrides: Partial<EnhancedContext> = {}): EnhancedContext => ({
    issueBody: 'Sample issue body',
    recentComments: [],
    issueState: 'open',
    issueStateReason: null,
    timelineEvents: [],
    ...overrides,
  })

  describe('wasClosedAsNotPlanned', () => {
    it('should return true for closed issues with not_planned reason', () => {
      const context = createMockContext({
        issueState: 'closed',
        issueStateReason: 'not_planned',
      })
      expect(wasClosedAsNotPlanned(context)).toBe(true)
    })

    it('should return false for open issues', () => {
      const context = createMockContext({
        issueState: 'open',
        issueStateReason: null,
      })
      expect(wasClosedAsNotPlanned(context)).toBe(false)
    })

    it('should return false for closed issues with other reasons', () => {
      const context = createMockContext({
        issueState: 'closed',
        issueStateReason: 'completed',
      })
      expect(wasClosedAsNotPlanned(context)).toBe(false)
    })
  })

  describe('wasClosedAsDuplicate', () => {
    it('should return true when duplicate label is present', () => {
      const context = createMockContext({
        issueState: 'closed',
      })
      expect(wasClosedAsDuplicate(context, ['duplicate'])).toBe(true)
    })

    it('should return true when duplicate is mentioned in comments', () => {
      const context = createMockContext({
        issueState: 'closed',
        recentComments: [
          {
            body: 'This is a duplicate of issue #123',
            author: 'maintainer',
            createdAt: '2024-01-01T00:00:00Z',
            authorAssociation: 'MEMBER',
          },
        ],
      })
      expect(wasClosedAsDuplicate(context, [])).toBe(true)
    })

    it('should return false for open issues without duplicate indicators', () => {
      const context = createMockContext({
        issueState: 'open',
      })
      expect(wasClosedAsDuplicate(context, [])).toBe(false)
    })
  })

  describe('wasClosedAsCompleted', () => {
    it('should return true for closed issues with completed reason', () => {
      const context = createMockContext({
        issueState: 'closed',
        issueStateReason: 'completed',
      })
      expect(wasClosedAsCompleted(context)).toBe(true)
    })

    it('should return false for other closed reasons', () => {
      const context = createMockContext({
        issueState: 'closed',
        issueStateReason: 'not_planned',
      })
      expect(wasClosedAsCompleted(context)).toBe(false)
    })
  })

  describe('hasBeenReopenedMultipleTimes', () => {
    it('should return true when issue has been reopened multiple times', () => {
      const context = createMockContext({
        timelineEvents: [
          { event: 'closed', createdAt: '2024-01-01T00:00:00Z', actor: 'user1' },
          { event: 'reopened', createdAt: '2024-01-02T00:00:00Z', actor: 'user2' },
          { event: 'closed', createdAt: '2024-01-03T00:00:00Z', actor: 'user3' },
          { event: 'reopened', createdAt: '2024-01-04T00:00:00Z', actor: 'user4' },
        ],
      })
      expect(hasBeenReopenedMultipleTimes(context)).toBe(true)
    })

    it('should return false when issue has been reopened only once', () => {
      const context = createMockContext({
        timelineEvents: [
          { event: 'closed', createdAt: '2024-01-01T00:00:00Z', actor: 'user1' },
          { event: 'reopened', createdAt: '2024-01-02T00:00:00Z', actor: 'user2' },
        ],
      })
      expect(hasBeenReopenedMultipleTimes(context)).toBe(false)
    })
  })

  describe('buildEnhancedPromptContent', () => {
    it('should build prompt content with issue body and comments', () => {
      const context = createMockContext({
        issueBody: 'This is the issue description',
        recentComments: [
          {
            body: 'This might be related to the recent update',
            author: 'contributor',
            createdAt: '2024-01-01T00:00:00Z',
            authorAssociation: 'CONTRIBUTOR',
          },
        ],
        issueState: 'closed',
        issueStateReason: 'not_planned',
      })

      const content = buildEnhancedPromptContent(context)
      expect(content).toContain('Issue Body:')
      expect(content).toContain('This is the issue description')
      expect(content).toContain('Recent Comments:')
      expect(content).toContain('This might be related to the recent update')
      expect(content).toContain('Current Issue State: closed (not_planned)')
    })

    it('should include timeline when requested', () => {
      const context = createMockContext({
        timelineEvents: [
          { event: 'closed', createdAt: '2024-01-01T00:00:00Z', actor: 'maintainer' },
        ],
      })

      const content = buildEnhancedPromptContent(context, true)
      expect(content).toContain('Issue Status History:')
      expect(content).toContain('closed on 2024-01-01T00:00:00Z by maintainer')
    })
  })
})
