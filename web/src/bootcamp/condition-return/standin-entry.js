// web/condition-cards-moodle.html 입구. ?c=<criterionId>
import { mountStandin } from './standin.js';

const criterionId = new URL(window.location.href).searchParams.get('c');
mountStandin(document.querySelector('#crc-root'), { criterionId });
