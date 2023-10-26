import { mockLocalStorage, promiseTimeout } from './testglobals';
import { persistObservable } from '../src/persist/persistObservable';
import { run } from './computedtests';
import { observable } from '../src/observable';
import { ObservablePersistLocalStorage } from '../src/persist-plugins/local-storage';
import { when } from '../src/when';
import type { ComputedParams } from '../src/observableInterfaces';

persistObservable({} as any, {
    pluginRemote: {
        get() {
            return Promise.resolve({ test: 'hi' });
        },
    },
});

run(true);

mockLocalStorage();

describe('caching with new computed', () => {
    test('cache basic', async () => {
        localStorage.setItem('nodes', JSON.stringify({ key0: { key: 'key0' } }));
        const nodes = observable(async ({ cache }: ComputedParams) => {
            cache(() => ({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'nodes',
            }));
            const nodes = await new Promise<{ key: string }[]>((resolve) =>
                setTimeout(() => resolve([{ key: 'key0' }]), 10),
            );
            return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                acc[node.key] = node;
                return acc;
            }, {});
        });

        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        // @ts-expect-error Fix types to solve this - Record clobbers specific types
        await when(nodes._state.isLoadedLocal);
        // @ts-expect-error Fix types to solve this - Record clobbers specific types
        await when(nodes._state.isLoaded);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });
    });
});

describe('dateModified with new computed', () => {
    test('dateModified from updateLastSync', async () => {
        const nodes = observable(async ({ cache, updateLastSync }: ComputedParams) => {
            cache(() => ({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'nodes-dateModified',
            }));
            const nodes = await new Promise<{ key: string }[]>((resolve) =>
                setTimeout(() => resolve([{ key: 'key0' }]), 10),
            );
            updateLastSync(1000);
            return nodes.reduce((acc: Record<string, { key: string }>, node) => {
                acc[node.key] = node;
                return acc;
            }, {});
        });

        expect(nodes.get()).toEqual(undefined);

        // @ts-expect-error Fix types to solve this - Record clobbers specific types
        await when(nodes._state.isLoadedLocal);
        // @ts-expect-error Fix types to solve this - Record clobbers specific types
        await when(nodes._state.isLoaded);
        expect(nodes.get()).toEqual({ key0: { key: 'key0' } });

        await promiseTimeout(30);
        expect(localStorage.getItem('nodes-dateModified')).toEqual(JSON.stringify({ key0: { key: 'key0' } }));
        expect(localStorage.getItem('nodes-dateModified__m')).toEqual(JSON.stringify({ modified: 1000 }));
    });
    test('dateModified from subscribe', async () => {
        const value = observable(async ({ cache, subscribe }: ComputedParams) => {
            cache(() => ({
                pluginLocal: ObservablePersistLocalStorage,
                local: 'dateModified2',
            }));
            subscribe(({ update }) => {
                setTimeout(() => {
                    update({ value: 'test', dateModified: 1000 });
                }, 0);
            });
            return new Promise<string>((resolve) => setTimeout(() => resolve('test'), 1));
        });

        expect(value.get()).toEqual(undefined);

        await promiseTimeout(50);
        expect(value.get()).toEqual('test');
        expect(localStorage.getItem('dateModified2__m')).toEqual(JSON.stringify({ modified: 1000 }));
    });
});
