import { canonical,freeze,exactKeys,requireRule as check } from '../policy/values.mjs';
import { bytesDigest,identifier,hash32 } from './contract.mjs';
import { validateSourceSnapshot,sourceSnapshotHash,validateSourceBundle,sourceBundleHash } from './source-contract.mjs';
import { openPrivateDb } from './private-db.mjs';
const schema=`
CREATE TABLE IF NOT EXISTS snapshots(hash TEXT PRIMARY KEY,source_id TEXT NOT NULL,revision INTEGER NOT NULL,record TEXT NOT NULL,expires_at INTEGER NOT NULL,UNIQUE(source_id,revision)) STRICT;
CREATE TABLE IF NOT EXISTS artifacts(snapshot_hash TEXT NOT NULL REFERENCES snapshots(hash),artifact_id TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(snapshot_hash,artifact_id)) STRICT;
CREATE TABLE IF NOT EXISTS bundles(hash TEXT PRIMARY KEY,bundle_id TEXT NOT NULL,revision INTEGER NOT NULL,record TEXT NOT NULL,UNIQUE(bundle_id,revision)) STRICT;
CREATE TABLE IF NOT EXISTS bundle_heads(id TEXT PRIMARY KEY,hash TEXT NOT NULL REFERENCES bundles(hash),revision INTEGER NOT NULL) STRICT;
CREATE TRIGGER IF NOT EXISTS snapshot_immutable BEFORE UPDATE ON snapshots BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SOURCE');END;
CREATE TRIGGER IF NOT EXISTS artifact_immutable BEFORE UPDATE ON artifacts BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SOURCE');END;
CREATE TRIGGER IF NOT EXISTS bundle_immutable BEFORE UPDATE ON bundles BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SOURCE');END;
`;
export function openSourceStore({directory,environment,now=()=>Math.floor(Date.now()/1000)}){
  exactKeys(environment,['instanceId','origin','mode'],'SOURCE_ENVIRONMENT');identifier(environment.instanceId);
  check(environment.mode==='PUBLIC_SOURCE_ONLY'&&new URL(environment.origin).origin===environment.origin&&new URL(environment.origin).protocol==='https:','SOURCE_ENVIRONMENT');
  const store=openPrivateDb(directory,'sources.sqlite',environment,schema,['snapshots','artifacts','bundles','bundle_heads']),{db,transaction}=store;
  const clock=()=>{const t=now();check(Number.isSafeInteger(t)&&t>=0&&t<=4102444800,'SOURCE_TIME');return t;};
  function readSnapshot(hash){hash32(hash);const r=db.prepare('SELECT * FROM snapshots WHERE hash=?').get(hash);check(r,'SOURCE_NOT_FOUND');
    const s=JSON.parse(r.record);validateSourceSnapshot(s);check(sourceSnapshotHash(s)===hash&&r.expires_at===s.expiresAt,'SOURCE_INTEGRITY');return s;}
  function getSnapshot(hash){const s=readSnapshot(hash),t=clock();check(s.collectedAt<=t&&t<s.expiresAt,'SOURCE_EXPIRED');return freeze(s);}
  return {
    close:store.close,
    putSnapshot(snapshot,blobs){validateSourceSnapshot(snapshot);const hash=sourceSnapshotHash(snapshot),t=clock();check(snapshot.collectedAt<=t&&t<snapshot.expiresAt,'SOURCE_EXPIRED');
      check(blobs instanceof Map&&blobs.size===snapshot.artifacts.length,'SOURCE_ARTIFACT_SET');
      const copies=snapshot.artifacts.map(a=>{const bytes=blobs.get(a.artifactId);check(bytes instanceof Uint8Array&&bytes.byteLength===a.byteLength&&bytesDigest(bytes)===a.sha256,'SOURCE_BYTES_CHANGED');return {id:a.artifactId,bytes:Buffer.from(bytes)};});
      return transaction(()=>{const old=db.prepare('SELECT hash FROM snapshots WHERE source_id=? AND revision=?').get(snapshot.sourceId,snapshot.revision);
        if(old){check(old.hash===hash,'SOURCE_VERSION_CONFLICT');return hash;}
        check(db.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n<120,'SOURCE_ARCHIVE_LIMIT');
        db.prepare('INSERT INTO snapshots VALUES(?,?,?,?,?)').run(hash,snapshot.sourceId,snapshot.revision,canonical(snapshot),snapshot.expiresAt);
        for(const b of copies)db.prepare('INSERT INTO artifacts VALUES(?,?,?)').run(hash,b.id,b.bytes);return hash;
      });
    },
    getSnapshot,
    // Internal retention metadata only. Expired records/bytes remain inaccessible
    // through getSnapshot/getArtifact; no HTTP route exposes this helper.
    getSnapshotRetention(hash){const s=readSnapshot(hash);return freeze({collectedAt:s.collectedAt,expiresAt:s.expiresAt});},
    getArtifact(hash,id){identifier(id);const snapshot=getSnapshot(hash),meta=snapshot.artifacts.find(a=>a.artifactId===id);check(meta,'SOURCE_NOT_FOUND');
      const row=db.prepare('SELECT bytes FROM artifacts WHERE snapshot_hash=? AND artifact_id=?').get(hash,id);check(row&&row.bytes.byteLength===meta.byteLength&&bytesDigest(row.bytes)===meta.sha256,'SOURCE_BYTES_CHANGED');return Buffer.from(row.bytes);},
    putBundle(bundle){validateSourceBundle(bundle);for(const e of bundle.entries){const s=getSnapshot(e.snapshotHash);check(s.sourceId===e.sourceId&&s.revision===e.revision&&s.institutionId===bundle.institutionId&&s.productId===bundle.productId&&s.cohortId===bundle.cohortId,'SOURCE_SCOPE');}
      const hash=sourceBundleHash(bundle);return transaction(()=>{const prior=db.prepare('SELECT * FROM bundle_heads WHERE id=?').get(bundle.bundleId);
        if(prior?.revision===bundle.revision){check(prior.hash===hash,'SOURCE_VERSION_CONFLICT');return hash;}check(!prior||bundle.revision>prior.revision,'SOURCE_STALE');
        db.prepare('INSERT INTO bundles VALUES(?,?,?,?)').run(hash,bundle.bundleId,bundle.revision,canonical(bundle));
        db.prepare('INSERT INTO bundle_heads VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET hash=excluded.hash,revision=excluded.revision').run(bundle.bundleId,hash,bundle.revision);return hash;
      });
    },
    getBundle(hash){hash32(hash);const row=db.prepare('SELECT record FROM bundles WHERE hash=?').get(hash);check(row,'SOURCE_NOT_FOUND');const b=JSON.parse(row.record);check(sourceBundleHash(b)===hash,'SOURCE_INTEGRITY');return freeze(b);},
    getCurrentBundleHash(id){identifier(id);const row=db.prepare('SELECT hash FROM bundle_heads WHERE id=?').get(id);check(row,'SOURCE_NOT_FOUND');return row.hash;},
    purgeExpired(){return transaction(()=>({deletedArtifacts:db.prepare('DELETE FROM artifacts WHERE snapshot_hash IN (SELECT hash FROM snapshots WHERE expires_at<=?)').run(clock()).changes}));},
  };
}
