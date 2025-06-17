import type { H3Event } from 'h3'
import type { Issue } from '@octokit/webhooks-types'
import { getNormalizedIssueContent } from './normalization'

export interface EnhancedContext {
  issueBody: string
  recentComments: Array<{
    body: string
    author: string
    createdAt: string
    authorAssociation: string
  }>
  issueState: string
  issueStateReason: string | null | undefined
  timelineEvents: Array<{
    event: string
    createdAt: string
    actor?: string
  }>
}

/**
 * Gather enhanced context for better issue analysis based on issue status
 */
export async function gatherEnhancedContext(
  event: H3Event,
  issue: Issue,
  repository: { owner: { login: string }, name: string },
  options: {
    includeComments?: boolean
    maxComments?: number
    includeTimeline?: boolean
  } = {},
): Promise<EnhancedContext> {
  const github = useGitHubAPI(event)
  const { includeComments = true, maxComments = 5, includeTimeline = true } = options

  const context: EnhancedContext = {
    issueBody: getNormalizedIssueContent(issue.body || ''),
    recentComments: [],
    issueState: issue.state || 'open',
    issueStateReason: issue.state_reason,
    timelineEvents: [],
  }

  // Gather recent comments if needed
  if (includeComments) {
    try {
      const commentsResponse = await github.issues.listComments({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        per_page: maxComments,
        sort: 'created',
        direction: 'desc',
      })

      context.recentComments = commentsResponse.data.map(comment => ({
        body: getNormalizedIssueContent(comment.body || ''),
        author: comment.user?.login || 'unknown',
        createdAt: comment.created_at,
        authorAssociation: comment.author_association,
      }))
    }
    catch (error) {
      console.error('Error fetching issue comments:', error)
    }
  }

  // Gather timeline events if needed (for issue status history)
  if (includeTimeline) {
    try {
      const timelineResponse = await github.issues.listEventsForTimeline({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        per_page: 20,
      })

      context.timelineEvents = timelineResponse.data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((event: any) => event.event && ['closed', 'reopened', 'labeled', 'unlabeled'].includes(event.event))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((event: any) => ({
          event: event.event,
          createdAt: event.created_at,
          actor: event.actor?.login,
        }))
    }
    catch (error) {
      console.error('Error fetching issue timeline:', error)
    }
  }

  return context
}

/**
 * Determine if an issue was closed as 'not planned' based on timeline events
 */
export function wasClosedAsNotPlanned(context: EnhancedContext): boolean {
  return context.issueState === 'closed' && context.issueStateReason === 'not_planned'
}

/**
 * Determine if an issue was closed as 'duplicate' based on labels or comments
 */
export function wasClosedAsDuplicate(context: EnhancedContext, issueLabels: string[]): boolean {
  return context.issueState === 'closed'
    && (issueLabels.includes('duplicate')
      || context.recentComments.some(comment =>
        comment.body.toLowerCase().includes('duplicate')
        || comment.body.toLowerCase().includes('duplicates'),
      ))
}

/**
 * Determine if an issue was closed as 'completed'
 */
export function wasClosedAsCompleted(context: EnhancedContext): boolean {
  return context.issueState === 'closed' && context.issueStateReason === 'completed'
}

/**
 * Check if an issue has been reopened multiple times (indicating potential instability)
 */
export function hasBeenReopenedMultipleTimes(context: EnhancedContext): boolean {
  const reopenCount = context.timelineEvents.filter(event => event.event === 'reopened').length
  return reopenCount >= 2
}

/**
 * Build enhanced prompt content with additional context
 */
export function buildEnhancedPromptContent(context: EnhancedContext, includeTimeline: boolean = false): string {
  let content = `Issue Body:\n${context.issueBody}\n`

  if (context.recentComments.length > 0) {
    content += `\nRecent Comments:\n`
    context.recentComments.forEach((comment, index) => {
      content += `Comment ${index + 1} (by ${comment.author}, ${comment.authorAssociation}):\n${comment.body}\n\n`
    })
  }

  if (includeTimeline && context.timelineEvents.length > 0) {
    content += `\nIssue Status History:\n`
    context.timelineEvents.forEach((event) => {
      content += `- ${event.event} on ${event.createdAt} by ${event.actor || 'unknown'}\n`
    })
  }

  content += `\nCurrent Issue State: ${context.issueState}`
  if (context.issueStateReason) {
    content += ` (${context.issueStateReason})`
  }

  return content
}
