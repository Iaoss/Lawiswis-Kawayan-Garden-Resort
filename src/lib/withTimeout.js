// Gives up on a slow step after `ms` milliseconds, so a page never waits
// forever (e.g. no internet, or the database not answering).
export class TimeoutError extends Error {
  constructor(message = 'This is taking too long.') {
    super(message);
    this.code = 'timeout';
  }
}

export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
