import type { Octokit } from '@octokit/rest'

/**
 * Transfer an issue to another repository (e.g. the spam repository) using the GitHub GraphQL API
 */
export async function transferIssue(
  github: Octokit,
  issueNodeId: string,
  targetRepositoryNodeId: string,
): Promise<{ transferredIssueNumber: number }> {
  const result = await github.graphql(`
    mutation transferIssue($issueId: ID!, $repositoryId: ID!) {
      transferIssue(input: { issueId: $issueId, repositoryId: $repositoryId }) {
        issue {
          number
        }
      }
    }
  `, {
    issueId: issueNodeId,
    repositoryId: targetRepositoryNodeId,
  }) as { transferIssue: { issue: { number: number } } }

  return {
    transferredIssueNumber: result.transferIssue.issue.number,
  }
}
