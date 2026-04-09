import StoreServiceImpl from './StoreServiceImpl.js';

const StoreService = {
	createStore: StoreServiceImpl.createStore.bind(StoreServiceImpl),
	rotateApiKey: StoreServiceImpl.rotateApiKey.bind(StoreServiceImpl),
	// verifyApiKey has two semantics for backwards compatibility:
	//  - called with (apiKey, storedHash) -> synchronous boolean verifier
	//  - called with (apiKey) -> async resolver that returns the Store or null
	verifyApiKey: function (apiKey: string, storedHash?: string | null) {
		if (arguments.length > 1) {
			return StoreServiceImpl.verifyApiKey(apiKey, storedHash);
		}
		return StoreServiceImpl.findByApiKey(apiKey);
	},
	findByApiKey: StoreServiceImpl.findByApiKey.bind(StoreServiceImpl),
	getBySlug: StoreServiceImpl.getBySlug.bind(StoreServiceImpl),
	listStores: StoreServiceImpl.listStores.bind(StoreServiceImpl),
};

export default StoreService;
