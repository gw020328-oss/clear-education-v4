import {validateConfig,check} from './config.mjs';

export function railwayConfiguration(env) {
  check(env.RAILWAY_VOLUME_MOUNT_PATH==='/var/lib/clear-preview','PERSISTENT_VOLUME_REQUIRED');
  check(typeof env.CLEAR_PREVIEW_HMAC_SECRET==='string' && /^[a-f0-9]{64}$/.test(env.CLEAR_PREVIEW_HMAC_SECRET),'SECRET_FORMAT');
  return validateConfig({version:'clear-external-preview-config.1',publicOrigin:env.CLEAR_PREVIEW_PUBLIC_ORIGIN,
    port:Number(env.PORT??'8080'),institutionId:env.CLEAR_PREVIEW_INSTITUTION_ID,
    courseId:env.CLEAR_PREVIEW_COURSE_ID,operatorId:env.CLEAR_PREVIEW_OPERATOR_ID,
    dataMode:'DEMO_ACCOUNTS_ONLY',databasePath:'/var/lib/clear-preview/state/approvals.sqlite',
    artifactHash:env.CLEAR_PREVIEW_ARTIFACT_HASH,deploymentEpoch:env.CLEAR_PREVIEW_DEPLOYMENT_EPOCH,
    // The generic profile requires this field. This runner takes the secret directly from env;
    // no private key/secret is written to this placeholder path or the image.
    sharedSecretFile:'/run/secrets/not-used-by-railway'});
}
