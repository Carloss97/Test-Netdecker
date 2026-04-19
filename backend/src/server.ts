process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception during startup:', err);
	process.exit(1);
});

process.on('unhandledRejection', (reason) => {
	console.error('Unhandled Rejection during startup:', reason);
	process.exit(1);
});

(async () => {
	try {
		const { startServer } = await import('./index.js');
		const port = process.env.PORT ? Number(process.env.PORT) : 3333;
		startServer(port);
	} catch (err) {
		console.error('Startup error (caught in server bootstrap):', err);
		process.exit(1);
	}
})();
