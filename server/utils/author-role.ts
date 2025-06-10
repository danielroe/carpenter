import type { AuthorAssociation } from '@octokit/webhooks-types'

/**
 * Check if the author has collaborator role or higher
 * (OWNER, MEMBER, or COLLABORATOR)
 */
export function isCollaboratorOrHigher(authorAssociation: AuthorAssociation): boolean {
  return ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(authorAssociation)
}
