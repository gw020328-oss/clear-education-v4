"""Read official pages into a NEW temporary research directory. No model calls.
Full responses remain temporary; the frozen package retains hashes + short spans.
"""
import concurrent.futures, datetime, hashlib, html.parser, json, pathlib, tempfile, urllib.request

URLS = {
 'springboard': 'https://www.springboard.com/how-it-works/tuition-job-guarantee/',
 'careerfoundry': 'https://careerfoundry.com/en/job-guarantee/',
 'careerfoundry-imprint': 'https://careerfoundry.com/en/imprint/',
 'codingtemple': 'https://www.codingtemple.com/tuition-protection/',
 'tripleten': 'https://tripleten.com/blog/posts/what-you-need-to-know-about-the-tripleten-money-back-guarantee',
 'prepscholar': 'https://www.prepscholar.com/terms-of-service/',
 'kaplan': 'https://www.kaptest.com/hsg',
 'datacamp': 'https://support.datacamp.com/hc/en-us/articles/360001530353-If-my-DataCamp-subscription-renewed-can-I-get-a-refund',
 'futurelearn': 'https://www.futurelearn.com/info/terms/refund-policy',
 'edx': 'https://www.edx.org/edx-terms-service',
 'magoosh': 'https://gre.magoosh.com/score-guarantee',
 'magoosh-plans': 'https://gre.magoosh.com/plans',
 'princetonreview': 'https://www.princetonreview.com/legal/guarantee-better-scores',
 'codecademy': 'https://www.codecademy.com/terms',
}
class Visible(html.parser.HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True); self.skip=0; self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style','noscript'): self.skip+=1
 def handle_endtag(self,tag):
  if tag in ('script','style','noscript'): self.skip=max(0,self.skip-1)
 def handle_data(self,data):
  if not self.skip: self.parts.append(data)
def fetch(item):
 key,url=item; at=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=40) as r:
   body=r.read(); final=r.url; status=r.status
  parser=Visible(); parser.feed(body.decode('utf-8',errors='replace'))
  visible=' '.join(' '.join(parser.parts).split())
  (dest/(key+'.html')).write_bytes(body); (dest/(key+'.txt')).write_text(visible)
  return key,dict(url=url,finalUrl=final,accessedAt=at,status=status,rawSha256=hashlib.sha256(body).hexdigest(),textSha256=hashlib.sha256(visible.encode()).hexdigest(),textLength=len(visible),normalization='HTMLParser visible data; whitespace collapsed; Unicode code-point offsets')
 except Exception as e: return key,dict(url=url,accessedAt=at,error=type(e).__name__+': '+str(e))
if __name__=='__main__':
 dest=pathlib.Path(tempfile.mkdtemp(prefix='refund-stage12-sources-'))
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: rows=dict(pool.map(fetch,URLS.items()))
 (dest/'access.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'temporaryDirectory':str(dest),'access':rows},ensure_ascii=False))
