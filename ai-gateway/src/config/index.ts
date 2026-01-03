import { getConfig, setConfig, getAllConfigs } from '../database';

export interface StorageConfig {
  oss?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    endpoint: string;
    cdnUrl: string;
  };
}

export interface GeminiProxyConfig {
  enabled: boolean;
  proxyUrl: string;
}

export function getStorageConfig(): StorageConfig {
  const bucket = getConfig('oss_bucket') || '';
  if (bucket) {
    return {
      oss: {
        bucket,
        region: getConfig('oss_region') || '',
        accessKeyId: getConfig('oss_access_key_id') || '',
        accessKeySecret: getConfig('oss_access_key_secret') || '',
        endpoint: getConfig('oss_endpoint') || '',
        cdnUrl: getConfig('oss_cdn_url') || '',
      }
    };
  }
  return {};
}

export function getGeminiProxyConfig(): GeminiProxyConfig {
  return {
    enabled: getConfig('gemini_proxy_enabled') === 'true',
    proxyUrl: getConfig('gemini_proxy_url') || 'socks5://127.0.0.1:40000',
  };
}

export function getApiSecret(): string {
  return getConfig('api_secret') || 'ai-gateway-secret';
}

export function getMidjourneyStorageType(): 'oss' | 'local' | 'forward' {
  const type = getConfig('midjourney_storage_type');
  if (type === 'oss' || type === 'local' || type === 'forward') {
    return type;
  }
  return 'oss'; // 默认使用 OSS
}

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: getConfig('admin_username') || 'admin',
    password: getConfig('admin_password') || 'admin'
  };
}

export { getConfig, setConfig, getAllConfigs };
