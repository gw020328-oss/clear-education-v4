// Docker CLI port for the native Moodle owner runtime.
//
// Every source read re-checks that the owned Moodle container is still the
// current one (`docker container ls --filter label=<owner run>`). On Docker
// Desktop that listing can fail transiently with exit status 1
// "Cannot connect to the Docker daemon at unix://…/docker.sock" while other
// docker CLI processes run. Before this port such a blip was wrapped as a bare
// NATIVE_OWNER_DOCKER_UNAVAILABLE (no cause) and failed the whole run closed.
//
// - Failures are reduced to one fixed code. stderr, argv, labels and container
//   IDs never leave this module.
// - Only the two read-only listings may retry, only for the daemon-socket
//   connect failure, immediately, at most `listAttempts` calls in total. The
//   caller still asserts the exact owned container on the returned listing, so
//   the currentness guard is unchanged.
// - Writes (create/start/exec/rm) are never retried.
import {execFileSync} from 'node:child_process';

const SPAWN_CODES = new Set(['EAGAIN', 'ENOMEM', 'ENOBUFS', 'EMFILE', 'ENFILE', 'ENOENT', 'EACCES', 'EPERM']);
// Docker CLI wording for a connection that never reached the daemon (both observed on this Mac):
// transient refusal on Docker Desktop's socket, and a missing/replaced socket.
const DAEMON_UNREACHABLE = /^(?:Cannot connect to the Docker daemon|failed to connect to the docker API)\b/m;
const own = (value, key) => {
  try { return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined; }
  catch { return undefined; }
};

/** Fixed code for a docker CLI failure. Never returns or stores the original text. */
export function dockerFailureCode(error) {
  const code = own(error, 'code'), status = own(error, 'status'), signal = own(error, 'signal');
  if (code === 'ETIMEDOUT') return 'DOCKER_CLI_TIMEOUT';
  if (typeof code === 'string' && SPAWN_CODES.has(code)) return code;
  if (status === 1) {
    const stderr = own(error, 'stderr');
    const text = typeof stderr === 'string' ? stderr : Buffer.isBuffer(stderr) ? stderr.toString('utf8') : '';
    if (DAEMON_UNREACHABLE.test(text)) return 'DOCKER_DAEMON_UNREACHABLE';
  }
  if (typeof signal === 'string' && signal) return 'DOCKER_CLI_SIGNAL';
  return 'DOCKER_EXIT_NONZERO';
}

const READ_ONLY_LISTINGS = [['container', 'ls'], ['volume', 'ls']];
const isListing = args => Array.isArray(args) && READ_ONLY_LISTINGS.some(([a, b]) => args[0] === a && args[1] === b);

export function createOwnerDocker({exec = execFileSync, listAttempts = 3} = {}) {
  if (typeof exec !== 'function' || !Number.isSafeInteger(listAttempts) || listAttempts < 1 || listAttempts > 3) {
    throw Error('NATIVE_OWNER_DOCKER_CONFIG');
  }
  const invoke = (args, input) => exec('docker', args,
    {input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024, timeout: 30000});
  const failure = (error, failurePhase) => {
    const code = dockerFailureCode(error);
    const wrapped = Error('NATIVE_OWNER_DOCKER_UNAVAILABLE', {cause: Object.assign(Error(code), {code})});
    if (failurePhase) Object.defineProperty(wrapped, 'failurePhase', {value: failurePhase});
    return wrapped;
  };
  return Object.freeze({
    /** Any docker command. One attempt. */
    run(args, input) {
      try { return invoke(args, input); } catch (error) { throw failure(error); }
    },
    /** Read-only owned container/volume listing. Bounded retry on daemon-socket connect failure only. */
    list(args) {
      if (!isListing(args)) throw Error('NATIVE_OWNER_DOCKER_LISTING');
      for (let attempt = 1; ; attempt += 1) {
        try { return invoke(args); } catch (error) {
          if (attempt < listAttempts && dockerFailureCode(error) === 'DOCKER_DAEMON_UNREACHABLE') continue;
          throw failure(error, 'NATIVE_OWNER_CONTAINER_PROBE');
        }
      }
    },
  });
}
