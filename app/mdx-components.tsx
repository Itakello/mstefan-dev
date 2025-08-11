import * as React from "react";

export function useMDXComponents(
  components?: Record<string, React.ComponentType<any>>
) {
  return {
    ...components
  } as Record<string, React.ComponentType<any>>;
}


