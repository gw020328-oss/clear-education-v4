// Fabricated data only. These are not captured YBM responses.
export const registrationHtml=(date='2026.09.20',number='123456')=>`<html class="TOEIC"><body><p>SYNTHETIC_PRIVATE_NAME</p><table><tr><th>시험일</th><td><div>${date}(일)</div></td></tr><tr><th>수험번호</th><td>${number}</td></tr><tr><th>생년월일</th><td>SYNTHETIC_BIRTH</td></tr></table></body></html>`;
export const scoreRow=({date='2026.09.20',number='123456',score='850'}={})=>`<tr class="trSB" name="TOE"><!-- SYNTHETIC_PRIVATE_COMMENT --><td>TOEIC</td><td>${date}(일)</td><td>${number}</td><td>Total ${score} (LC SYNTHETIC_LC, RC SYNTHETIC_RC)</td><td>SYNTHETIC_PRIVATE_EXTRA</td></tr>`;
export const scoreHtml=(rows=[{}])=>'<html><body><p>한글 😀 SYNTHETIC_PRIVATE_NAME</p><table>'+rows.map(scoreRow).join('')+'</table></body></html>';
