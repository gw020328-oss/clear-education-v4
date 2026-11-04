// Internal registration keeps the standalone synthetic entry point free of product dependencies.
// Same-process JavaScript is trusted; no HTTP route accepts profile objects or functions.
const profiles = new WeakMap();
export const studentProfile = value => profiles.get(value);
export const registerStudentProfile = (value, implementation) => profiles.set(value, implementation);
