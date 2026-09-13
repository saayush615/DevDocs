import 'dotenv/config';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './lib/auth.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import { documentsRouter } from './routes/documents.route.js';
import { conversationsRouter } from './routes/conversations.route.js';
import { chatRouter } from './routes/chat.route.js';

const app: Express = express();
const port = 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);

app.all('/api/auth/*splat', toNodeHandler(auth)); // better auth route

app.use(express.json());

app.get('/api', (_req: Request, res: Response) => {
  res.send('Welcome to DevDocs');
});

app.use('/api/document', documentsRouter);
app.use('/api/conversation', conversationsRouter);
app.use('/api/chat', chatRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
