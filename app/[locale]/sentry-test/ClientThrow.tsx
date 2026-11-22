"use client";

function failInBrowser(): never {
  throw new Error("Sentry verification: browser error");
}

export function ClientThrow() {
  return <button onClick={() => failInBrowser()}>Throw browser error</button>;
}
