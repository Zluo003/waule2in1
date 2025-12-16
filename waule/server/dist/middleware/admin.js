"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = void 0;
const errorHandler_1 = require("./errorHandler");
// 检查用户是否为管理员
const isAdmin = (req, res, next) => {
    if (!req.user) {
        return next(new errorHandler_1.AppError('未认证', 401));
    }
    if (req.user.role !== 'ADMIN') {
        return next(new errorHandler_1.AppError('需要管理员权限', 403));
    }
    next();
};
exports.isAdmin = isAdmin;
exports.default = exports.isAdmin;
//# sourceMappingURL=admin.js.map