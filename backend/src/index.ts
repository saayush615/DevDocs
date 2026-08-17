import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { toNodeHandler } from "better-auth/node";
import { auth } from './lib/auth.js';

const app: Express = express();
const port = 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);

app.all("/api/auth/*splat", toNodeHandler(auth)); // better auth route

app.use(express.json());

app.get('/', (_req: Request, res: Response) => {
  res.send('Welcome to DevDocs');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});