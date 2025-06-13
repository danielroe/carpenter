import { describe, it, expect } from 'vitest'
import type { AuthorAssociation } from '@octokit/webhooks-types'
import { isCollaboratorOrHigher } from '../server/utils/author-role'

describe('isCollaboratorOrHigher', () => {
  it('should return true for OWNER', () => {
    expect(isCollaboratorOrHigher('OWNER' as AuthorAssociation)).toBe(true)
  })

  it('should return true for MEMBER', () => {
    expect(isCollaboratorOrHigher('MEMBER' as AuthorAssociation)).toBe(true)
  })

  it('should return true for COLLABORATOR', () => {
    expect(isCollaboratorOrHigher('COLLABORATOR' as AuthorAssociation)).toBe(true)
  })

  it('should return false for CONTRIBUTOR', () => {
    expect(isCollaboratorOrHigher('CONTRIBUTOR' as AuthorAssociation)).toBe(false)
  })

  it('should return false for FIRST_TIME_CONTRIBUTOR', () => {
    expect(isCollaboratorOrHigher('FIRST_TIME_CONTRIBUTOR' as AuthorAssociation)).toBe(false)
  })

  it('should return false for FIRST_TIMER', () => {
    expect(isCollaboratorOrHigher('FIRST_TIMER' as AuthorAssociation)).toBe(false)
  })

  it('should return false for NONE', () => {
    expect(isCollaboratorOrHigher('NONE' as AuthorAssociation)).toBe(false)
  })
})
