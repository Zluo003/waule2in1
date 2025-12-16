"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const translation_controller_1 = require("../controllers/translation.controller");
const router = express_1.default.Router();
/**
 * POST /api/translation/translate
 * 翻译文本
 */
router.post('/translate', translation_controller_1.translateText);
/**
 * POST /api/translation/smart-translate
 * 智能翻译（自动检测语言，如果不是英文则翻译）
 */
router.post('/smart-translate', translation_controller_1.smartTranslate);
/**
 * POST /api/translation/detect
 * 检测语言
 */
router.post('/detect', translation_controller_1.detectLanguage);
exports.default = router;
//# sourceMappingURL=translation.routes.js.map