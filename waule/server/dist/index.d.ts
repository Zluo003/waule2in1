import { Application } from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
export declare const prisma: PrismaClient<{
    log: ("warn" | "error" | "query")[];
    datasources: {
        db: {
            url: string | undefined;
        };
    };
}, never, import("@prisma/client/runtime/library").DefaultArgs>;
export declare const redis: Redis;
declare const app: Application;
export declare const io: SocketIOServer<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
export declare function forceLogoutUser(userId: string, reason?: string): Promise<void>;
export default app;
//# sourceMappingURL=index.d.ts.map