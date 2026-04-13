import { startServer } from './index.js';

const port = process.env.PORT ? Number(process.env.PORT) : 3333;
startServer(port);
