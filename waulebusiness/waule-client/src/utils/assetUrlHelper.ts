/**
 * 资产 URL 辅助工具
 * 处理本地租户服务器 URL 转换
 */
import { useTenantStorageStore } from '../store/tenantStorageStore';

/**
 * 检测并转换本地服务器 URL
 * 将存储时使用的服务器地址转换为当前配置的服务器地址
 * 
 * @param url 原始 URL
 * @returns 转换后的 URL
 */
export function transformLocalServerUrl(url: string | undefined): string {
  if (!url) return '';
  
  // 获取当前配置的本地服务器地址
  const { config } = useTenantStorageStore.getState();
  const localServerUrl = config.localServerUrl;
  
  console.log('[assetUrlHelper] 原始URL:', url);
  console.log('[assetUrlHelper] localServerUrl配置:', localServerUrl);
  
  if (!localServerUrl) {
    console.log('[assetUrlHelper] 未配置本地服务器，返回原URL');
    return url;
  }
  
  // 检查是否是租户本地服务器 URL（格式：http://IP:PORT/files/...）
  const localServerPattern = /^https?:\/\/[\d.]+:\d+\/files\/(.+)$/;
  const match = url.match(localServerPattern);
  
  if (match) {
    // 使用当前配置的服务器地址重构 URL
    const relativePath = match[1];
    const newUrl = `${localServerUrl}/files/${relativePath}`;
    console.log('[assetUrlHelper] 转换后URL:', newUrl);
    return newUrl;
  }
  
  // 也检查 localhost 格式
  const localhostPattern = /^https?:\/\/localhost:\d+\/files\/(.+)$/;
  const localhostMatch = url.match(localhostPattern);
  
  if (localhostMatch) {
    const relativePath = localhostMatch[1];
    const newUrl = `${localServerUrl}/files/${relativePath}`;
    console.log('[assetUrlHelper] localhost转换后URL:', newUrl);
    return newUrl;
  }
  
  console.log('[assetUrlHelper] URL不匹配本地服务器格式，返回原URL');
  return url;
}

/**
 * React Hook 版本的 URL 转换
 * 用于需要响应 localServerUrl 变化的组件
 */
export function useTransformLocalServerUrl() {
  const localServerUrl = useTenantStorageStore((state) => state.config.localServerUrl);
  
  return (url: string | undefined): string => {
    if (!url) return '';
    
    if (!localServerUrl) {
      return url;
    }
    
    // 检查是否是租户本地服务器 URL
    const localServerPattern = /^https?:\/\/[\d.]+:\d+\/files\/(.+)$/;
    const match = url.match(localServerPattern);
    
    if (match) {
      const relativePath = match[1];
      return `${localServerUrl}/files/${relativePath}`;
    }
    
    // 也检查 localhost 格式
    const localhostPattern = /^https?:\/\/localhost:\d+\/files\/(.+)$/;
    const localhostMatch = url.match(localhostPattern);
    
    if (localhostMatch) {
      const relativePath = localhostMatch[1];
      return `${localServerUrl}/files/${relativePath}`;
    }
    
    return url;
  };
}
