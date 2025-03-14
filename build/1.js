// src/is.ts
var hasOwnProperty = Object.prototype.hasOwnProperty;
function isArray(obj) {
  return Array.isArray(obj);
}
function isObject(obj) {
  return !!obj && typeof obj === "object" && !(obj instanceof Date) && !isArray(obj);
}
function isPlainObject(obj) {
  return isObject(obj) && obj.constructor === Object;
}
function isFunction(obj) {
  return typeof obj === "function";
}
function isPrimitive(arg) {
  const type = typeof arg;
  return arg !== undefined && (isDate(arg) || type !== "object" && type !== "function");
}
function isDate(obj) {
  return obj instanceof Date;
}
function isBoolean(obj) {
  return typeof obj === "boolean";
}
function isPromise(obj) {
  return obj instanceof Promise;
}
function isMap(obj) {
  return obj instanceof Map || obj instanceof WeakMap;
}
function isSet(obj) {
  return obj instanceof Set || obj instanceof WeakSet;
}
function isEmpty(obj) {
  if (!obj)
    return false;
  if (isArray(obj))
    return obj.length === 0;
  if (isMap(obj) || isSet(obj))
    return obj.size === 0;
  for (const key in obj) {
    if (hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  return true;
}
function isNullOrUndefined(value) {
  return value === undefined || value === null;
}
var setPrimitives = new Set(["boolean", "string", "number"]);
function isActualPrimitive(arg) {
  return setPrimitives.has(typeof arg);
}
function isChildNode(node) {
  return !!node.parent;
}

// src/globals.ts
var symbolToPrimitive = Symbol.toPrimitive;
var symbolIterator = Symbol.iterator;
var symbolGetNode = Symbol("getNode");
var symbolDelete = /* @__PURE__ */ Symbol("delete");
var symbolOpaque = Symbol("opaque");
var symbolPlain = Symbol("plain");
var optimized = Symbol("optimized");
var symbolLinked = Symbol("linked");
var globalState = {
  pendingNodes: new Map,
  dirtyNodes: new Set
};
function isHintOpaque(value) {
  return value && (value[symbolOpaque] || value["$$typeof"]);
}
function isHintPlain(value) {
  return value && value[symbolPlain];
}
function getPathType(value) {
  return isArray(value) ? "array" : isMap(value) ? "map" : value instanceof Set ? "set" : "object";
}
function replacer(key, value) {
  if (isMap(value)) {
    return {
      __LSType: "Map",
      value: Array.from(value.entries())
    };
  } else if (value instanceof Set) {
    return {
      __LSType: "Set",
      value: Array.from(value)
    };
  } else if (globalState.replacer) {
    value = globalState.replacer(key, value);
  }
  return value;
}
var ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
function reviver(key, value) {
  if (value) {
    if (typeof value === "string" && ISO8601.test(value)) {
      return new Date(value);
    }
    if (typeof value === "object") {
      if (value.__LSType === "Map") {
        return new Map(value.value);
      } else if (value.__LSType === "Set") {
        return new Set(value.value);
      }
    }
    if (globalState.reviver) {
      value = globalState.reviver(key, value);
    }
  }
  return value;
}
function safeStringify(value) {
  return value ? JSON.stringify(value, replacer) : value;
}
function safeParse(value) {
  return value ? JSON.parse(value, reviver) : value;
}
function clone(value) {
  return safeParse(safeStringify(value));
}
function isObservable(value$) {
  return !!value$ && !!value$[symbolGetNode];
}
function getNode(value$) {
  return value$ && value$[symbolGetNode];
}
function isEvent(value$) {
  return value$ && value$[symbolGetNode]?.isEvent;
}
function setNodeValue(node, newValue) {
  const parentNode = node.parent ?? node;
  const key = node.parent ? node.key : "_";
  const isDelete = newValue === symbolDelete;
  if (isDelete)
    newValue = undefined;
  const parentValue = node.parent ? ensureNodeValue(parentNode) : parentNode.root;
  const useSetFn = isSet(parentValue);
  const useMapFn = isMap(parentValue);
  const prevValue = useSetFn ? key : useMapFn ? parentValue.get(key) : parentValue[key];
  const isFunc = isFunction(newValue);
  newValue = !parentNode.isAssigning && isFunc && !isFunction(prevValue) ? newValue(prevValue) : newValue;
  if (newValue !== prevValue) {
    try {
      parentNode.isSetting = (parentNode.isSetting || 0) + 1;
      if (isDelete) {
        if (useMapFn || useSetFn) {
          parentValue.delete(key);
        } else {
          delete parentValue[key];
        }
      } else {
        if (useSetFn) {
          parentValue.add(newValue);
        } else if (useMapFn) {
          parentValue.set(key, newValue);
        } else {
          parentValue[key] = newValue;
        }
      }
    } finally {
      parentNode.isSetting--;
    }
  }
  return { prevValue, newValue, parentValue };
}
var arrNodeKeys = [];
function getNodeValue(node) {
  let count = 0;
  let n = node;
  while (isChildNode(n)) {
    arrNodeKeys[count++] = n.key;
    n = n.parent;
  }
  let child = node.root._;
  for (let i = count - 1;child && i >= 0; i--) {
    const key = arrNodeKeys[i];
    child = key !== "size" && (isMap(child) || child instanceof WeakMap) ? child.get(key) : child[key];
  }
  return child;
}
function getChildNode(node, key, asFunction) {
  let child = node.children?.get(key);
  if (!child) {
    child = {
      root: node.root,
      parent: node,
      key,
      lazy: true,
      numListenersRecursive: 0
    };
    if (node.lazyFn?.length === 1) {
      asFunction = node.lazyFn.bind(node, key);
    }
    if (isFunction(asFunction)) {
      child = Object.assign(() => {}, child);
      child.lazyFn = asFunction;
    }
    if (!node.children) {
      node.children = new Map;
    }
    node.children.set(key, child);
  }
  return child;
}
function ensureNodeValue(node) {
  let value = getNodeValue(node);
  if (!value || isFunction(value)) {
    if (isChildNode(node)) {
      const parent = ensureNodeValue(node.parent);
      value = parent[node.key] = {};
    } else {
      value = node.root._ = {};
    }
  }
  return value;
}
function findIDKey(obj, node) {
  let idKey = isObservable(obj) ? undefined : isObject(obj) ? "id" in obj ? "id" : ("key" in obj) ? "key" : ("_id" in obj) ? "_id" : ("__id" in obj) ? "__id" : undefined : undefined;
  if (!idKey && node.parent) {
    const k = node.key + "_keyExtractor";
    const keyExtractor = node.functions?.get(k) ?? getNodeValue(node.parent)[node.key + "_keyExtractor"];
    if (keyExtractor && isFunction(keyExtractor)) {
      idKey = keyExtractor;
    }
  }
  return idKey;
}
function extractFunction(node, key, fnOrComputed) {
  if (!node.functions) {
    node.functions = new Map;
  }
  node.functions.set(key, fnOrComputed);
}
function equals(a, b) {
  return a === b || isDate(a) && isDate(b) && +a === +b;
}
function getKeys(obj, isArr, isMap2, isSet2) {
  return isArr ? undefined : obj ? isSet2 ? Array.from(obj) : isMap2 ? Array.from(obj.keys()) : Object.keys(obj) : [];
}
// src/helpers.ts
function computeSelector(selector, getOptions, e, retainObservable) {
  let c = selector;
  if (!isObservable(c) && isFunction(c)) {
    c = e ? c(e) : c();
  }
  return isObservable(c) && !retainObservable ? c.get(getOptions) : c;
}
function setAtPath(obj, path, pathTypes, value, mode, fullObj, restore) {
  let p = undefined;
  let o = obj;
  if (path.length > 0) {
    let oFull = fullObj;
    for (let i = 0;i < path.length; i++) {
      p = path[i];
      const map = isMap(o);
      let child = o ? map ? o.get(p) : o[p] : undefined;
      const fullChild = oFull ? map ? oFull.get(p) : oFull[p] : undefined;
      if (child === symbolDelete) {
        if (oFull) {
          if (map) {
            o.set(p, fullChild);
          } else {
            o[p] = fullChild;
          }
          restore?.(path.slice(0, i + 1), fullChild);
        }
        return obj;
      } else if (child === undefined && value === undefined && i === path.length - 1) {
        return obj;
      } else if (i < path.length - 1 && (child === undefined || child === null)) {
        child = initializePathType(pathTypes[i]);
        if (isMap(o)) {
          o.set(p, child);
        } else {
          o[p] = child;
        }
      }
      if (i < path.length - 1) {
        o = child;
        if (oFull) {
          oFull = fullChild;
        }
      }
    }
  }
  if (p === undefined) {
    if (mode === "merge") {
      obj = deepMerge(obj, value);
    } else {
      obj = value;
    }
  } else {
    if (mode === "merge") {
      o[p] = deepMerge(o[p], value);
    } else if (isMap(o)) {
      o.set(p, value);
    } else {
      o[p] = value;
    }
  }
  return obj;
}
function deconstructObjectWithPath(path, pathTypes, value) {
  let o = value;
  for (let i = 0;i < path.length; i++) {
    const p = path[i];
    o = o ? o[p] : initializePathType(pathTypes[i]);
  }
  return o;
}
function isObservableValueReady(value) {
  return !!value && (!isObject(value) && !isArray(value) || !isEmpty(value));
}
function initializePathType(pathType) {
  switch (pathType) {
    case "array":
      return [];
    case "map":
      return new Map;
    case "set":
      return new Set;
    case "object":
    default:
      return {};
  }
}
function applyChange(value, change, applyPrevious) {
  const { path, valueAtPath, prevAtPath, pathTypes } = change;
  return setAtPath(value, path, pathTypes, applyPrevious ? prevAtPath : valueAtPath);
}
function applyChanges(value, changes, applyPrevious) {
  for (let i = 0;i < changes.length; i++) {
    value = applyChange(value, changes[i], applyPrevious);
  }
  return value;
}
function deepMerge(target, ...sources) {
  if (isPrimitive(target)) {
    return sources[sources.length - 1];
  }
  let result = isArray(target) ? [...target] : { ...target };
  for (let i = 0;i < sources.length; i++) {
    const obj2 = sources[i];
    if (isPlainObject(obj2) || isArray(obj2)) {
      const objTarget = obj2;
      for (const key in objTarget) {
        if (hasOwnProperty.call(objTarget, key)) {
          if (objTarget[key] instanceof Object && !isObservable(objTarget[key]) && Object.keys(objTarget[key]).length > 0) {
            result[key] = deepMerge(result[key] || (isArray(objTarget[key]) ? [] : {}), objTarget[key]);
          } else {
            result[key] = objTarget[key];
          }
        }
      }
    } else {
      result = obj2;
    }
  }
  return result;
}

// src/batching.ts
var timeout;
var numInBatch = 0;
var isRunningBatch = false;
var didDelayEndBatch = false;
var _batchMap = new Map;
function onActionTimeout() {
  if (_batchMap.size > 0) {
    if (true) {
      console.error("Forcibly completing observableBatcher because end() was never called. This may be due to an uncaught error between begin() and end().");
    }
    endBatch(true);
  }
}
function isArraySubset(mainArr, subsetArr) {
  for (let i = 0;i < mainArr.length; i++) {
    if (mainArr[i] !== subsetArr[i]) {
      return false;
    }
  }
  return true;
}
function createPreviousHandlerInner(value, changes) {
  try {
    return applyChanges(value ? clone(value) : {}, changes, true);
  } catch {
    return;
  }
}
function createPreviousHandler(value, changes) {
  return function() {
    return createPreviousHandlerInner(value, changes);
  };
}
function notify(node, value, prev, level, whenOptimizedOnlyIf) {
  const changesInBatch = new Map;
  computeChangesRecursive(changesInBatch, node, !!globalState.isLoadingLocal, !!globalState.isLoadingRemote, value, [], [], value, prev, true, level, whenOptimizedOnlyIf);
  const existing = _batchMap.get(node);
  if (existing) {
    if (existing.prev === value) {
      _batchMap.delete(node);
    } else {
      existing.value = value;
    }
  } else {
    _batchMap.set(node, {
      value,
      prev,
      level,
      whenOptimizedOnlyIf,
      isFromSync: !!globalState.isLoadingRemote,
      isFromPersist: !!globalState.isLoadingLocal
    });
  }
  if (changesInBatch.size) {
    batchNotifyChanges(changesInBatch, true);
  }
  if (numInBatch <= 0) {
    runBatch();
  }
}
function computeChangesAtNode(changesInBatch, node, isFromPersist, isFromSync, value, path, pathTypes, valueAtPath, prevAtPath, immediate, level, whenOptimizedOnlyIf) {
  if (immediate ? node.listenersImmediate : node.listeners) {
    const change = {
      path,
      pathTypes,
      valueAtPath,
      prevAtPath
    };
    const changeInBatch = changesInBatch.get(node);
    if (changeInBatch && path.length > 0) {
      const { changes } = changeInBatch;
      if (!isArraySubset(changes[0].path, change.path)) {
        changes.push(change);
        changeInBatch.level = Math.min(changeInBatch.level, level);
        changeInBatch.whenOptimizedOnlyIf ||= whenOptimizedOnlyIf;
      }
    } else {
      changesInBatch.set(node, {
        level,
        value,
        isFromSync,
        isFromPersist,
        whenOptimizedOnlyIf,
        changes: [change]
      });
    }
  }
}
function computeChangesRecursive(changesInBatch, node, loading, remote, value, path, pathTypes, valueAtPath, prevAtPath, immediate, level, whenOptimizedOnlyIf) {
  computeChangesAtNode(changesInBatch, node, loading, remote, value, path, pathTypes, valueAtPath, prevAtPath, immediate, level, whenOptimizedOnlyIf);
  if (node.linkedFromNodes) {
    for (const linkedFromNode of node.linkedFromNodes) {
      const childNode = getNodeAtPath(linkedFromNode, path);
      computeChangesRecursive(changesInBatch, childNode, loading, remote, valueAtPath, [], [], valueAtPath, prevAtPath, immediate, 0, whenOptimizedOnlyIf);
    }
  }
  if (node.parent) {
    const parent = node.parent;
    if (parent) {
      const parentValue = getNodeValue(parent);
      computeChangesRecursive(changesInBatch, parent, loading, remote, parentValue, [node.key].concat(path), [getPathType(value)].concat(pathTypes), valueAtPath, prevAtPath, immediate, level + 1, whenOptimizedOnlyIf);
    }
  }
}
function batchNotifyChanges(changesInBatch, immediate) {
  const listenersNotified = new Set;
  changesInBatch.forEach(({ changes, level, value, isFromPersist, isFromSync, whenOptimizedOnlyIf }, node) => {
    const listeners = immediate ? node.listenersImmediate : node.listeners;
    if (listeners) {
      let listenerParams;
      const arr = Array.from(listeners);
      for (let i = 0;i < arr.length; i++) {
        const listenerFn = arr[i];
        const { track, noArgs, listener } = listenerFn;
        if (!listenersNotified.has(listener)) {
          const ok = track === true ? level <= 0 : track === optimized ? whenOptimizedOnlyIf && level <= 0 : true;
          if (ok) {
            if (!noArgs && !listenerParams) {
              listenerParams = {
                value,
                isFromPersist,
                isFromSync,
                getPrevious: createPreviousHandler(value, changes),
                changes
              };
            }
            if (!track) {
              listenersNotified.add(listener);
            }
            listener(listenerParams);
          }
        }
      }
    }
  });
}
function runBatch() {
  const dirtyNodes = Array.from(globalState.dirtyNodes);
  globalState.dirtyNodes.clear();
  dirtyNodes.forEach((node) => {
    const dirtyFn = node.dirtyFn;
    if (dirtyFn) {
      node.dirtyFn = undefined;
      dirtyFn();
    }
  });
  const map = _batchMap;
  _batchMap = new Map;
  const changesInBatch = new Map;
  map.forEach(({ value, prev, level, isFromPersist, isFromSync, whenOptimizedOnlyIf }, node) => {
    computeChangesRecursive(changesInBatch, node, isFromPersist, isFromSync, value, [], [], value, prev, false, level, whenOptimizedOnlyIf);
  });
  if (changesInBatch.size) {
    batchNotifyChanges(changesInBatch, false);
  }
}
function beginBatch() {
  numInBatch++;
  if (!timeout) {
    timeout = setTimeout(onActionTimeout, 0);
  }
}
function endBatch(force) {
  numInBatch--;
  if (numInBatch <= 0 || force) {
    if (isRunningBatch) {
      didDelayEndBatch = true;
    } else {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      numInBatch = 0;
      isRunningBatch = true;
      runBatch();
      isRunningBatch = false;
      if (didDelayEndBatch) {
        didDelayEndBatch = false;
        endBatch(true);
      }
    }
  }
}
function getNodeAtPath(obj, path) {
  let o = obj;
  for (let i = 0;i < path.length; i++) {
    const p = path[i];
    o = getChildNode(o, p);
  }
  return o;
}

// src/createObservable.ts
function createObservable(value, makePrimitive, extractPromise, createObject, createPrimitive) {
  if (isObservable(value)) {
    return value;
  }
  const valueIsPromise = isPromise(value);
  const valueIsFunction = isFunction(value);
  const root = {
    _: value
  };
  let node = {
    root,
    lazy: true,
    numListenersRecursive: 0
  };
  if (valueIsFunction) {
    node = Object.assign(() => {}, node);
    node.lazyFn = value;
  }
  const prim = makePrimitive || isActualPrimitive(value);
  const obs = prim ? new createPrimitive(node) : createObject(node);
  if (valueIsPromise) {
    setNodeValue(node, undefined);
    extractPromise(node, value);
  }
  return obs;
}

// src/linked.ts
function linked(params, options) {
  if (isFunction(params)) {
    params = { get: params };
  }
  if (options) {
    params = { ...params, ...options };
  }
  const ret = function() {
    return { [symbolLinked]: params };
  };
  ret.prototype[symbolLinked] = params;
  return ret;
}

// src/middleware.ts
var nodeMiddlewareHandlers = new WeakMap;
var queuedNodes = [];
var queuedListeners = [];
var queuedTypes = [];
var queueSize = 0;
var isMicrotaskScheduled = false;
function dispatchMiddlewareEvent(node, listener, type) {
  const handlersMap = nodeMiddlewareHandlers.get(node);
  if (!handlersMap || !handlersMap.has(type)) {
    return;
  }
  const handlers = handlersMap.get(type);
  if (!handlers || handlers.size === 0) {
    return;
  }
  queuedNodes[queueSize] = node;
  queuedListeners[queueSize] = listener;
  queuedTypes[queueSize] = type;
  queueSize++;
  if (!isMicrotaskScheduled) {
    isMicrotaskScheduled = true;
    queueMicrotask(processQueuedEvents);
  }
}
var eventObj = {
  type: "listener-added",
  node: null,
  listener: undefined,
  timestamp: 0
};
function processQueuedEvents() {
  isMicrotaskScheduled = false;
  const timestamp = typeof performance !== "undefined" ? performance.now() : Date.now();
  eventObj.timestamp = timestamp;
  for (let i = 0;i < queueSize; i++) {
    const node = queuedNodes[i];
    const listener = queuedListeners[i];
    const type = queuedTypes[i];
    const handlersMap = nodeMiddlewareHandlers.get(node);
    if (!handlersMap)
      continue;
    const handlers = handlersMap.get(type);
    if (!handlers || handlers.size === 0)
      continue;
    const nodeListeners = node.listeners;
    const nodeListenersImmediate = node.listenersImmediate;
    if (!nodeListeners && !nodeListenersImmediate) {
      continue;
    }
    let isValid = false;
    if (type === "listener-added") {
      isValid = !!nodeListeners?.has(listener) || !!nodeListenersImmediate?.has(listener);
    } else if (type === "listener-removed") {
      isValid = !nodeListeners?.has(listener) && !nodeListenersImmediate?.has(listener);
    } else {
      isValid = !nodeListeners?.size && !nodeListenersImmediate?.size;
    }
    if (isValid) {
      eventObj.type = type;
      eventObj.node = node;
      eventObj.listener = listener;
      const iterableHandlers = Array.from(handlers);
      for (let j = 0;j < iterableHandlers.length; j++) {
        try {
          iterableHandlers[j](eventObj);
        } catch (error) {
          console.error(`Error in middleware handler for ${type}:`, error);
        }
      }
    }
  }
  queueSize = 0;
}

// src/onChange.ts
function onChange(node, callback, options = {}, fromLinks) {
  const { initial, immediate, noArgs } = options;
  const { trackingType } = options;
  let listeners = immediate ? node.listenersImmediate : node.listeners;
  if (!listeners) {
    listeners = new Set;
    if (immediate) {
      node.listenersImmediate = listeners;
    } else {
      node.listeners = listeners;
    }
  }
  const listener = {
    listener: callback,
    track: trackingType,
    noArgs
  };
  listeners.add(listener);
  if (initial) {
    const value = getNodeValue(node);
    callback({
      value,
      isFromPersist: true,
      isFromSync: false,
      changes: [
        {
          path: [],
          pathTypes: [],
          prevAtPath: value,
          valueAtPath: value
        }
      ],
      getPrevious: () => {
        return;
      }
    });
  }
  let extraDisposes;
  function addLinkedNodeListeners(childNode, cb = callback, from) {
    if (!fromLinks?.has(childNode)) {
      fromLinks ||= new Set;
      fromLinks.add(from || node);
      cb ||= callback;
      const childOptions = {
        trackingType: true,
        ...options
      };
      extraDisposes = [...extraDisposes || [], onChange(childNode, cb, childOptions, fromLinks)];
    }
  }
  if (node.linkedToNode) {
    addLinkedNodeListeners(node.linkedToNode);
  }
  node.linkedFromNodes?.forEach((linkedFromNode) => addLinkedNodeListeners(linkedFromNode));
  node.numListenersRecursive++;
  let parent = node.parent;
  let pathParent = [node.key];
  while (parent) {
    if (parent.linkedFromNodes) {
      for (const linkedFromNode of parent.linkedFromNodes) {
        if (!fromLinks?.has(linkedFromNode)) {
          const cb = createCb(linkedFromNode, pathParent, callback);
          addLinkedNodeListeners(linkedFromNode, cb, parent);
        }
      }
    }
    parent.numListenersRecursive++;
    pathParent = [parent.key, ...pathParent];
    parent = parent.parent;
  }
  dispatchMiddlewareEvent(node, listener, "listener-added");
  return () => {
    listeners.delete(listener);
    extraDisposes?.forEach((fn) => fn());
    let parent2 = node;
    while (parent2) {
      parent2.numListenersRecursive--;
      parent2 = parent2.parent;
    }
    dispatchMiddlewareEvent(node, listener, "listener-removed");
    if (listeners.size === 0) {
      dispatchMiddlewareEvent(node, undefined, "listeners-cleared");
    }
  };
}
function createCb(linkedFromNode, path, callback) {
  let prevAtPath = deconstructObjectWithPath(path, [], getNodeValue(linkedFromNode));
  return function({ value: valueA, isFromPersist, isFromSync }) {
    const valueAtPath = deconstructObjectWithPath(path, [], valueA);
    if (valueAtPath !== prevAtPath) {
      callback({
        value: valueAtPath,
        isFromPersist,
        isFromSync,
        changes: [
          {
            path: [],
            pathTypes: [],
            prevAtPath,
            valueAtPath
          }
        ],
        getPrevious: () => prevAtPath
      });
    }
    prevAtPath = valueAtPath;
  };
}

// src/setupTracking.ts
function setupTracking(nodes, update, noArgs, immediate) {
  let listeners = [];
  nodes?.forEach((tracked) => {
    const { node, track } = tracked;
    listeners.push(onChange(node, update, { trackingType: track, immediate, noArgs }));
  });
  return () => {
    if (listeners) {
      for (let i = 0;i < listeners.length; i++) {
        listeners[i]();
      }
      listeners = undefined;
    }
  };
}

// src/tracking.ts
var trackCount = 0;
var trackingQueue = [];
var tracking = {
  current: undefined
};
function beginTracking() {
  trackingQueue.push(tracking.current);
  trackCount++;
  tracking.current = {};
}
function endTracking() {
  trackCount--;
  if (trackCount < 0) {
    trackCount = 0;
  }
  tracking.current = trackingQueue.pop();
}
function updateTracking(node, track) {
  if (trackCount) {
    const tracker = tracking.current;
    if (tracker) {
      if (!tracker.nodes) {
        tracker.nodes = new Map;
      }
      const existing = tracker.nodes.get(node);
      if (existing) {
        existing.track = existing.track || track;
        existing.num++;
      } else {
        tracker.nodes.set(node, { node, track, num: 1 });
      }
    }
  }
}

// src/trackSelector.ts
function trackSelector(selector, update, getOptions, observeEvent, observeOptions, createResubscribe) {
  let dispose;
  let resubscribe;
  let updateFn = update;
  beginTracking();
  const value = selector ? computeSelector(selector, getOptions, observeEvent, observeOptions?.fromComputed) : selector;
  const tracker = tracking.current;
  const nodes = tracker.nodes;
  endTracking();
  if (tracker && nodes) {
    tracker.traceListeners?.(nodes);
    if (tracker.traceUpdates) {
      updateFn = tracker.traceUpdates(update);
    }
    tracker.traceListeners = undefined;
    tracker.traceUpdates = undefined;
  }
  if (!observeEvent?.cancel) {
    dispose = setupTracking(nodes, updateFn, false, observeOptions?.immediate);
    if (true) {
      resubscribe = createResubscribe ? () => {
        dispose?.();
        dispose = setupTracking(nodes, updateFn);
        return dispose;
      } : undefined;
    }
  }
  return { nodes, value, dispose, resubscribe };
}

// src/observe.ts
function observe(selectorOrRun, reactionOrOptions, options) {
  let reaction;
  if (isFunction(reactionOrOptions)) {
    reaction = reactionOrOptions;
  } else {
    options = reactionOrOptions;
  }
  let dispose;
  let isRunning = false;
  const e = { num: 0 };
  const update = function() {
    if (isRunning) {
      return;
    }
    if (e.onCleanup) {
      e.onCleanup();
      e.onCleanup = undefined;
    }
    isRunning = true;
    beginBatch();
    delete e.value;
    dispose?.();
    const {
      dispose: _dispose,
      value,
      nodes
    } = trackSelector(selectorOrRun, update, undefined, e, options);
    dispose = _dispose;
    e.value = value;
    e.nodes = nodes;
    e.refresh = update;
    if (e.onCleanupReaction) {
      e.onCleanupReaction();
      e.onCleanupReaction = undefined;
    }
    endBatch();
    isRunning = false;
    if (reaction && (options?.fromComputed || (e.num > 0 || !isEvent(selectorOrRun)) && (e.previous !== e.value || typeof e.value === "object"))) {
      reaction(e);
    }
    e.previous = e.value;
    e.num++;
  };
  update();
  return () => {
    e.onCleanup?.();
    e.onCleanup = undefined;
    e.onCleanupReaction?.();
    e.onCleanupReaction = undefined;
    dispose?.();
  };
}

// src/when.ts
function _when(predicate, effect, checkReady) {
  if (isPromise(predicate)) {
    return effect ? predicate.then(effect) : predicate;
  }
  const isPredicateArray = isArray(predicate);
  let value;
  let effectValue;
  function run(e) {
    const ret = isPredicateArray ? predicate.map((p) => computeSelector(p)) : computeSelector(predicate);
    if (isPromise(ret)) {
      value = ret;
      return;
    } else {
      let isOk = true;
      if (isArray(ret)) {
        for (let i = 0;i < ret.length; i++) {
          let item = ret[i];
          if (isObservable(item)) {
            item = computeSelector(item);
          } else if (isFunction(item)) {
            item = item();
          }
          isOk = isOk && !!(checkReady ? isObservableValueReady(item) : item);
        }
      } else {
        isOk = checkReady ? isObservableValueReady(ret) : ret;
      }
      if (isOk) {
        value = ret;
        e.cancel = true;
      }
    }
    return value;
  }
  function doEffect() {
    effectValue = effect?.(value);
  }
  observe(run, doEffect);
  if (isPromise(value)) {
    return effect ? value.then(effect) : value;
  } else if (value !== undefined) {
    return effect ? effectValue : Promise.resolve(value);
  } else {
    const promise = new Promise((resolve) => {
      if (effect) {
        const originalEffect = effect;
        effect = (value2) => {
          const effectValue2 = originalEffect(value2);
          resolve(isPromise(effectValue2) ? effectValue2.then((value3) => value3) : effectValue2);
        };
      } else {
        effect = resolve;
      }
    });
    return promise;
  }
}
function whenReady(predicate, effect) {
  return _when(predicate, effect, true);
}

// src/ObservableObject.ts
var ArrayModifiers = new Set([
  "copyWithin",
  "fill",
  "from",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift"
]);
var ArrayLoopers = new Set([
  "every",
  "filter",
  "find",
  "findIndex",
  "flatMap",
  "forEach",
  "join",
  "map",
  "reduce",
  "some"
]);
var ArrayLoopersReturn = new Set(["filter", "find"]);
var observableProperties = new Map;
var observableFns = new Map([
  ["get", get],
  ["set", set],
  ["peek", peek],
  ["onChange", onChange],
  ["assign", assign],
  ["delete", deleteFn],
  ["toggle", toggle]
]);
if (true) {
  __devUpdateNodes = new Set;
}
var __devUpdateNodes;
function collectionSetter(node, target, prop, ...args) {
  if (prop === "push" && args.length === 1) {
    setKey(node, target.length + "", args[0]);
  } else {
    const prevValue = target.slice();
    const ret = target[prop].apply(target, args);
    if (node) {
      const hasParent = isChildNode(node);
      const key = hasParent ? node.key : "_";
      const parentValue = hasParent ? getNodeValue(node.parent) : node.root;
      parentValue[key] = prevValue;
      setKey(node.parent ?? node, key, target);
    }
    return ret;
  }
}
function updateNodes(parent, obj, prevValue) {
  if (typeof __devUpdateNodes !== "undefined" && isObject(obj)) {
    if (__devUpdateNodes.has(obj)) {
      console.error("[legend-state] Circular reference detected in object. You may want to use opaqueObject to stop traversing child nodes.", obj);
      return false;
    }
    __devUpdateNodes.add(obj);
  }
  if (isObject(obj) && isHintOpaque(obj) || isObject(prevValue) && isHintOpaque(prevValue)) {
    const isDiff = obj !== prevValue;
    if (isDiff) {
      if (parent.listeners || parent.listenersImmediate) {
        notify(parent, obj, prevValue, 0);
      }
    }
    if (typeof __devUpdateNodes !== "undefined" && obj !== undefined) {
      __devUpdateNodes.delete(obj);
    }
    return isDiff;
  }
  const isArr = isArray(obj);
  let prevChildrenById;
  let moved;
  const isCurMap = isMap(obj);
  const isCurSet = isSet(obj);
  const isPrevMap = isMap(prevValue);
  const isPrevSet = isSet(prevValue);
  const keys = getKeys(obj, isArr, isCurMap, isCurSet);
  const keysPrev = getKeys(prevValue, isArr, isPrevMap, isPrevSet);
  const length = (keys || obj)?.length || 0;
  const lengthPrev = (keysPrev || prevValue)?.length || 0;
  let idField;
  let isIdFieldFunction;
  let hasADiff = false;
  let retValue;
  if (isArr && isArray(prevValue)) {
    if (prevValue.length > 0) {
      const firstPrevValue = prevValue[0];
      if (firstPrevValue !== undefined) {
        idField = findIDKey(firstPrevValue, parent);
        if (idField) {
          isIdFieldFunction = isFunction(idField);
          prevChildrenById = new Map;
          moved = [];
        }
        const keysSeen = new Set;
        if (parent.children) {
          for (let i = 0;i < prevValue.length; i++) {
            const p = prevValue[i];
            if (p) {
              const child = parent.children.get(i + "");
              if (child) {
                if (!obj[i]) {
                  handleDeletedChild(child, p);
                }
                if (idField) {
                  const key = isIdFieldFunction ? idField(p) : p[idField];
                  if (true) {
                    if (keysSeen.has(key)) {
                      console.warn(`[legend-state] Warning: Multiple elements in array have the same ID. Key field: ${idField}, Array:`, prevValue);
                    }
                    keysSeen.add(key);
                  }
                  prevChildrenById.set(key, child);
                }
              }
            }
          }
        }
      }
    }
  } else if (prevValue && (!obj || isObject(obj))) {
    const lengthPrev2 = keysPrev.length;
    for (let i = 0;i < lengthPrev2; i++) {
      const key = keysPrev[i];
      if (!keys.includes(key)) {
        hasADiff = true;
        const child = getChildNode(parent, key);
        const prev = isPrevMap ? prevValue.get(key) : prevValue[key];
        if (prev !== undefined) {
          handleDeletedChild(child, prev);
        }
      }
    }
  }
  if (obj && !isPrimitive(obj)) {
    hasADiff = hasADiff || length !== lengthPrev;
    const isArrDiff = hasADiff;
    let didMove = false;
    for (let i = 0;i < length; i++) {
      const key = isArr ? i + "" : keys[i];
      let value = isCurMap ? obj.get(key) : obj[key];
      const prev = isPrevMap ? prevValue?.get(key) : prevValue?.[key];
      let isDiff = !equals(value, prev);
      if (isDiff) {
        const id = idField && value ? isIdFieldFunction ? idField(value) : value[idField] : undefined;
        const existingChild = parent.children?.get(key);
        if (isObservable(value)) {
          const valueNode = getNode(value);
          if (existingChild?.linkedToNode === valueNode) {
            const targetValue = getNodeValue(valueNode);
            isCurMap ? obj.set(key, targetValue) : obj[key] = targetValue;
            continue;
          }
          const obs = value;
          value = () => obs;
        }
        let child = getChildNode(parent, key, value);
        if (!child.lazy && (isFunction(value) || isObservable(value))) {
          reactivateNode(child, value);
          peekInternal(child);
        }
        if (isArr && id !== undefined) {
          const prevChild = id !== undefined ? prevChildrenById?.get(id) : undefined;
          if (!prevChild) {
            hasADiff = true;
          } else if (prevChild !== undefined && prevChild.key !== key) {
            const valuePrevChild = prevValue[prevChild.key];
            if (isArrDiff) {
              child = prevChild;
              parent.children.delete(child.key);
              child.key = key;
              moved.push([key, child]);
            }
            didMove = true;
            isDiff = valuePrevChild !== value;
          }
        }
        if (isDiff) {
          if (isFunction(value) || isObservable(value)) {
            extractFunctionOrComputed(parent, key, value);
          } else if (isPrimitive(value)) {
            hasADiff = true;
          } else {
            const updatedNodes = updateNodes(child, value, prev);
            hasADiff = hasADiff || updatedNodes;
            isDiff = updatedNodes;
          }
        }
        if (isDiff || isArr && !isArrDiff) {
          if (child.listeners || child.listenersImmediate) {
            notify(child, value, prev, 0, !isArrDiff);
          }
        }
      }
    }
    if (moved) {
      for (let i = 0;i < moved.length; i++) {
        const [key, child] = moved[i];
        parent.children.set(key, child);
      }
    }
    retValue = hasADiff || didMove;
  } else if (prevValue !== undefined) {
    retValue = true;
  }
  if (typeof __devUpdateNodes !== "undefined" && obj !== undefined) {
    __devUpdateNodes.delete(obj);
  }
  return retValue ?? false;
}
function handleDeletedChild(child, p) {
  child.linkedToNodeDispose?.();
  child.activatedObserveDispose?.();
  if (!isPrimitive(p)) {
    updateNodes(child, undefined, p);
  }
  if (child.listeners || child.listenersImmediate) {
    notify(child, undefined, p, 0);
  }
}
function getProxy(node, p, asFunction) {
  if (p !== undefined)
    node = getChildNode(node, p, asFunction);
  return node.proxy || (node.proxy = new Proxy(node, proxyHandler));
}
function flushPending() {
  if (globalState.pendingNodes.size > 0) {
    const nodes = Array.from(globalState.pendingNodes.values());
    globalState.pendingNodes.clear();
    nodes.forEach((fn) => fn());
  }
}
var proxyHandler = {
  get(node, p, receiver) {
    if (p === symbolToPrimitive) {
      throw new Error("[legend-state] observable should not be used as a primitive. You may have forgotten to use .get() or .peek() to get the value of the observable.");
    }
    if (p === symbolGetNode) {
      return node;
    }
    if (p === "apply" || p === "call") {
      const nodeValue = getNodeValue(node);
      if (isFunction(nodeValue)) {
        return nodeValue[p];
      }
    }
    let value = peekInternal(node, p === "get" || p === "peek");
    if (p === symbolIterator) {
      return !value || isPrimitive(value) ? undefined : value[p];
    }
    const targetNode = node.linkedToNode || value?.[symbolGetNode];
    if (targetNode && p !== "onChange") {
      return proxyHandler.get(targetNode, p, receiver);
    }
    if (isMap(value) || isSet(value)) {
      const ret = handlerMapSet(node, p, value);
      if (ret !== undefined) {
        return ret;
      }
    }
    const fn = observableFns.get(p);
    if (fn) {
      if (p === "get" || p === "peek") {
        flushPending();
      }
      return function(a, b, c) {
        const l = arguments.length;
        switch (l) {
          case 0:
            return fn(node);
          case 1:
            return fn(node, a);
          case 2:
            return fn(node, a, b);
          default:
            return fn(node, a, b, c);
        }
      };
    }
    const property = observableProperties.get(p);
    if (property) {
      return property.get(node);
    }
    let vProp = value?.[p];
    if (isObject(value) && isHintOpaque(value)) {
      return vProp;
    }
    const fnOrComputed = node.functions?.get(p);
    if (fnOrComputed) {
      if (isObservable(fnOrComputed)) {
        return fnOrComputed;
      } else {
        return getProxy(node, p, fnOrComputed);
      }
    } else {
      vProp = checkProperty(value, p);
    }
    if (isNullOrUndefined(value) && vProp === undefined && (ArrayModifiers.has(p) || ArrayLoopers.has(p))) {
      value = [];
      setNodeValue(node, value);
      vProp = value[p];
    }
    if (isFunction(vProp)) {
      if (isArray(value)) {
        if (ArrayModifiers.has(p)) {
          return (...args) => collectionSetter(node, value, p, ...args);
        } else if (ArrayLoopers.has(p)) {
          updateTracking(node, true);
          return function(cbOrig, thisArg) {
            const isReduce = p === "reduce";
            const cbWrapped = isReduce ? (previousValue, currentValue, currentIndex, array) => {
              return cbOrig(previousValue, getProxy(node, currentIndex + "", currentValue), currentIndex, array);
            } : (val, index, array) => {
              return cbOrig(getProxy(node, index + "", val), index, array);
            };
            if (isReduce || !ArrayLoopersReturn.has(p)) {
              return value[p](cbWrapped, thisArg);
            }
            const isFind = p === "find";
            const out = [];
            for (let i = 0;i < value.length; i++) {
              if (cbWrapped(value[i], i, value)) {
                const proxy = getProxy(node, i + "");
                if (isFind) {
                  return proxy;
                }
                out.push(proxy);
              }
            }
            return isFind ? undefined : out;
          };
        }
      }
      extractFunctionOrComputed(node, p, vProp);
      const fnOrComputed2 = node.functions?.get(p);
      if (fnOrComputed2) {
        return getProxy(node, p, fnOrComputed2);
      }
      return vProp.bind(value);
    }
    if (isPrimitive(vProp)) {
      if (p === "length" && isArray(value)) {
        updateTracking(node, true);
        return vProp;
      }
    }
    return getProxy(node, p);
  },
  getPrototypeOf(node) {
    const value = getNodeValue(node);
    return value !== null && typeof value === "object" ? Reflect.getPrototypeOf(value) : null;
  },
  ownKeys(node) {
    peekInternal(node);
    const value = get(node, true);
    if (isPrimitive(value))
      return [];
    const keys = value ? Reflect.ownKeys(value) : [];
    if (isArray(value) && keys[keys.length - 1] === "length") {
      keys.splice(keys.length - 1, 1);
    }
    if (isFunction(node)) {
      const reflectedKeys = Reflect.ownKeys(node);
      ["caller", "arguments", "prototype"].forEach((key) => reflectedKeys.includes(key) && keys.push(key));
    }
    return keys;
  },
  getOwnPropertyDescriptor(node, prop) {
    if (prop === "caller" || prop === "arguments" || prop === "prototype") {
      return { configurable: false, enumerable: false };
    }
    const value = getNodeValue(node);
    return isPrimitive(value) ? undefined : Reflect.getOwnPropertyDescriptor(value, prop);
  },
  set(node, prop, value) {
    if (node.isSetting) {
      return Reflect.set(node, prop, value);
    }
    if (node.isAssigning) {
      setKey(node, prop, value);
      return true;
    }
    const property = observableProperties.get(prop);
    if (property) {
      property.set(node, value);
      return true;
    }
    if (true) {
      console.warn("[legend-state]: Error: Cannot set a value directly:", prop, value);
    }
    return false;
  },
  deleteProperty(node, prop) {
    if (node.isSetting) {
      return Reflect.deleteProperty(node, prop);
    } else {
      if (true) {
        console.warn("[legend-state]: Error: Cannot delete a value directly:", prop);
      }
      return false;
    }
  },
  has(node, prop) {
    const value = getNodeValue(node);
    return Reflect.has(value, prop);
  },
  apply(target, thisArg, argArray) {
    if (isObservable(thisArg)) {
      thisArg = thisArg.peek();
    }
    const fnRaw = getNodeValue(target);
    const fn = isFunction(fnRaw) ? fnRaw : target.lazyFn || target;
    return Reflect.apply(fn, thisArg, argArray);
  }
};
function set(node, newValue) {
  if (node.parent) {
    setKey(node.parent, node.key, newValue);
  } else {
    setKey(node, "_", newValue);
  }
}
function toggle(node) {
  const value = getNodeValue(node);
  if (value === undefined || value === null || isBoolean(value)) {
    set(node, !value);
  } else if (true) {
    throw new Error("[legend-state] Cannot toggle a non-boolean value");
  }
}
function setKey(node, key, newValue, level) {
  if (true) {
    if (typeof HTMLElement !== "undefined" && newValue instanceof HTMLElement) {
      console.warn(`[legend-state] Set an HTMLElement into state. You probably don't want to do that.`);
    }
  }
  const isRoot = !node.parent && key === "_";
  if (node.parent && !getNodeValue(node) && !isFunction(newValue)) {
    set(node, { [key]: newValue });
  }
  const childNode = isRoot ? node : getChildNode(node, key, newValue);
  if (isObservable(newValue)) {
    setToObservable(childNode, newValue);
  } else {
    const { newValue: savedValue, prevValue, parentValue } = setNodeValue(childNode, newValue);
    const isPrim = isPrimitive(prevValue) || prevValue instanceof Date || isPrimitive(savedValue) || savedValue instanceof Date;
    if (!isPrim) {
      let parent = childNode;
      do {
        parent.needsExtract = true;
        parent.recursivelyAutoActivated = false;
      } while (parent = parent.parent);
    }
    const notify2 = !equals(savedValue, prevValue);
    const forceNotify = !notify2 && childNode.isComputing && !isPrim;
    if (notify2 || forceNotify) {
      updateNodesAndNotify(node, savedValue, prevValue, childNode, parentValue, isPrim, isRoot, level, forceNotify);
    }
    extractFunctionOrComputed(node, key, savedValue);
  }
}
function assign(node, value) {
  const proxy = getProxy(node);
  beginBatch();
  if (isPrimitive(node.root._)) {
    node.root._ = {};
  }
  if (isMap(value)) {
    const currentValue = getNodeValue(node);
    if (isMap(currentValue)) {
      value.forEach((value2, key) => currentValue.set(key, value2));
    } else {
      set(node, value);
    }
  } else {
    node.isAssigning = (node.isAssigning || 0) + 1;
    try {
      Object.assign(proxy, value);
    } finally {
      node.isAssigning--;
    }
  }
  endBatch();
  return proxy;
}
function deleteFn(node, key) {
  if (key === undefined && isChildNode(node)) {
    key = node.key;
    node = node.parent;
  }
  const value = getNodeValue(node);
  if (isArray(value)) {
    collectionSetter(node, value, "splice", key, 1);
  } else {
    setKey(node, key ?? "_", symbolDelete, -1);
  }
}
function handlerMapSet(node, p, value) {
  const vProp = value?.[p];
  if (p === "size") {
    updateTracking(node, true);
    return value[p];
  } else if (isFunction(vProp)) {
    return function(a, b, c) {
      const l = arguments.length;
      const valueMapOrSet = value;
      if (p === "get") {
        if (l > 0 && typeof a !== "boolean" && a !== optimized) {
          return getProxy(node, a);
        }
      } else if (p === "set") {
        if (l === 2) {
          set(getChildNode(node, a), b);
        } else if (l === 1 && isMap(value)) {
          set(node, a);
        }
        return getProxy(node);
      } else if (p === "delete") {
        if (l > 0) {
          const prev = value.get ? valueMapOrSet.get(a) : a;
          deleteFn(node, a);
          return prev !== undefined;
        }
      } else if (p === "clear") {
        const prev = isSet(valueMapOrSet) ? new Set(valueMapOrSet) : new Map(valueMapOrSet);
        const size = valueMapOrSet.size;
        valueMapOrSet.clear();
        if (size) {
          updateNodesAndNotify(node, value, prev);
        }
        return;
      } else if (p === "add") {
        const prev = new Set(value);
        const ret = value.add(a);
        if (!value.has(p)) {
          notify(node, ret, prev, 0);
        }
        return getProxy(node);
      }
      const fn = observableFns.get(p);
      if (fn) {
        switch (l) {
          case 0:
            return fn(node);
          case 1:
            return fn(node, a);
          case 2:
            return fn(node, a, b);
          default:
            return fn(node, a, b, c);
        }
      } else {
        return value[p](a, b);
      }
    };
  }
}
function updateNodesAndNotify(node, newValue, prevValue, childNode, parentValue, isPrim, isRoot, level, forceNotify) {
  if (!childNode)
    childNode = node;
  beginBatch();
  if (isPrim === undefined) {
    isPrim = isPrimitive(newValue);
  }
  let hasADiff = forceNotify || isPrim;
  let whenOptimizedOnlyIf = false;
  let valueAsArr;
  let valueAsMap;
  if (!isPrim || prevValue && !isPrimitive(prevValue)) {
    if (typeof __devUpdateNodes !== "undefined") {
      __devUpdateNodes.clear();
    }
    hasADiff = hasADiff || updateNodes(childNode, newValue, prevValue);
    if (isArray(newValue)) {
      valueAsArr = newValue;
    } else if (isMap(newValue) || isSet(newValue)) {
      valueAsMap = newValue;
    }
  }
  if (isArray(parentValue)) {
    valueAsArr = parentValue;
  } else if (isMap(parentValue) || isSet(parentValue)) {
    valueAsMap = parentValue;
  }
  if (valueAsArr) {
    whenOptimizedOnlyIf = valueAsArr?.length !== prevValue?.length;
  } else if (valueAsMap) {
    whenOptimizedOnlyIf = valueAsMap?.size !== prevValue?.size;
  }
  if (isPrim || !newValue || isEmpty(newValue) && !isEmpty(prevValue) ? newValue !== prevValue : hasADiff) {
    notify(isPrim && isRoot ? node : childNode, newValue, prevValue, level ?? prevValue === undefined ? -1 : hasADiff ? 0 : 1, whenOptimizedOnlyIf);
  }
  endBatch();
}
function extractPromise(node, value, setter) {
  const numGets = node.numGets = (node.numGets || 0) + 1;
  if (!node.state) {
    node.state = createObservable({
      isLoaded: false
    }, false, extractPromise, getProxy);
  }
  value.then((value2) => {
    if (numGets >= (node.getNumResolved || 0)) {
      node.getNumResolved = node.numGets;
      setter ? setter({ value: value2 }) : set(node, value2);
      node.state.assign({
        isLoaded: true,
        error: undefined
      });
    }
  }).catch((error) => {
    node.state.error.set(error);
  });
}
function extractFunctionOrComputed(node, k, v) {
  if (isPromise(v)) {
    const childNode = getChildNode(node, k);
    extractPromise(childNode, v);
    setNodeValue(childNode, undefined);
    return;
  } else if (isObservable(v)) {
    const fn = () => v;
    extractFunction(node, k, fn);
    const childNode = getChildNode(node, k, fn);
    const targetNode = getNode(v);
    const initialValue = peek(targetNode);
    setToObservable(childNode, v);
    setNodeValue(childNode, initialValue);
    return getNodeValue(childNode);
  } else if (typeof v === "function") {
    extractFunction(node, k, v);
    return k;
  }
}
function get(node, options) {
  const track = options ? isObject(options) ? options.shallow : options : undefined;
  updateTracking(node, track);
  return peek(node);
}
function peek(node) {
  return peekInternal(node, true);
}
var isFlushing = false;
function peekInternal(node, activateRecursive) {
  isFlushing = true;
  if (activateRecursive && node.dirtyChildren?.size) {
    const dirty = Array.from(node.dirtyChildren);
    node.dirtyChildren.clear();
    dirty.forEach((node2) => node2.dirtyFn && peekInternal(node2));
  }
  if (node.dirtyFn) {
    const dirtyFn = node.dirtyFn;
    node.dirtyFn = undefined;
    globalState.dirtyNodes.delete(node);
    dirtyFn();
  }
  isFlushing = false;
  let value = getNodeValue(node);
  if (node.parent?.isPlain || isHintPlain(value)) {
    node.isPlain = true;
  }
  if (!node.root.isLoadingLocal && !node.isPlain) {
    value = checkLazy(node, value, !!activateRecursive);
  }
  return value;
}
function checkLazy(node, value, activateRecursive) {
  const origValue = value;
  const lazy = node.lazy;
  if (lazy) {
    const lazyFn = node.lazyFn;
    delete node.lazy;
    if (isFunction(lazyFn)) {
      if (lazyFn.length === 1) {
        value = {};
      } else {
        if (node.parent) {
          const parentValue = getNodeValue(node.parent);
          if (isFunction(value)) {
            if (parentValue) {
              delete parentValue[node.key];
            } else {
              node.root._ = undefined;
            }
          }
        }
        value = activateNodeFunction(node, lazyFn);
      }
    } else if (isObservable(value)) {
      value = extractFunctionOrComputed(node.parent, node.key, value);
    }
  }
  if ((lazy || node.needsExtract) && !isObservable(value) && !isPrimitive(value)) {
    if (activateRecursive) {
      recursivelyAutoActivate(value, node);
    }
    if (node.parent) {
      extractFunctionOrComputed(node.parent, node.key, origValue);
    }
  }
  return value;
}
function checkProperty(value, key) {
  if (value) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (property?.get) {
      delete value[key];
      value[key] = property.set ? linked({
        get: property.get,
        set: ({ value: value2 }) => property.set(value2)
      }) : property.get;
    }
    return value[key];
  }
}
function reactivateNode(node, lazyFn) {
  node.activatedObserveDispose?.();
  node.linkedToNodeDispose?.();
  node.activatedObserveDispose = node.linkedToNodeDispose = node.linkedToNode = undefined;
  node.lazyFn = lazyFn;
  node.lazy = true;
}
function isObserved(node) {
  let parent = node;
  let hasListeners = node.numListenersRecursive > 0;
  while (parent && !hasListeners) {
    if (!!parent.listeners?.size || !!parent.listenersImmediate?.size) {
      hasListeners = true;
    }
    parent = parent.parent;
  }
  return hasListeners;
}
function shouldIgnoreUnobserved(node, refreshFn) {
  if (!isFlushing) {
    const hasListeners = isObserved(node);
    if (!hasListeners) {
      if (refreshFn) {
        node.dirtyFn = refreshFn;
      }
      let parent = node;
      while (parent) {
        if (!parent.dirtyChildren) {
          parent.dirtyChildren = new Set;
        }
        parent.dirtyChildren.add(node);
        parent = parent.parent;
      }
      return true;
    }
  }
}
function activateNodeFunction(node, lazyFn) {
  let update;
  let wasPromise;
  let ignoreThisUpdate;
  let isFirst = true;
  const activateFn = lazyFn;
  let activatedValue;
  let disposes = [];
  let refreshFn;
  function markDirty() {
    node.dirtyFn = refreshFn;
    globalState.dirtyNodes.add(node);
  }
  node.activatedObserveDispose = observe(() => {
    if (isFirst) {
      isFirst = false;
      if (isFunction(getNodeValue(node))) {
        setNodeValue(node, undefined);
      }
    } else if (!isFlushing && refreshFn) {
      if (shouldIgnoreUnobserved(node, refreshFn)) {
        ignoreThisUpdate = true;
        return;
      }
    }
    let value = activateFn();
    let didSetToObs = false;
    const isObs = isObservable(value);
    if (isObs || node.linkedToNode) {
      didSetToObs = isObs;
      value = setToObservable(node, value);
    }
    if (isFunction(value) && value.length === 0) {
      value = value();
    }
    const activated = !isObs ? value?.[symbolLinked] : undefined;
    if (activated) {
      node.activationState = activated;
      value = undefined;
    }
    ignoreThisUpdate = false;
    wasPromise = isPromise(value);
    if (!node.activated) {
      node.activated = true;
      let activateNodeFn = activateNodeBase;
      if (activated?.synced) {
        activateNodeFn = globalState.activateSyncedNode;
        ignoreThisUpdate = true;
      }
      const result = activateNodeFn(node, value);
      update = result.update;
      let newValue = result.value;
      if (!didSetToObs && isObservable(newValue)) {
        newValue = setToObservable(node, newValue);
      }
      value = newValue ?? activated?.initial;
    } else if (node.activationState) {
      const activated2 = node.activationState;
      if (node.state?.peek()?.sync) {
        node.state.sync();
        ignoreThisUpdate = true;
      } else {
        value = activated2.get?.() ?? activated2.initial;
      }
    }
    if (ignoreThisUpdate) {
      activatedValue = value;
    }
    wasPromise = wasPromise || isPromise(value);
    return value;
  }, (e) => {
    const { value, nodes, refresh } = e;
    refreshFn = refresh;
    if (!ignoreThisUpdate) {
      if (!wasPromise || !globalState.isLoadingRemote) {
        if (wasPromise) {
          if (node.activationState) {
            const { initial } = node.activationState;
            if (value && isPromise(value)) {
              extractPromise(node, value, update);
            }
            if (isFunction(getNodeValue(node))) {
              setNodeValue(node, initial ?? undefined);
            }
          } else if (node.activated) {
            extractPromise(node, value, update);
            if (isFunction(getNodeValue(node))) {
              setNodeValue(node, undefined);
            }
          }
        } else {
          activatedValue = value;
          const isLoaded = node.state.isLoaded.peek();
          if (isLoaded || !isFunction(value)) {
            node.isComputing = true;
            set(node, value);
            node.isComputing = false;
          }
          if (!isLoaded) {
            node.state.assign({ isLoaded: true, error: undefined });
          }
        }
      }
      disposes.forEach((fn) => fn());
      disposes = [];
      nodes?.forEach(({ node: node2, track }) => {
        disposes.push(onChange(node2, markDirty, { immediate: true, trackingType: track }));
      });
    }
    e.cancel = true;
  }, { fromComputed: true });
  return activatedValue;
}
function activateNodeBase(node, value) {
  if (!node.state) {
    node.state = createObservable({
      isLoaded: false
    }, false, extractPromise, getProxy);
  }
  if (node.activationState) {
    const { set: setFn, get: getFn, initial } = node.activationState;
    value = getFn?.();
    if (value == undefined || value === null) {
      value = initial;
    }
    if (setFn) {
      let allChanges = [];
      let latestValue = undefined;
      let runNumber = 0;
      const runChanges = (listenerParams) => {
        if (allChanges.length > 0) {
          let changes;
          let value2;
          let isFromPersist = false;
          let isFromSync = false;
          let getPrevious;
          if (listenerParams) {
            changes = listenerParams.changes;
            value2 = listenerParams.value;
            isFromPersist = listenerParams.isFromPersist;
            isFromSync = listenerParams.isFromSync;
            getPrevious = listenerParams.getPrevious;
          } else {
            changes = allChanges;
            value2 = latestValue;
            getPrevious = createPreviousHandler(value2, changes);
          }
          allChanges = [];
          latestValue = undefined;
          globalState.pendingNodes.delete(node);
          runNumber++;
          const thisRunNumber = runNumber;
          const run = () => {
            if (thisRunNumber !== runNumber) {
              return;
            }
            node.isComputing = true;
            setFn({
              value: value2,
              changes,
              isFromPersist,
              isFromSync,
              getPrevious
            });
            node.isComputing = false;
          };
          whenReady(node.state.isLoaded, run);
        }
      };
      const onChangeImmediate = ({ value: value2, changes }) => {
        if (!node.isComputing) {
          if (changes.length > 1 || !isFunction(changes[0].prevAtPath)) {
            latestValue = value2;
            if (allChanges.length > 0) {
              changes = changes.filter((change) => !isArraySubset(allChanges[0].path, change.path));
            }
            allChanges.push(...changes);
            globalState.pendingNodes.set(node, runChanges);
          }
        }
      };
      onChange(node, onChangeImmediate, { immediate: true });
      onChange(node, runChanges);
    }
  }
  const update = ({ value: value2 }) => {
    if (!node.isComputing) {
      node.isComputing = true;
      set(node, value2);
      node.isComputing = false;
    }
  };
  return { update, value };
}
function setToObservable(node, value) {
  const linkedNode = value ? getNode(value) : undefined;
  if (linkedNode !== node && linkedNode?.linkedToNode !== node) {
    node.linkedToNode = linkedNode;
    node.linkedToNodeDispose?.();
    if (linkedNode) {
      linkedNode.linkedFromNodes ||= new Set;
      linkedNode.linkedFromNodes.add(node);
      node.linkedToNodeDispose = onChange(linkedNode, () => {
        value = peekInternal(linkedNode);
        if (!isFunction(value)) {
          set(node, value);
        }
      }, { initial: true }, new Set([node]));
    }
  }
  return value;
}
function recursivelyAutoActivate(obj, node) {
  if (!node.recursivelyAutoActivated && (isObject(obj) || isArray(obj)) && !isHintOpaque(obj)) {
    node.recursivelyAutoActivated = true;
    const pathStack = [];
    const getNodeAtPath2 = () => {
      let childNode = node;
      for (let i = 0;i < pathStack.length; i++) {
        const key = pathStack[i];
        const value = getNodeValue(childNode)?.[key];
        childNode = getChildNode(childNode, key, isFunction(value) ? value : undefined);
        peekInternal(childNode);
      }
      return childNode;
    };
    recursivelyAutoActivateInner(obj, pathStack, getNodeAtPath2);
  }
}
function recursivelyAutoActivateInner(obj, pathStack, getNodeAtPath2) {
  if ((isObject(obj) || isArray(obj)) && !isHintOpaque(obj) && !isHintPlain(obj)) {
    for (const key in obj) {
      if (hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (isObservable(value)) {
          const childNode = getNodeAtPath2();
          extractFunctionOrComputed(childNode, key, value);
          delete childNode.lazy;
        } else {
          const linkedOptions = isFunction(value) && value.prototype?.[symbolLinked];
          if (linkedOptions) {
            const activate = linkedOptions.activate;
            if (!activate || activate === "auto") {
              const childNode = getNodeAtPath2();
              peek(getChildNode(childNode, key, value));
            }
          }
        }
        if (typeof value === "object") {
          pathStack.push(key);
          recursivelyAutoActivateInner(value, pathStack, getNodeAtPath2);
          pathStack.pop();
        }
      }
    }
  }
}

// src/ObservablePrimitive.ts
var fns = ["get", "set", "peek", "onChange", "toggle"];
function ObservablePrimitiveClass(node) {
  this._node = node;
  for (let i = 0;i < fns.length; i++) {
    const key = fns[i];
    this[key] = this[key].bind(this);
  }
}
function proto(key, fn) {
  ObservablePrimitiveClass.prototype[key] = function(...args) {
    return fn.call(this, this._node, ...args);
  };
}
proto("peek", (node) => {
  flushPending();
  return peek(node);
});
proto("get", (node, options) => {
  flushPending();
  return get(node, options);
});
proto("set", set);
proto("onChange", onChange);
Object.defineProperty(ObservablePrimitiveClass.prototype, symbolGetNode, {
  configurable: true,
  get() {
    return this._node;
  }
});
ObservablePrimitiveClass.prototype.toggle = function() {
  const value = this.peek();
  if (value === undefined || value === null || isBoolean(value)) {
    this.set(!value);
  } else if (true) {
    throw new Error("[legend-state] Cannot toggle a non-boolean value");
  }
};
ObservablePrimitiveClass.prototype.delete = function() {
  this.set(undefined);
  return this;
};

// src/observable.ts
function observable(value) {
  return createObservable(value, false, extractPromise, getProxy, ObservablePrimitiveClass);
}
// bun/1.ts
var str = observable("light");
observe(() => {
  console.log(str.get());
});
str.set("dark");
