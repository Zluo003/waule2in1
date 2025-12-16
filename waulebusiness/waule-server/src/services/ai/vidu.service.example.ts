/**
 * Vidu Q2 图生视频服务使用示例
 * 
 * 使用前请确保在管理后台配置了 Vidu 模型:
 * - Provider: vidu
 * - API Key: your_api_key_here
 * - API URL: https://api.vidu.cn (可选)
 * 
 * 注意：以下示例需要从管理后台获取 apiKey 和 apiUrl 后才能运行
 */

import { imageToVideo, queryTaskStatus, cancelTask } from './vidu.service';

/**
 * 示例 1: 基础图生视频
 */
async function example1_BasicImageToVideo() {
  console.log('\n=== 示例 1: 基础图生视频 ===');
  
  try {
    const videoUrl = await imageToVideo({
      images: ['https://prod-ss-images.s3.cn-northwest-1.amazonaws.com.cn/vidu-maas/template/image2video.png'],
      prompt: 'The astronaut waved and the camera moved up.',
      model: 'viduq2-pro',
      duration: 5,
      resolution: '1080p',
      movement_amplitude: 'auto',
    });
    
    console.log('✅ 视频生成成功！');
    console.log('视频URL:', videoUrl);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
  }
}

/**
 * 示例 2: 使用本地图片（自动转base64）
 */
async function example2_LocalImage() {
  console.log('\n=== 示例 2: 使用本地图片 ===');
  
  try {
    const videoUrl = await imageToVideo({
      images: ['http://localhost:3000/uploads/test-image.jpg'],  // 本地图片自动转base64
      prompt: 'A beautiful landscape with gentle camera movement.',
      model: 'viduq2-turbo',
      duration: 8,
      resolution: '720p',
      movement_amplitude: 'medium',
    });
    
    console.log('✅ 视频生成成功！');
    console.log('视频URL:', videoUrl);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
  }
}

/**
 * 示例 3: 音视频直出（带音频）
 */
async function example3_WithAudio() {
  console.log('\n=== 示例 3: 音视频直出 ===');
  
  try {
    const videoUrl = await imageToVideo({
      images: ['https://example.com/portrait.jpg'],
      prompt: 'A person talking about the weather forecast.',
      model: 'viduq2-pro',
      audio: true,  // 启用音频
      voice_id: 'professional_host',  // 专业主持人音色
      duration: 5,
      resolution: '1080p',
    });
    
    console.log('✅ 带音频的视频生成成功！');
    console.log('视频URL:', videoUrl);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
  }
}

/**
 * 示例 4: 使用推荐提示词
 */
async function example4_RecommendedPrompt() {
  console.log('\n=== 示例 4: 使用推荐提示词 ===');
  
  try {
    const videoUrl = await imageToVideo({
      images: ['https://example.com/landscape.jpg'],
      model: 'viduq2-pro',
      is_rec: true,  // 使用系统推荐提示词（额外消耗10积分）
      duration: 5,
      resolution: '720p',
    });
    
    console.log('✅ 视频生成成功（使用推荐提示词）！');
    console.log('视频URL:', videoUrl);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
  }
}

/**
 * 示例 5: 错峰模式（节省积分）
 */
async function example5_OffPeakMode() {
  console.log('\n=== 示例 5: 错峰模式 ===');
  
  try {
    const videoUrl = await imageToVideo({
      images: ['https://example.com/image.jpg'],
      prompt: 'Slow motion cinematic scene.',
      model: 'viduq2-turbo',
      duration: 5,
      resolution: '720p',
      off_peak: true,  // 错峰模式，48小时内完成，积分消耗更低
    });
    
    console.log('✅ 视频已提交到错峰队列！');
    console.log('视频URL:', videoUrl);
  } catch (error: any) {
    console.error('❌ 提交失败:', error.message);
  }
}

/**
 * 示例 6: 高级配置（完整参数）
 */
async function example6_AdvancedConfig() {
  console.log('\n=== 示例 6: 高级配置 ===');
  
  try {
    const videoUrl = await imageToVideo({
      images: ['https://example.com/image.jpg'],
      prompt: 'Epic cinematic scene with dramatic camera movement.',
      model: 'viduq2-pro',
      duration: 10,  // 最长10秒（仅viduq2-pro和viduq2-turbo支持）
      resolution: '1080p',
      movement_amplitude: 'large',  // 大幅度运动
      seed: 12345,  // 固定随机种子，保证结果可复现
      watermark: true,  // 添加水印
      wm_position: 4,  // 水印位置：左下角
      payload: JSON.stringify({ user_id: '123', project_id: 'abc' }),  // 透传参数
      meta_data: JSON.stringify({
        Label: 'test_video',
        ContentProducer: 'your_company',
        ProduceID: 'prod_001',
      }),
    });
    
    console.log('✅ 视频生成成功（高级配置）！');
    console.log('视频URL:', videoUrl);
  } catch (error: any) {
    console.error('❌ 生成失败:', error.message);
  }
}

/**
 * 示例 7: 查询任务状态
 */
async function example7_QueryTaskStatus() {
  console.log('\n=== 示例 7: 查询任务状态 ===');
  
  const taskId = 'your_task_id_here';  // 替换为实际的任务ID
  const apiKey = 'your_api_key_here';  // 从管理后台获取
  
  try {
    const taskStatus = await queryTaskStatus(taskId, apiKey);
    
    console.log('任务ID:', taskStatus.task_id);
    console.log('任务状态:', taskStatus.state);
    console.log('模型:', taskStatus.model);
    console.log('提示词:', taskStatus.prompt);
    console.log('创建时间:', taskStatus.created_at);
    
    if (taskStatus.state === 'success') {
      console.log('✅ 视频URL:', taskStatus.video_url);
      if (taskStatus.watermarked_url) {
        console.log('带水印的视频URL:', taskStatus.watermarked_url);
      }
    } else if (taskStatus.state === 'failed') {
      console.log('❌ 失败原因:', taskStatus.error);
    } else {
      console.log('⏳ 任务进行中...');
    }
  } catch (error: any) {
    console.error('❌ 查询失败:', error.message);
  }
}

/**
 * 示例 8: 取消错峰任务
 */
async function example8_CancelTask() {
  console.log('\n=== 示例 8: 取消错峰任务 ===');
  
  const taskId = 'your_task_id_here';  // 替换为实际的任务ID
  const apiKey = 'your_api_key_here';  // 从管理后台获取
  
  try {
    await cancelTask(taskId, apiKey);
    console.log('✅ 任务已取消！');
  } catch (error: any) {
    console.error('❌ 取消失败:', error.message);
  }
}

/**
 * 示例 9: 批量生成（顺序执行）
 */
async function example9_BatchGeneration() {
  console.log('\n=== 示例 9: 批量生成 ===');
  
  const images = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
    'https://example.com/image3.jpg',
  ];
  
  const prompts = [
    'First scene description',
    'Second scene description',
    'Third scene description',
  ];
  
  const results: string[] = [];
  
  for (let i = 0; i < images.length; i++) {
    try {
      console.log(`\n处理第 ${i + 1}/${images.length} 个视频...`);
      
      const videoUrl = await imageToVideo({
        images: [images[i]],
        prompt: prompts[i],
        model: 'viduq2-turbo',  // 使用turbo模型加快速度
        duration: 5,
        resolution: '720p',
      });
      
      results.push(videoUrl);
      console.log(`✅ 第 ${i + 1} 个视频生成成功: ${videoUrl}`);
    } catch (error: any) {
      console.error(`❌ 第 ${i + 1} 个视频生成失败:`, error.message);
      results.push('');
    }
  }
  
  console.log('\n批量生成完成！');
  console.log('成功:', results.filter(url => url).length);
  console.log('失败:', results.filter(url => !url).length);
  console.log('结果:', results);
}

/**
 * 示例 10: 错误处理和重试
 */
async function example10_ErrorHandling() {
  console.log('\n=== 示例 10: 错误处理和重试 ===');
  
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const videoUrl = await imageToVideo({
        images: ['https://example.com/image.jpg'],
        prompt: 'Test video generation.',
        model: 'viduq2-pro',
        duration: 5,
        resolution: '720p',
      });
      
      console.log('✅ 视频生成成功！');
      console.log('视频URL:', videoUrl);
      break;  // 成功则退出循环
    } catch (error: any) {
      retryCount++;
      console.error(`❌ 第 ${retryCount} 次尝试失败:`, error.message);
      
      if (retryCount < maxRetries) {
        const waitTime = retryCount * 5000;  // 递增等待时间
        console.log(`⏳ 等待 ${waitTime / 1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        console.error('❌ 达到最大重试次数，放弃！');
      }
    }
  }
}

// 运行示例
async function runExamples() {
  // 取消以下注释来运行对应的示例
  
  // await example1_BasicImageToVideo();
  // await example2_LocalImage();
  // await example3_WithAudio();
  // await example4_RecommendedPrompt();
  // await example5_OffPeakMode();
  // await example6_AdvancedConfig();
  // await example7_QueryTaskStatus();
  // await example8_CancelTask();
  // await example9_BatchGeneration();
  // await example10_ErrorHandling();
}

// 如果直接运行此文件
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  example1_BasicImageToVideo,
  example2_LocalImage,
  example3_WithAudio,
  example4_RecommendedPrompt,
  example5_OffPeakMode,
  example6_AdvancedConfig,
  example7_QueryTaskStatus,
  example8_CancelTask,
  example9_BatchGeneration,
  example10_ErrorHandling,
};
