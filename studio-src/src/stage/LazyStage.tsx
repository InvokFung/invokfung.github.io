import { Suspense, lazy, type ComponentProps } from "react";
import type StageComponent from "./Stage";

export type { StageFocus } from "./Stage";

const Stage = lazy(() => import("./Stage"));

/**
 * three.js and React Three Fiber load as their own chunk: the page (and the
 * audio engine) are usable before the WebGL stage arrives.
 */
export default function LazyStage(props: ComponentProps<typeof StageComponent>) {
  return (
    <Suspense fallback={<div className="stage stage-loading" role="img" aria-label={props.ariaLabel} />}>
      <Stage {...props} />
    </Suspense>
  );
}
