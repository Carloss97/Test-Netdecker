import { ZodError } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env before anything else so loadConfig sees the variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

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
		const { loadConfig, redactDatabaseUrl } = await import('./utils/config.js');
		const config = loadConfig(process.env);
		console.info('[Boot] Config validated successfully');
		console.info(`[Boot] NODE_ENV=${config.NODE_ENV}`);
		console.info(`[Boot] DATABASE_URL=${redactDatabaseUrl(config.DATABASE_URL)}`);
		const { startServer } = await import('./index.js');
		const port = config.PORT;
		startServer(port);
	} catch (err) {
		if (err instanceof ZodError) {
			console.error('Startup error (caught in server bootstrap): Configuration error');
			for (const issue of err.issues) {
				console.error(`  - ${(issue.path || []).join('.') || '(root)'}: ${issue.message}`);
			}
		} else {
			console.error('Startup error (caught in server bootstrap):', err);
		}
		process.exit(1);
	}
})();
