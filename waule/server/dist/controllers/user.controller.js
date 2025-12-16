"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmAvatarUpload = exports.getAvatarUploadUrl = exports.changePassword = exports.checkNickname = exports.uploadAvatar = exports.updateProfile = exports.getProfile = exports.avatarUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const oss_1 = require("../utils/oss");
const index_1 = require("../index");
// 配置头像上传
const avatarStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadDir = path_1.default.join(__dirname, '../../uploads/avatars');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        const filename = `${(0, crypto_1.randomUUID)()}${ext}`;
        cb(null, filename);
    },
});
exports.avatarUpload = (0, multer_1.default)({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('只支持 JPG、PNG、GIF 和 WebP 格式的图片'));
        }
    },
});
// 获取用户个人资料
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        // 🚀 尝试从缓存获取（30秒缓存，因为 credits 可能变化）
        const cacheKey = `user:profile:${userId}`;
        try {
            const cached = await index_1.redis.get(cacheKey);
            if (cached) {
                return res.json({ success: true, data: JSON.parse(cached) });
            }
        }
        catch { }
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                phone: true,
                email: true,
                username: true,
                nickname: true,
                avatar: true,
                role: true,
                credits: true,
                loginType: true,
                createdAt: true,
                lastLoginAt: true,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        // 🚀 缓存 30 秒
        try {
            await index_1.redis.set(cacheKey, JSON.stringify(user), 'EX', 30);
        }
        catch { }
        res.json({ success: true, data: user });
    }
    catch (error) {
        console.error('获取用户资料失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
};
exports.getProfile = getProfile;
// 更新用户个人资料
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { nickname } = req.body;
        if (!nickname || nickname.trim().length === 0) {
            return res.status(400).json({ success: false, message: '昵称不能为空' });
        }
        if (nickname.length > 20) {
            return res.status(400).json({ success: false, message: '昵称长度不能超过20个字符' });
        }
        // 检查昵称唯一性
        const existingUser = await index_1.prisma.user.findFirst({
            where: {
                nickname: nickname.trim(),
                NOT: { id: userId },
            },
        });
        if (existingUser) {
            return res.status(400).json({ success: false, message: '该昵称已被使用' });
        }
        // 更新用户资料
        const updatedUser = await index_1.prisma.user.update({
            where: { id: userId },
            data: { nickname: nickname.trim() },
            select: {
                id: true,
                phone: true,
                email: true,
                username: true,
                nickname: true,
                avatar: true,
                role: true,
                credits: true,
                loginType: true,
            },
        });
        // 🚀 清除用户资料缓存
        try {
            await index_1.redis.del(`user:profile:${userId}`);
        }
        catch { }
        res.json({ success: true, data: updatedUser, message: '资料更新成功' });
    }
    catch (error) {
        console.error('更新用户资料失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
};
exports.updateProfile = updateProfile;
// 上传头像
const uploadAvatar = async (req, res) => {
    try {
        const userId = req.user.id;
        const file = req.file;
        if (!file) {
            return res.status(400).json({ success: false, message: '请上传头像文件' });
        }
        // 上传到阿里云OSS
        let avatarUrl;
        try {
            avatarUrl = await (0, oss_1.uploadPath)(file.path);
            console.log('头像上传到OSS成功:', avatarUrl);
        }
        catch (ossError) {
            console.error('OSS上传失败:', ossError);
            // 删除临时文件
            if (fs_1.default.existsSync(file.path)) {
                try {
                    fs_1.default.unlinkSync(file.path);
                }
                catch { }
            }
            return res.status(500).json({ success: false, message: '头像上传失败: ' + ossError.message });
        }
        // 删除本地临时文件
        if (fs_1.default.existsSync(file.path)) {
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch (e) {
                console.warn('删除本地临时头像文件失败:', e);
            }
        }
        // 更新用户头像
        const updatedUser = await index_1.prisma.user.update({
            where: { id: userId },
            data: { avatar: avatarUrl },
            select: {
                id: true,
                phone: true,
                email: true,
                username: true,
                nickname: true,
                avatar: true,
                role: true,
                credits: true,
                loginType: true,
            },
        });
        res.json({ success: true, data: updatedUser, message: '头像上传成功' });
    }
    catch (error) {
        console.error('上传头像失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
};
exports.uploadAvatar = uploadAvatar;
// 检查昵称是否可用
const checkNickname = async (req, res) => {
    try {
        const userId = req.user.id;
        const { nickname } = req.query;
        if (!nickname || typeof nickname !== 'string') {
            return res.status(400).json({ success: false, message: '昵称参数无效' });
        }
        const existingUser = await index_1.prisma.user.findFirst({
            where: {
                nickname: nickname.trim(),
                NOT: { id: userId },
            },
        });
        res.json({
            success: true,
            available: !existingUser,
            message: existingUser ? '该昵称已被使用' : '昵称可用',
        });
    }
    catch (error) {
        console.error('检查昵称失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
};
exports.checkNickname = checkNickname;
// 修改密码（仅管理员/密码登录用户）
const changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        // 验证参数
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: '请输入当前密码和新密码' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: '新密码长度不能少于6位' });
        }
        // 获取用户信息
        const user = await index_1.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, password: true, loginType: true },
        });
        if (!user) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        // 验证是否为密码登录类型
        if (user.loginType !== 'ADMIN') {
            return res.status(403).json({ success: false, message: '当前账户类型不支持密码修改' });
        }
        // 验证当前密码
        if (!user.password) {
            return res.status(400).json({ success: false, message: '账户密码未设置' });
        }
        const isPasswordValid = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: '当前密码错误' });
        }
        // 加密新密码
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        // 更新密码
        await index_1.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });
        console.log(`用户 ${userId} 修改密码成功`);
        res.json({ success: true, message: '密码修改成功' });
    }
    catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
};
exports.changePassword = changePassword;
/**
 * 获取头像直传 OSS 的预签名 URL
 */
const getAvatarUploadUrl = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: '未授权' });
        }
        const { fileName, contentType } = req.body;
        if (!fileName || !contentType) {
            return res.status(400).json({ success: false, message: '缺少 fileName 或 contentType' });
        }
        // 验证是否是图片类型
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(contentType)) {
            return res.status(400).json({ success: false, message: '只支持 JPG、PNG、GIF 和 WebP 格式' });
        }
        const ext = path_1.default.extname(fileName) || '.jpg';
        const result = await (0, oss_1.generatePresignedUrl)(ext, contentType);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('获取头像上传地址失败:', error);
        res.status(500).json({ success: false, message: '获取上传地址失败' });
    }
};
exports.getAvatarUploadUrl = getAvatarUploadUrl;
/**
 * 确认头像直传完成，更新用户头像
 */
const confirmAvatarUpload = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: '未授权' });
        }
        const { publicUrl } = req.body;
        if (!publicUrl) {
            return res.status(400).json({ success: false, message: '缺少 publicUrl' });
        }
        // 更新用户头像
        const updatedUser = await index_1.prisma.user.update({
            where: { id: userId },
            data: { avatar: publicUrl },
            select: {
                id: true,
                phone: true,
                email: true,
                username: true,
                nickname: true,
                avatar: true,
                role: true,
                credits: true,
                loginType: true,
            },
        });
        res.json({ success: true, data: updatedUser, message: '头像更新成功' });
    }
    catch (error) {
        console.error('确认头像上传失败:', error);
        res.status(500).json({ success: false, message: '服务器错误' });
    }
};
exports.confirmAvatarUpload = confirmAvatarUpload;
//# sourceMappingURL=user.controller.js.map