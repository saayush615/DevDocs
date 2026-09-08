// Auth guard: every private route uses this. Reads the better-auth
// session cookie, rejects strangers with 401, attaches userId for the route.
import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from "../lib/auth.js";

// Extends express Request so routes get req.userId with typesafety.
export interface AuthRequest extends Request {
    userId: string;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    // fromNodeHeaders converts Express headers to what better-auth expects.
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers)});

    if(!session?.user){
        res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
        return;
    }
    // User is loggedin - stash id for the route handler.
    (req as AuthRequest).userId = session.user.id;
    next();
}