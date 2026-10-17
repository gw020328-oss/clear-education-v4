// 아주 작은 DOM 도구
//
// 프레임워크를 쓰지 않는다. 데이터는 전부 textContent 로 넣고 HTML 문자열을
// 만들지 않는다. 합성 fixture 라도 문자열 조립 습관을 들이지 않기 위해서다.

/**
 * @param {string} tag  'div.card' 또는 'span.b.met' 처럼 클래스를 붙일 수 있다
 * @param {object} [attrs]  text, html 금지. aria-*, data-* 등은 그대로 설정
 * @param {Array} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.className = classes.join(' ');

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') { node.textContent = String(value); continue; }
    if (key === 'onClick') { node.addEventListener('click', value); continue; }
    if (key === 'onChange') { node.addEventListener('change', value); continue; }
    node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of [].concat(children)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** 정의 목록 한 줄 */
export const field = (label, value, note) => el('div.field', {}, [
  el('dt', { text: label }),
  el('dd', {}, [
    value === null || value === undefined
      ? el('span.muted', { text: '없음' })
      : el('code.value', { text: String(value) }),
    note ? el('p.note', { text: note }) : null,
  ]),
]);

/** 긴 hex 를 앞뒤만 보이게. 전체 값은 title 과 복사 대상으로 남긴다 */
export function shortHex(value) {
  const text = String(value);
  if (!text.startsWith('0x') || text.length <= 18) return text;
  return `${text.slice(0, 10)}…${text.slice(-6)}`;
}

export const boolText = (value) => (value === true ? '예' : value === false ? '아니오' : '없음');
