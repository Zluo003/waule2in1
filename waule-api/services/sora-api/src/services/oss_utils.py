"""
OSS 上传工具模块
通过调用 node-gateway 内部接口上传到阿里云 OSS
"""
import os
import aiohttp
from typing import Optional

# node-gateway 内部接口地址
NODE_GATEWAY_URL = os.getenv("NODE_GATEWAY_URL", "http://localhost:9000")


async def download_and_upload_to_oss(url: str, ext: str = ".png", prefix: str = "sora", file_type: str = "image") -> Optional[str]:
    """
    通过 node-gateway 内部接口上传到 OSS
    
    Args:
        url: 源文件 URL
        ext: 文件扩展名（未使用，由 node-gateway 自动处理）
        prefix: OSS 路径前缀（未使用，由 node-gateway 自动处理）
        file_type: 文件类型，'image' 或 'video'
        
    Returns:
        OSS URL 或原始 URL（如果失败）
    """
    try:
        print(f"[OSS] 调用 node-gateway 上传: {url[:80]}... type={file_type}")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{NODE_GATEWAY_URL}/internal/oss/upload-from-url",
                json={"url": url, "type": file_type},
                timeout=aiohttp.ClientTimeout(total=120)
            ) as response:
                if response.status != 200:
                    text = await response.text()
                    print(f"[OSS] node-gateway 上传失败: {response.status} - {text}")
                    return url
                
                result = await response.json()
                if result.get("success") and result.get("url"):
                    print(f"[OSS] 上传成功: {result['url']}")
                    return result["url"]
                else:
                    print(f"[OSS] 上传失败: {result}")
                    return url
                
    except Exception as e:
        print(f"[OSS] 上传异常: {e}")
        return url
