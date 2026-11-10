let pending: Promise<void> = Promise.resolve();

/* Account changes run one at a time. Each response resets the session cookie, so a sign-out that
   raced an in-flight save could leave the browser signed in again. */
export function runAccountMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = pending.then(mutation);
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
