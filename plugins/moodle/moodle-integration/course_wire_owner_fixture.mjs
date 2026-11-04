import {createServer} from 'node:https';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {setTimeout as wait} from 'node:timers/promises';
import {authenticate} from '/app/deploy/agent-preview/auth.mjs';

const origin = 'https://clear-c-course-wire-owner:18443';
const path = '/v1/moodle/course/read';
const run = 'course-wire-fixture';
const secret = 'd'.repeat(64); // Public synthetic value.
const nonces = new Set();
const refs = new Set();
const send = (res, status, value) => res.writeHead(status, {'Content-Type':'application/json'}).end(JSON.stringify(value));
const server = createServer({
    key:readFileSync('/fixture/tls/leaf-key.pem'), cert:readFileSync('/fixture/tls/leaf.pem'),
}, async (req, res) => {
    if (req.method !== 'POST' || req.url !== path) {
        console.log('REJECT unexpected route');
        return send(res, 404, {});
    }
    try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks);
        const now = Date.now();
        authenticate(req, raw, {secret, config:{publicOrigin:origin}, now, store:{nonce(n) {
            if (nonces.has(n)) throw Error('duplicate nonce');
            nonces.add(n);
        }}});
        const body = JSON.parse(raw);
        const {requestRef,ownerRunId,moodleAuthorityRef,role,expiresAtExclusive} = body;
        const seconds = Math.floor(now/1000);
        if (Object.keys(body).sort().join() !== 'expiresAtExclusive,moodleAuthorityRef,ownerRunId,requestRef,role,version'
            || body.version !== 'clear-moodle-course-read-request.1' || ownerRunId !== run
            || !/^[0-9a-f]{64}$/.test(requestRef) || refs.has(requestRef)
            || !Number.isSafeInteger(expiresAtExclusive) || expiresAtExclusive <= seconds || expiresAtExclusive > seconds+5
            || !['PARTICIPANT','COURSE_OPERATOR'].includes(role)
            || !/^fixture-(student|teacher|readback|expired|mismatch|wrong-run|wrong-ref|unavailable|redirect|revoke-enrol|revoke-role)$/.test(moodleAuthorityRef)) {
            throw Error('unexpected envelope');
        }
        refs.add(requestRef);
        const kind = moodleAuthorityRef.slice(8);
        console.log('AUTHENTICATED '+kind);
        if (kind === 'redirect') {
            return res.writeHead(307,{Location:origin+'/must-not-follow'}).end();
        }
        const reply = {
            version:'clear-moodle-course-read-response.1', requestRef, ownerRunId, role,
            status:'UNAVAILABLE', expiresAtExclusive, evidence:null, payment:null,
        };
        if (kind === 'unavailable') return send(res, 200, reply);
        if (kind.startsWith('revoke-')) {
            writeFileSync('/fixture/barriers/'+kind+'.paused','ready');
            for (let i=0; i<130 && !existsSync('/fixture/barriers/'+kind+'.release'); i++) await wait(20);
            if (!existsSync('/fixture/barriers/'+kind+'.release')) return send(res, 503, {});
        }
        const decision = {id:'fixture-decision',revision:1,recordedConditionsStatus:'NEEDS_SUPPLEMENT'};
        const criteria = ['activity-complete','assignment-submitted','reflection-topics','python-basic-certificate'].map(criterionId => ({
            criterionId, recordedState:criterionId==='reflection-topics'?'NOT_MET':'MET',
            source:{currentness:'UNKNOWN',connection:'UNKNOWN',dataMode:'SYNTHETIC_FIXTURE'},
            evidence:{originalHttpAvailable:false,availability:criterionId==='activity-complete'?'EXPIRED':'VALID_AS_RECORDED',
                facts:criterionId==='reflection-topics'?{topics:[
                    {topicId:'work-performed',state:'PRESENT'}, {topicId:'problem-solving-process',state:'PRESENT'},
                    {topicId:'learning-takeaway',state:'MISSING',span:'PRIVATE-FIXTURE-SPAN'},
                ]}:null},
        }));
        const included = kind !== 'readback';
        Object.assign(reply, {
            status:'OK',
            evidence:{version:'clear-moodle-course-evidence.1',role,applicationActive:true,usableForPayment:false,criteria,decision},
            payment:{
                version:'clear-moodle-payment-status.1',requestRef,role,observedAt:seconds,expiresAtExclusive,
                displayOnly:true,paymentAuthority:false,
                decision:{...decision,sourceCurrentness:'NOT_RECHECKED',revision:kind==='mismatch'?2:1},
                consent:{participant:'RECORDED_WITHDRAW',operator:'RECORDED_AGREE',
                    publicationMatchesCurrentDecision:true,usableForPayment:false,onchainWalletSignaturesVerified:false},
                receipt:{state:included?'INCLUDED':'READBACK_UNAVAILABLE',symbol:'TEST',decimals:6,
                    amountAtoms:included?'100000000':null,canonical:included?true:null,finalized:included?false:null},
            },
        });
        if (kind === 'wrong-run') reply.ownerRunId = 'other-run';
        if (kind === 'wrong-ref') reply.requestRef = '0'.repeat(64);
        if (kind === 'expired') reply.expiresAtExclusive = seconds;
        send(res, 200, reply);
    } catch {
        console.log('REJECT authentication or envelope');
        send(res, 403, {});
    }
});
server.listen(18443,'0.0.0.0',()=>console.log('READY'));
