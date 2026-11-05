// web/condition-cards.html 입구. 실제 모드는 ?mode=ACTUAL
import { mountConditionCardsPreview } from './preview.js';

const mode = new URL(window.location.href).searchParams.get('mode');
mountConditionCardsPreview(document.querySelector('#crc-root'), { mode: mode === 'ACTUAL' ? 'ACTUAL' : null });
