import { vi } from "vitest";

// Keep the reference repositories' small in-memory Chrome API test convention.
export function tab(id: number, overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
	return { id, index: id, windowId: 1, groupId: -1, active: false, pinned: false,
		discarded: false, frozen: false, autoDiscardable: true, highlighted: false, selected: false, incognito: false,
		url: `https://example.com/${id}`, title: `Tab ${id}`, status: "complete", ...overrides };
}

export function event() {
	const listeners: ((...args: unknown[]) => unknown)[] = [];
	return {
		listeners,
		addListener: vi.fn((listener: (...args: unknown[]) => unknown) => listeners.push(listener)),
		emit: (...args: unknown[]) => listeners.map((listener) => listener(...args)),
	};
}

export function createMockChrome(initial: chrome.tabs.Tab[] = [], initialStorage: Record<string, unknown> = {}) {
	const tabs = initial.map((item) => ({ ...item }));
	const groups: chrome.tabGroups.TabGroup[] = [];
	const storage = structuredClone(initialStorage);
	const storageChanged = event();
	const get = (id: number) => {
		const value = tabs.find((item) => item.id === id);
		if (!value) throw new Error(`No tab with id: ${id}`);
		return value;
	};
	const mock = {
		storage: { local: {
			get: vi.fn(async (key: string) => structuredClone({ [key]: storage[key] })),
			set: vi.fn(async (values: Record<string, unknown>) => {
				const changes: Record<string, chrome.storage.StorageChange> = {};
				for (const [key, value] of Object.entries(values)) {
					changes[key] = { oldValue: structuredClone(storage[key]), newValue: structuredClone(value) };
					storage[key] = structuredClone(value);
				}
				storageChanged.emit(changes);
			}),
			onChanged: storageChanged,
		} },
		runtime: {
			id: "test-id", lastError: undefined as { message: string } | undefined,
			getURL: (path: string) => `chrome-extension://test-id/${path}`,
			onInstalled: event(), onStartup: event(), onMessage: event(),
			sendMessage: vi.fn().mockResolvedValue({ suspended: 1, skipped: 0, failed: 0, errors: [] }),
		},
		tabs: {
			getCurrent: vi.fn(async () => tabs.find((item) => item.active)),
			get: vi.fn(async (id: number) => ({ ...get(id) })),
			query: vi.fn(async (query: chrome.tabs.QueryInfo) => tabs.filter((item) =>
				(query.windowId === undefined || query.windowId === item.windowId) &&
				(query.groupId === undefined || query.groupId === item.groupId) &&
				(query.highlighted === undefined || query.highlighted === item.highlighted)).map((item) => ({ ...item }))),
			update: vi.fn(async (id: number, props: chrome.tabs.UpdateProperties) => {
				const target = get(id);
				if (props.active) {
					for (const item of tabs) if (item.windowId === target.windowId) item.active = item.id === id;
					target.discarded = false;
				}
				if (props.url) { target.url = props.url; target.discarded = false; }
				return { ...target };
			}),
			discard: vi.fn(async (id: number) => {
				const target = get(id);
				if (target.active) throw new Error("Cannot discard an active tab");
				target.discarded = true;
				return { ...target };
			}),
			onCreated: event(), onUpdated: event(), onRemoved: event(), onActivated: event(),
			onMoved: event(), onAttached: event(), onDetached: event(), onReplaced: event(),
		},
		tabGroups: { query: vi.fn(async () => [...groups]), onCreated: event(), onUpdated: event(), onRemoved: event() },
		windows: { getCurrent: vi.fn(async () => ({ id: 1 })), update: vi.fn().mockResolvedValue({}) },
		contextMenus: {
			ContextType: { PAGE: "page" },
			removeAll: vi.fn().mockResolvedValue(undefined),
			create: vi.fn((_options: unknown, callback: () => void) => callback()), onClicked: event(),
		},
		action: { setBadgeText: vi.fn().mockResolvedValue(undefined), setTitle: vi.fn().mockResolvedValue(undefined) },
	};
	vi.stubGlobal("chrome", mock);
	return { mock, tabs, groups, storage };
}
