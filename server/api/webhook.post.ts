import type { H3Event } from 'h3'
import type { IssuesEvent, IssueCommentEvent } from '@octokit/webhooks-types'

import { PROMPT_INJECTION_GUARD, analyzeWithAI } from '../utils/ai'
import { newIssueAnalysisSchema, commentAnalysisSchema, enhancedAnalysisSchema, translationSchema, IssueLabel, IssueType } from '../utils/schema'
import { buildNewIssueSystemPrompt, buildNewIssueInput, deriveNewIssueLabels, isResolutionAcknowledgement, shouldReopenClosedIssue } from '../utils/triage'
import { isCollaboratorOrHigher } from '../utils/author-role'
import { gatherEnhancedContext, wasClosedAsNotPlanned, wasClosedAsDuplicate, wasClosedAsCompleted, hasBeenReopenedMultipleTimes, buildEnhancedPromptContent } from '../utils/context'
import { transferIssue } from '../utils/issue-transfer'
import { getNightlyCommit } from '../utils/version'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev && !(await isValidGitHubWebhook(event))) {
    throw createError({ statusCode: 401, message: 'Unauthorized: webhook is not valid' })
  }

  const webhookPayload = await readBody(event) as IssuesEvent | IssueCommentEvent

  if (!('issue' in webhookPayload) || 'pull_request' in webhookPayload.issue) {
    return
  }

  if ('comment' in webhookPayload) {
    return handleIssueComment(event, webhookPayload)
  }

  switch (webhookPayload.action) {
    case 'opened':
      return handleNewIssue(event, webhookPayload)
    case 'edited':
      return handleIssueEdit(event, webhookPayload)
    case 'labeled':
      return handleIssueLabeled(event, webhookPayload)
  }

  return null
})

async function handleNewIssue(event: H3Event, payload: IssuesEvent) {
  if (payload.action !== 'opened') return null

  const { issue, repository } = payload

  if (issue.user?.type === 'Bot') {
    return null
  }

  const runtimeConfig = useRuntimeConfig(event)
  const github = useGitHubAPI(event)

  const analysis = await analyzeWithAI(event, {
    tier: 'simple',
    schema: newIssueAnalysisSchema,
    system: buildNewIssueSystemPrompt(runtimeConfig.triage.projectName),
    input: buildNewIssueInput(issue),
  })

  setHeader(event, 'x-analysis', JSON.stringify(analysis))

  const promises: Array<Promise<unknown>> = []
  const labels = deriveNewIssueLabels(analysis, {
    existingLabels: issue.labels?.map(label => label.name) ?? [],
    body: issue.body,
    mainBranchMajor: runtimeConfig.triage.mainBranchMajor,
  })

  if (analysis.issueType === IssueType.Spam) {
    promises.push(
      transferIssue(github, issue.node_id, runtimeConfig.github.targetRepositoryNodeId)
        .catch((error) => {
          console.error('Failed to transfer spam issue, falling back to label', error)
          return github.issues.addLabels({
            owner: repository.owner.login,
            repo: repository.name,
            issue_number: issue.number,
            labels,
          })
        }),
    )

    event.waitUntil(Promise.all(promises))
    return Promise.allSettled(promises)
  }

  const nightlyCommit = getNightlyCommit(analysis.nuxtVersion)
  if (nightlyCommit) {
    setHeader(event, 'x-nightly-commit', nightlyCommit)
  }

  if (labels.length > 0) {
    promises.push(
      github.issues.addLabels({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        labels,
      }),
    )
  }

  promises.push(
    github.issues.update({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: issue.number,
      type: analysis.issueType,
    }),
  )

  const spokenLanguage = getNormalizedLanguage(analysis.spokenLanguage)
  if (runtimeConfig.triage.translateIssues && spokenLanguage !== 'en') {
    promises.push(
      translateIssue(event, payload, spokenLanguage).catch((error) => {
        console.error('Error translating issue', error)
      }),
    )
  }

  event.waitUntil(Promise.all(promises))
  setHeader(event, 'x-assigned-labels', JSON.stringify(labels))

  return Promise.allSettled(promises)
}

async function translateIssue(event: H3Event, { issue, repository }: IssuesEvent, spokenLanguage: string) {
  const github = useGitHubAPI(event)

  const translation = await analyzeWithAI(event, {
    tier: 'simple',
    schema: translationSchema,
    system: `Translate this GitHub issue from ${spokenLanguage} to English. Keep all markdown formatting, code blocks, and links intact.

${PROMPT_INJECTION_GUARD}`,
    input: { title: issue.title, body: issue.body || '' },
  })

  if (!translation.translatedTitle?.trim()) {
    return
  }

  setHeader(event, 'x-translation', JSON.stringify({ from: spokenLanguage, bodyTranslated: !!translation.translatedBody }))

  return github.issues.update({
    owner: repository.owner.login,
    repo: repository.name,
    issue_number: issue.number,
    title: `[${spokenLanguage}:translated] ${translation.translatedTitle}`,
    ...(translation.translatedBody && issue.body
      ? { body: `${issue.body}\n\n---\n\n**English translation:**\n\n${translation.translatedBody}` }
      : {}),
  })
}

async function handleIssueEdit(event: H3Event, { issue, repository }: IssuesEvent) {
  if (issue.user?.type === 'Bot') {
    return null
  }

  const issueLabels = issue.labels?.map(label => label.name) || []
  if (!issueLabels.includes(IssueLabel.NeedsReproduction)) {
    return null
  }

  const github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  try {
    const analysis = await analyzeWithAI(event, {
      tier: 'simple',
      schema: commentAnalysisSchema,
      system: `You analyse GitHub issues to determine if they contain reproduction information.

A valid reproduction is:
- A link to a GitHub repository with reproducible code
- A link to StackBlitz or CodeSandbox
- A complete, runnable code example (not just a snippet)

${PROMPT_INJECTION_GUARD}`,
      input: { title: issue.title, body: getNormalizedIssueContent(issue.body || '') },
    })

    setHeader(event, 'x-issue-edit-analysis', JSON.stringify(analysis))

    if (!analysis.reproductionProvided) {
      return null
    }

    promises.push(
      github.issues.removeLabel({
        owner: repository.owner.login,
        repo: repository.name,
        issue_number: issue.number,
        name: IssueLabel.NeedsReproduction,
      }),
    )

    if (issue.state === 'closed') {
      promises.push(
        github.issues.update({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          state: 'open',
        }),
        github.issues.addLabels({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          labels: [IssueLabel.PendingTriage],
        }),
      )
    }

    event.waitUntil(Promise.all(promises))
    return Promise.allSettled(promises)
  }
  catch (e) {
    console.error('Error processing issue edit', e)
    return null
  }
}

async function handleIssueComment(event: H3Event, { comment, issue, repository }: IssueCommentEvent) {
  if (comment.user?.type === 'Bot') {
    return
  }

  // Collaborators can manage issues manually
  if (isCollaboratorOrHigher(comment.author_association)) {
    return
  }

  const issueLabels = issue.labels?.map(label => label.name) || []
  const hasNeedsReproductionLabel = issueLabels.includes(IssueLabel.NeedsReproduction)
  const isClosed = issue.state === 'closed'

  if (!hasNeedsReproductionLabel && !isClosed) {
    return
  }

  const github = useGitHubAPI(event)
  const promises: Array<Promise<unknown>> = []

  try {
    if (isClosed) {
      if (isResolutionAcknowledgement(comment.body)) {
        setHeader(event, 'x-comment-skipped', 'resolution-acknowledgement')
        return Promise.resolve([])
      }

      const analysis = await analyzeClosedIssueComment(event, issue, repository, issueLabels, comment.body)

      const shouldReopen = shouldReopenClosedIssue(analysis.result, {
        hasNeedsReproductionLabel,
        wasClosedAsDuplicate: wasClosedAsDuplicate(analysis.context, issueLabels),
        hasBeenReopenedMultipleTimes: hasBeenReopenedMultipleTimes(analysis.context),
      })

      if (!shouldReopen) {
        return Promise.resolve([])
      }

      promises.push(
        github.issues.update({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          state: 'open',
        }),
      )

      const labelsToAdd: IssueLabel[] = [IssueLabel.PendingTriage]
      if (analysis.result.possibleRegression) {
        labelsToAdd.push(IssueLabel.PossibleRegression)
      }

      promises.push(
        github.issues.addLabels({
          owner: repository.owner.login,
          repo: repository.name,
          issue_number: issue.number,
          labels: labelsToAdd,
        }),
      )

      if (hasNeedsReproductionLabel && analysis.result.reproductionProvided) {
        promises.push(
          github.issues.removeLabel({
            owner: repository.owner.login,
            repo: repository.name,
            issue_number: issue.number,
            name: IssueLabel.NeedsReproduction,
          }).catch(() => {}),
        )
      }
    }
    else {
      const analysis = await analyzeWithAI(event, {
        tier: 'simple',
        schema: commentAnalysisSchema,
        system: `You analyse comments on GitHub issues to determine if they provide reproduction information.

A valid reproduction is:
- A link to a GitHub repository
- A link to StackBlitz or CodeSandbox
- A complete, runnable code example

${PROMPT_INJECTION_GUARD}`,
        input: { comment: getNormalizedIssueContent(comment.body) },
      })

      setHeader(event, 'x-comment-analysis', JSON.stringify(analysis))

      if (analysis.reproductionProvided) {
        promises.push(
          github.issues.removeLabel({
            owner: repository.owner.login,
            repo: repository.name,
            issue_number: issue.number,
            name: IssueLabel.NeedsReproduction,
          }),
        )
      }
    }

    event.waitUntil(Promise.all(promises))
    return Promise.allSettled(promises)
  }
  catch (e) {
    console.error('Error processing issue comment', e)
    return null
  }
}

async function analyzeClosedIssueComment(
  event: H3Event,
  issue: IssueCommentEvent['issue'],
  repository: IssueCommentEvent['repository'],
  issueLabels: string[],
  newComment: string,
) {
  const context = await gatherEnhancedContext(event, issue, repository, {
    includeComments: true,
    maxComments: 5,
    includeTimeline: true,
  })

  let systemPrompt = `You are analysing a closed GitHub issue to determine if new evidence warrants reopening it.

Only the newest comment is new evidence; the issue body and earlier comments are background. Classify what that comment is doing in commentIntent, and judge possibleRegression, shouldReopen and reproductionProvided from the comment itself rather than from the issue it is posted on. A comment thanking someone, confirming a fix or workaround, or asking about future plans is never grounds for reopening, even on an issue that was originally a regression.

Context:
- Issue was closed as: ${context.issueStateReason || 'unknown reason'}
`

  if (wasClosedAsNotPlanned(context)) {
    systemPrompt += `- Closed as "not planned": consider if new evidence suggests it should be reconsidered\n`
  }
  if (wasClosedAsDuplicate(context, issueLabels)) {
    systemPrompt += `- Marked as duplicate: only suggest reopening if this is clearly a different issue\n`
  }
  if (wasClosedAsCompleted(context)) {
    systemPrompt += `- Closed as completed: only suggest reopening if a regression is detected\n`
  }
  if (hasBeenReopenedMultipleTimes(context)) {
    systemPrompt += `- WARNING: This issue has been reopened multiple times before. Be conservative about suggesting reopening.\n`
  }

  systemPrompt += `\n${PROMPT_INJECTION_GUARD}`

  const result = await analyzeWithAI(event, {
    tier: 'complex',
    schema: enhancedAnalysisSchema,
    system: systemPrompt,
    input: `${buildEnhancedPromptContent(context, true)}\n\nNew Comment:\n${getNormalizedIssueContent(newComment)}`,
  })

  setHeader(event, 'x-enhanced-comment-analysis', JSON.stringify(result))

  return { result, context }
}

async function handleIssueLabeled(event: H3Event, payload: IssuesEvent) {
  if (payload.action !== 'labeled' || !payload.label) {
    return null
  }

  const { issue, label } = payload

  if (label.name !== IssueLabel.Spam) {
    return null
  }

  const runtimeConfig = useRuntimeConfig(event)
  const github = useGitHubAPI(event)

  try {
    const result = await transferIssue(github, issue.node_id, runtimeConfig.github.targetRepositoryNodeId)
    return { transferred: true, issueNumber: result.transferredIssueNumber }
  }
  catch (e) {
    console.error('Error transferring spam-labeled issue', e)
    throw createError({ statusCode: 500, message: 'Error transferring spam-labeled issue' })
  }
}
