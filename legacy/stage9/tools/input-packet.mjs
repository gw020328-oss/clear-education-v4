// Both arms receive this same packet. No reference labels or split metadata.
export function inputPacket(row) {
  return {sourceId:row.sourceId,documentTitle:row.documentTitle,officialUrl:row.officialUrl,language:row.language,
    spans:row.spans.map(({spanId,text,locator})=>({spanId,text,locator:locator.replace(/ \([^)]*\)/g,'')}))};
}
