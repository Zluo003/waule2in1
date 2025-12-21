import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import semver from 'semver';
import multer from 'multer';

const app = express();
const PORT = process.env.PORT || 3008;

// 阿里云 OSS 配置
const OSS_CONFIG = {
  enabled: process.env.OSS_ENABLED === 'true',
  bucket: process.env.OSS_BUCKET || 'waule-releases',
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  // 自定义域名或 OSS 默认域名
  baseUrl: process.env.OSS_BASE_URL || 'https://waule-releases.oss-cn-hangzhou.aliyuncs.com',
};

// 发布目录（存放元数据）
const RELEASES_DIR = path.join(__dirname, '../releases');

// 确保发布目录存在
if (!fs.existsSync(RELEASES_DIR)) {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务（提供下载）
app.use('/releases', express.static(RELEASES_DIR));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const appName = req.params.app;
    const version = req.params.version;
    const dir = path.join(RELEASES_DIR, appName, version);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage });

// 版本信息接口
interface FileInfo {
  filename: string;
  url?: string;
  sha512?: string;
  size?: number;
}

interface ReleaseInfo {
  version: string;
  releaseDate: string;
  releaseNotes?: string;
  mandatory?: boolean;
  files: FileInfo[];
}

// 生成文件下载 URL
function getFileUrl(appName: string, version: string, filename: string): string {
  if (OSS_CONFIG.enabled) {
    // 使用阿里云 OSS
    return `${OSS_CONFIG.baseUrl}/${appName}/${version}/${filename}`;
  }
  // 使用本地文件
  return `/releases/${appName}/${version}/${filename}`;
}

// 获取应用最新版本信息
function getLatestRelease(appName: string): ReleaseInfo | null {
  const appDir = path.join(RELEASES_DIR, appName);
  if (!fs.existsSync(appDir)) {
    return null;
  }

  const versions = fs.readdirSync(appDir)
    .filter((v: string) => semver.valid(v))
    .sort((a: string, b: string) => semver.rcompare(a, b));

  if (versions.length === 0) {
    return null;
  }

  const latestVersion = versions[0];
  const versionDir = path.join(appDir, latestVersion);
  const infoFile = path.join(versionDir, 'release.json');

  // 读取版本信息（包含 OSS 文件信息）
  let releaseInfo: any = {};
  if (fs.existsSync(infoFile)) {
    releaseInfo = JSON.parse(fs.readFileSync(infoFile, 'utf-8'));
  }

  // 如果 release.json 中已有文件列表（OSS 模式），直接使用
  if (releaseInfo.files && releaseInfo.files.length > 0) {
    return {
      version: latestVersion,
      releaseDate: releaseInfo.releaseDate || new Date().toISOString(),
      releaseNotes: releaseInfo.releaseNotes,
      mandatory: releaseInfo.mandatory,
      files: releaseInfo.files.map((f: FileInfo) => ({
        ...f,
        url: f.url || getFileUrl(appName, latestVersion, f.filename),
      })),
    };
  }

  // 否则扫描本地文件
  const localFiles = fs.readdirSync(versionDir)
    .filter((f: string) => f.endsWith('.exe') || f.endsWith('.dmg') || f.endsWith('.AppImage') || f.endsWith('.blockmap'))
    .map((f: string) => {
      const filePath = path.join(versionDir, f);
      const stats = fs.statSync(filePath);
      return {
        filename: f,
        url: getFileUrl(appName, latestVersion, f),
        size: stats.size,
      };
    });

  return {
    version: latestVersion,
    releaseDate: releaseInfo.releaseDate || new Date().toISOString(),
    releaseNotes: releaseInfo.releaseNotes,
    mandatory: releaseInfo.mandatory,
    files: localFiles,
  };
}

// ============ API 路由 ============

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取最新版本信息（electron-updater 格式）
app.get('/update/:app/:platform/:arch', (req, res) => {
  const { app: appName, platform, arch } = req.params;
  const currentVersion = req.query.version as string;

  console.log(`[Update] 检查更新: ${appName} ${platform}/${arch}, 当前版本: ${currentVersion}`);

  const release = getLatestRelease(appName);
  if (!release) {
    return res.status(404).json({ error: '没有可用的版本' });
  }

  // 检查是否需要更新
  if (currentVersion && semver.gte(currentVersion, release.version)) {
    return res.status(204).send(); // 已是最新版本
  }

  // 根据平台过滤文件
  const platformFiles = release.files.filter(f => {
    const name = f.filename || f.url || '';
    if (platform === 'win32') return name.endsWith('.exe') || name.endsWith('.blockmap');
    if (platform === 'darwin') return name.endsWith('.dmg') || name.endsWith('.zip');
    if (platform === 'linux') return name.endsWith('.AppImage');
    return false;
  });

  // electron-updater 格式响应
  const mainFile = platformFiles.find(f => {
    const name = f.filename || f.url || '';
    return name.endsWith('.exe') || name.endsWith('.dmg') || name.endsWith('.AppImage');
  });

  const updateInfo = {
    version: release.version,
    releaseDate: release.releaseDate,
    releaseNotes: release.releaseNotes,
    path: mainFile?.url,
    files: platformFiles,
  };

  console.log(`[Update] 发现新版本: ${release.version}`);
  res.json(updateInfo);
});

// 获取 latest.yml (electron-updater 标准格式)
app.get('/update/:app/latest.yml', (req, res) => {
  const { app: appName } = req.params;
  const release = getLatestRelease(appName);

  if (!release) {
    return res.status(404).send('Not Found');
  }

  const exeFile = release.files.find(f => {
    const name = f.filename || f.url || '';
    return name.endsWith('.exe') && !name.includes('blockmap');
  });
  if (!exeFile || !exeFile.url) {
    return res.status(404).send('No installer found');
  }

  // 生成 YAML 格式
  const yaml = `version: ${release.version}
releaseDate: '${release.releaseDate}'
path: ${path.basename(exeFile.url)}
sha512: ${exeFile.sha512 || ''}
size: ${exeFile.size || 0}
`;

  res.type('text/yaml').send(yaml);
});

// 获取 latest-mac.yml
app.get('/update/:app/latest-mac.yml', (req, res) => {
  const { app: appName } = req.params;
  const release = getLatestRelease(appName);

  if (!release) {
    return res.status(404).send('Not Found');
  }

  const dmgFile = release.files.find(f => {
    const name = f.filename || f.url || '';
    return name.endsWith('.dmg');
  });
  if (!dmgFile || !dmgFile.url) {
    return res.status(404).send('No DMG found');
  }

  const yaml = `version: ${release.version}
releaseDate: '${release.releaseDate}'
path: ${path.basename(dmgFile.url)}
sha512: ${dmgFile.sha512 || ''}
size: ${dmgFile.size || 0}
`;

  res.type('text/yaml').send(yaml);
});

// 上传新版本
app.post('/upload/:app/:version', upload.array('files'), (req, res) => {
  const { app: appName, version } = req.params;
  const { releaseNotes, mandatory } = req.body;

  if (!semver.valid(version)) {
    return res.status(400).json({ error: '无效的版本号' });
  }

  // 保存版本信息
  const versionDir = path.join(RELEASES_DIR, appName, version);
  const infoFile = path.join(versionDir, 'release.json');
  
  fs.writeFileSync(infoFile, JSON.stringify({
    version,
    releaseDate: new Date().toISOString(),
    releaseNotes,
    mandatory: mandatory === 'true',
  }, null, 2));

  console.log(`[Upload] 新版本已上传: ${appName} v${version}`);
  res.json({ success: true, version, app: appName });
});

// 列出所有版本
app.get('/versions/:app', (req, res) => {
  const { app: appName } = req.params;
  const appDir = path.join(RELEASES_DIR, appName);

  if (!fs.existsSync(appDir)) {
    return res.json({ versions: [] });
  }

  const versions = fs.readdirSync(appDir)
    .filter(v => semver.valid(v))
    .sort((a, b) => semver.rcompare(a, b))
    .map(v => {
      const infoFile = path.join(appDir, v, 'release.json');
      let info: any = { version: v };
      if (fs.existsSync(infoFile)) {
        info = { ...info, ...JSON.parse(fs.readFileSync(infoFile, 'utf-8')) };
      }
      return info;
    });

  res.json({ versions });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`[Update Server] 运行在 http://localhost:${PORT}`);
  console.log(`[Update Server] 发布目录: ${RELEASES_DIR}`);
});
