// Small pure helpers shared by the modules. Nothing here touches the browser.

// A loader run once, whose promise is kept; a failure forgets it, so the next call tries again.
export function lazy(loader) {
  let promise = null;
  return () => {
    promise ??= loader().catch(error => {
      promise = null;
      throw error;
    });
    return promise;
  };
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
