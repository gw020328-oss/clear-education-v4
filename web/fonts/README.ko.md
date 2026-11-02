# 글꼴

레퍼런스 디자인이 쓰는 글꼴을 **우리 서버에서 직접 준다.**

## 왜 직접 받아 두나

실서버 CSP 가 외부 요청을 전부 막는다 (`src/dev/server.mjs:45`).

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:
```

그래서 `fonts.googleapis.com` 스타일시트도, `fonts.gstatic.com` 글꼴 파일도
받지 못한다. CSP 를 푸는 대신 파일을 같은 출처에 둔다 — 보안 설정을 약화시키지
않고 디자인은 그대로 간다. 발표 때 인터넷이 끊겨도 글자가 안 바뀐다.

## 받은 것

| 파일 | 용도 | 출처 | 크기 |
|---|---|---|---|
| `inter-variable.woff2` | 영문·숫자 | `@fontsource-variable/inter@5.1.0` (jsDelivr) | 48 KB |
| `pretendard-std.woff2` | 한글 | `pretendard-std@1.3.9` (jsDelivr) | 292 KB |

둘 다 **가변 글꼴**이라 파일 하나로 100~900 굵기를 다 쓴다. 굵기마다 파일을
받으면 몇 MB가 되는데 그럴 필요가 없다.

### Pretendard 는 Std 판이다

전체판(`pretendard@1.3.9`)은 **2,057,688 바이트**로 Std 판의 일곱 배다.
Std 는 KS X 1001 상용 한글 2,350자를 담는다 — 화면 문구에는 충분하고,
혹시 빠진 글자가 나오면 그 글자만 기기 글꼴로 떨어진다.

처음에 전체판을 받았다가 크기를 보고 Std 로 바꿨다. 다시 전체판이 필요하면
`pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2` 다.

## 라이선스

둘 다 **SIL Open Font License 1.1** 이다. 재배포할 수 있고, 조건은 라이선스
전문을 같이 두는 것이다 — `OFL-Inter.txt`, `OFL-Pretendard.txt` 가 그것이다.
**지우지 말 것.** 글꼴 파일만 남기고 라이선스를 빼면 OFL 위반이다.

## 공개 이력 검토 (2026-11-02)

두 파일을 아래 고정 버전 원본과 바이트 단위로 비교했다. 라이선스 전문은 위 파일에 보존한다.

- Inter: https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.1.0/files/inter-latin-wght-normal.woff2
  SHA-256: `f052ee44c3728dfd23aba8a4567150bc314d23903026fbb6ad089422c2df56af`
- Pretendard: https://cdn.jsdelivr.net/npm/pretendard-std@1.3.9/dist/web/variable/woff2/PretendardStdVariable.woff2
  SHA-256: `64a2b7110454edf0e5f555785273b5817d7e3a0a107a55acf8e4150e09a31557`

기존 전역 text 설정이 Pretendard의 CRLF 4곳을 LF로 변환했다. 원본으로 복구하고 .gitattributes에서 WOFF2 변환을 끈다. 과거 변형본(291,676바이트, SHA-256 `3a178c75a4e3fc7d295d2135a25aaf8a84a7adc9c6eacfc7a11446153cc1ef56`)은 원본의 CRLF→LF 변환과 정확히 일치함을 확인했다. 이력 검사에서는 이 두 경로와 검토된 해시만 허용한다. 다른 경로·수정된 바이너리는 계속 차단한다.
