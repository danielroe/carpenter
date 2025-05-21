export function toXML(obj: Record<string, unknown>, rootElement = 'schema') {
  let xml = `<${rootElement}>`
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null) {
      xml += toXML(value as Record<string, unknown>, key)
    }
    else {
      xml += `<${key}>${value}</${key}>`
    }
  }
  xml += `</${rootElement}>`
  return xml
}
