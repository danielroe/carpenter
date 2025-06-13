import type { Octokit } from '@octokit/rest'

/**
 * Transfer an issue to the spam repository using GitHub GraphQL API
 */
export async function transferIssueToSpam(
  github: Octokit,
  issueNodeId: string,
  targetRepositoryNodeId: string,
): Promise<{ transferredIssueNumber: number }> {
  const result = await github.graphql(`
    mutation {
      transferIssue(input: { issueId: "${issueNodeId}", repositoryId: "${targetRepositoryNodeId}" }) {
        issue {
          number
        }
      }
    }
  `) as { transferIssue: { issue: { number: number } } }

  return {
    transferredIssueNumber: result.transferIssue.issue.number,
  }
}
