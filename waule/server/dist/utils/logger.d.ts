import winston from 'winston';
import { Request, Response, NextFunction } from 'express';
export declare const logger: winston.Logger;
export declare const httpLogger: (req: Request, res: Response, next: NextFunction) => void;
export default logger;
//# sourceMappingURL=logger.d.ts.map