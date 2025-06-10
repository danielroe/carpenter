import type { AuthorAssociation } from '@octokit/webhooks-types'

export function isCollaboratorOrHigher(authorAssociation: AuthorAssociation): boolean {
  return ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(authorAssociation)
}
