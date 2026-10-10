"""Public read-only source acquisition. Full responses exist only in an OS temp directory.
No authentication, TLS bypass, model call, or project evidence overwrite.
"""
import concurrent.futures, hashlib, json, pathlib, re, subprocess, sys, tempfile
from html.parser import HTMLParser

class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.hidden=0; self.title=False; self.titles=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style','noscript'): self.hidden+=1
        if tag=='title': self.title=True
    def handle_endtag(self, tag):
        if tag in ('script','style','noscript'): self.hidden=max(0,self.hidden-1)
        if tag=='title': self.title=False
    def handle_data(self, data):
        if not self.hidden:
            text=' '.join(data.split())
            if text:self.parts.append(text)
            if self.title:self.titles.append(text)

sources=json.loads(pathlib.Path(sys.argv[1]).read_text())
target=pathlib.Path(tempfile.mkdtemp(prefix='refund-stage9-sources-'))
def fetch(row):
    path=target/(row['id']+'.html')
    p=subprocess.run(['/usr/bin/curl','-L','--max-time','35','--silent','--show-error',
                      '-A','Mozilla/5.0','-o',str(path),'-w','%{http_code}\n%{url_effective}',row['url']],
                     capture_output=True,text=True)
    raw=path.read_bytes() if path.exists() else b''
    match=re.search(br'charset\s*=\s*["\x27]?([a-zA-Z0-9_-]+)',raw[:15000],re.I)
    encoding=match.group(1).decode() if match else 'utf-8'
    if encoding.lower() in ('euc-kr','ks_c_5601-1987'):encoding='cp949'
    try:html=raw.decode(encoding,errors='replace')
    except LookupError:html=raw.decode('utf-8',errors='replace')
    parser=Text();parser.feed(html)
    text='\n'.join(parser.parts)
    (target/(row['id']+'.txt')).write_text(text)
    parts=p.stdout.splitlines()
    return {**row,'curlExit':p.returncode,'httpStatus':parts[0] if parts else None,
            'effectiveUrl':parts[1] if len(parts)>1 else None,'bytes':len(raw),
            'rawSha256':hashlib.sha256(raw).hexdigest(),
            'normalizedTextSha256':hashlib.sha256(text.encode()).hexdigest(),
            'encoding':encoding,'title':' '.join(parser.titles),'textPath':str(target/(row['id']+'.txt'))}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(fetch,sources))
(target/'access.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print(json.dumps({'temporaryDirectory':str(target),'sources':results},ensure_ascii=False,indent=2))
