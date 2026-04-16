import { expect } from 'vitest';
// Ensure global `expect` uses Vitest's implementation as early as possible.
// This minimizes runtime collisions where other libs (e.g., chai) inject
// a different `expect` implementation into the global scope.
(globalThis as any).expect = expect;

import '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
	cleanup();
});

// Try to import jest-dom matchers in a resilient way (support ESM/CJS).
// Some environments may expose the matchers as the module default or as named
// exports; handle both cases to avoid setup failures.
try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const matchersModule = await import('@testing-library/jest-dom/matchers').catch(() => undefined as any);
	const matchers = (matchersModule && ((matchersModule as any).default ?? matchersModule)) as any;
	if (matchers && typeof expect.extend === 'function') {
		expect.extend(matchers);
	}
} catch (err) {
	// If importing matchers fails, continue without throwing — tests may still
	// use DOM assertions via raw DOM properties.
}

// If `chai` is present, avoid test failures by adding small shim properties
// for commonly-used jest-dom assertions that tests may reference via Chai's
// assertion chain. This is defensive and small in scope.
void (async () => {
	try {
		const chai = await import('chai').catch(() => undefined as any);
		const Assertion = chai && (chai as any).Assertion;
		if (Assertion && typeof Assertion.addProperty === 'function') {
			const add = (name: string, fn: (this: any) => void) => {
				try {
					Assertion.addProperty(name, fn);
				} catch (e) {
					// ignore if already defined
				}
			};

			add('toBeInTheDocument', function (this: any) {
				const obj = this._obj;
				const inDocument = obj != null && (obj.ownerDocument ? obj.ownerDocument.contains(obj) : false);
				this.assert(inDocument, 'expected #{this} to be in the document', 'expected #{this} not to be in the document');
			});

			add('toBeDisabled', function (this: any) {
				const obj = this._obj as HTMLElement | null;
				const disabled = !!(obj && ('disabled' in obj ? (obj as any).disabled : false));
				this.assert(disabled, 'expected #{this} to be disabled', 'expected #{this} not to be disabled');
			});
		}
	} catch (e) {
		// ignore if chai isn't available
	}
})();

// Minimal debug info to ensure setup ran. Keep output small.
/* eslint-disable no-console */
console.log('TEST_SETUP: globalExpectIsVitest=', (globalThis as any).expect === expect);
/* eslint-enable no-console */
