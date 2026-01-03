import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import routes from './routes';

const app = express();

// 中间件
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// 静态文件
app.use('/uploads', express.static(path.join(__dirname, '../data/uploads')));
app.use(express.static(path.join(__dirname, '../static')));

// 路由
app.use(routes);

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'ai-gateway', timestamp: new Date().toISOString() });
});

// 页面路由
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../static/login.html'));
});

app.get('/manage', (req, res) => {
  res.sendFile(path.join(__dirname, '../static/manage.html'));
});

app.get('/', (req, res) => {
  res.redirect('/login');
});

export default app;
