export async function executeWithErrorHandling<T>(
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Centralized error logging to avoid repeated try/catch boilerplate
    // The thrown error is preserved to keep original behavior
    // eslint-disable-next-line no-console
    console.error(`${action}:`, error);
    throw error;
  }
}