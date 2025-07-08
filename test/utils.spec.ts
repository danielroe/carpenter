import { describe, it, expect, vi } from 'vitest'
import { toXML } from '../server/utils/xml'
import { responseSchema, commentAnalysisSchema, enhancedAnalysisSchema } from '../server/utils/schema'
import { getLoggerProxy } from '../server/utils/proxy'
import { wasClosedAsNotPlanned, wasClosedAsDuplicate, wasClosedAsCompleted, hasBeenReopenedMultipleTimes, buildEnhancedPromptContent } from '../server/utils/context'
import type { EnhancedContext } from '../server/utils/context'

describe('toXML', () => {
  it('should convert the comment analysis schema to XML', () => {
    const xml = toXML(commentAnalysisSchema)
    expect(xml).toMatchInlineSnapshot(`"<schema><title>Issue Categorisation</title><type>object</type><properties><reproductionProvided><type>boolean</type></reproductionProvided><possibleRegression><type>boolean</type><comment>If the issue reported is a bug and the bug has reappeared on upgrade to a new version of Nuxt, it is a possible regression.</comment></possibleRegression></properties></schema>"`)
  })

  it('should convert the response analysis schema to XML', () => {
    const xml = toXML(responseSchema)
    expect(xml).toMatchInlineSnapshot(`"<schema><title>Issue Categorisation</title><type>object</type><properties><issueType><type>string</type><enum><0>bug</0><1>feature</1><2>documentation</2><3>spam</3></enum></issueType><reproductionProvided><type>boolean</type></reproductionProvided><spokenLanguage><type>string</type><comment>The language of the title in ISO 639-1 format. Do not include country codes, only language code.</comment></spokenLanguage><possibleRegression><type>boolean</type><comment>If the issue is reported on upgrade to a new version of Nuxt, it is a possible regression.</comment></possibleRegression><nitro><type>boolean</type><comment>If the issue is reported only in relation to a single deployment provider, it is possibly a Nitro issue.</comment></nitro></properties></schema>"`)
  })

  it('should convert the enhanced analysis schema to XML', () => {
    const xml = toXML(enhancedAnalysisSchema)
    expect(xml).toMatchInlineSnapshot(`"<schema><title>Enhanced Issue Analysis</title><type>object</type><properties><reproductionProvided><type>boolean</type></reproductionProvided><possibleRegression><type>boolean</type><comment>If the issue reported is a bug and the bug has reappeared on upgrade to a new version of Nuxt, it is a possible regression.</comment></possibleRegression><shouldReopen><type>boolean</type><comment>Whether a closed issue should be reopened based on new evidence or context.</comment></shouldReopen><isDifferentFromDuplicate><type>boolean</type><comment>For issues marked as duplicate, whether the evidence suggests this is actually a different issue.</comment></isDifferentFromDuplicate><confidence><type>string</type><enum><0>low</0><1>medium</1><2>high</2></enum><comment>Confidence level in the analysis based on available context.</comment></confidence></properties></schema>"`)
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
