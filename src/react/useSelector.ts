import { computeSelector, observe, Selector, symbolUndef, isPrimitive } from '@legendapp/state';
import { useReducer } from 'react';

const Update = (s) => s + 1;

export function useSelector<T>(
    selector: Selector<T>,
    options?: { forceRender?: () => void; skipCompare?: boolean }
): T {
    let inRun = true;
    let ret: T = symbolUndef as unknown as T;
    const forceRender = options?.forceRender || useReducer(Update, 0)[1];
    const skipCompare = options?.skipCompare;

    observe(function update() {
        // If running, call selector and re-render if changed
        let cur = (inRun || !skipCompare) && computeSelector(selector);
        // Re-render if not currently rendering and value has changed
        if (!inRun && (skipCompare || cur !== ret || !isPrimitive(cur))) {
            forceRender();
            // Return false so that observe does not track
            return false;
        }
        ret = cur;
        inRun = false;
    });

    // Note: This does not have a useEffect to cleanup listeners because it is ok
    // to call useReducer after unmounting. So it will lazily cleanup after unmount
    // because it will call fr() and return false to not track. Then since fr() does
    // not trigger re-render since it's unmounted, it does not set up tracking again.

    return ret;
}
