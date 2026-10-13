// Test-only process that intentionally ignores IPC until its parent kills it.
process.on('message', () => {});
setInterval(() => {}, 1000);
