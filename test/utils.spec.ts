import { describe, it, expect, vi } from 'vitest'
import { toXML } from '../server/utils/xml'
import { responseSchema, commentAnalysisSchema } from '../server/utils/schema'
import { getLoggerProxy } from '../server/utils/proxy'

describe('toXML', () => {
  it('should convert the comment analysis schema to XML', () => {
    const xml = toXML(commentAnalysisSchema)
    expect(xml).toMatchInlineSnapshot(`"<schema><title>Issue Categorisation</title><type>object</type><properties><reproductionProvided><type>boolean</type></reproductionProvided><possibleRegression><type>boolean</type><comment>If the issue has reappeared on upgrade to a new version of Nuxt, it is a possible regression.</comment></possibleRegression></properties></schema>"`)
  })

  it('should convert the response analysis schema to XML', () => {
    const xml = toXML(responseSchema)
    expect(xml).toMatchInlineSnapshot(`"<schema><title>Issue Categorisation</title><type>object</type><properties><issueType><type>string</type><enum><0>bug</0><1>feature</1><2>documentation</2><3>chore</3><4>help-wanted</4><5>spam</5></enum></issueType><reproductionProvided><type>boolean</type></reproductionProvided><spokenLanguage><type>string</type><comment>The language of the title in ISO 639-1 format. Do not include country codes, only language code.</comment></spokenLanguage><possibleRegression><type>boolean</type><comment>If the issue is reported on upgrade to a new version of Nuxt, it is a possible regression.</comment></possibleRegression><nitro><type>boolean</type><comment>If the issue is reported only in relation to a single deployment provider, it is possibly a Nitro issue.</comment></nitro></properties></schema>"`)
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
