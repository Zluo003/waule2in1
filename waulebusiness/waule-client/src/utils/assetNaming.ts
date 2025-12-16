/**
 * 资产自动命名工具
 * 
 * 命名规则：
 * - 短剧项目：{项目名}_S{集数}_Sc{幕数}_Sh{镜头数}_{序号}
 * - 快速项目：{项目名}_Sc{幕数}_Sh{镜头数}_{序号}
 * 
 * 示例：霸道总裁爱上我_S001_Sc1_Sh2_1
 */

interface Project {
  id: string;
  name: string;
  type: 'DRAMA' | 'QUICK';
}

interface Episode {
  id: string;
  episodeNumber: number;
}

interface NodeGroup {
  id: string;
  name?: string;
  scene?: number; // 幕数 (x)
  shot?: number; // 镜数 (y)
  nodeIds: string[];
}

interface AssetNamingContext {
  project: Project;
  episode?: Episode | null;
  nodeGroup?: NodeGroup | null;
  nodeId: string; // 当前节点ID
  assetType: 'image' | 'video' | 'audio';
  preview?: boolean; // 预览模式，不递增计数器
}

// 用于追踪每个编组每种类型资产的序号
const assetCounters: Record<string, number> = {};

/**
 * 生成资产名称
 */
export function generateAssetName(context: AssetNamingContext): string | null {
  const { project, episode, nodeGroup, assetType, preview = true } = context;

  // 如果编组未命名（没有幕数和镜头数），返回 null 表示不自动命名
  if (!nodeGroup || !nodeGroup.scene || !nodeGroup.shot) {
    return null;
  }

  // 在镜头工作流中，即使节点不在编组的nodeIds中，也可以使用编组信息进行命名
  // 因为镜头工作流中的所有节点都属于当前镜头
  // 注释掉这个检查：
  // if (!nodeGroup.nodeIds.includes(nodeId)) {
  //   return null;
  // }

  // 初始化计数器
  const counterKey = `${nodeGroup.id}-${assetType}`;
  if (!assetCounters[counterKey]) {
    assetCounters[counterKey] = 0;
  }

  // 序号：预览模式下不递增，实际添加时才递增
  let sequence: number;
  if (preview) {
    // 预览模式：显示下一个序号，但不递增计数器
    sequence = assetCounters[counterKey] + 1;
  } else {
    // 实际添加：递增计数器
    assetCounters[counterKey]++;
    sequence = assetCounters[counterKey];
  }

  // 构建名称
  let name = project.name;

  // 短剧项目需要添加集数
  if (project.type === 'DRAMA' && episode) {
    const episodeStr = `S${String(episode.episodeNumber).padStart(3, '0')}`;
    name += `_${episodeStr}`;
  }

  // 添加幕数和镜头数（格式：Sc{幕数}_Sh{镜头数}）
  name += `_Sc${nodeGroup.scene}_Sh${nodeGroup.shot}`;

  // 添加序号
  name += `_${sequence}`;

  return name;
}

/**
 * 重置特定编组和类型的计数器
 */
export function resetAssetCounter(groupId: string, assetType: 'image' | 'video' | 'audio') {
  const counterKey = `${groupId}-${assetType}`;
  delete assetCounters[counterKey];
}

/**
 * 重置所有计数器
 */
export function resetAllAssetCounters() {
  Object.keys(assetCounters).forEach(key => delete assetCounters[key]);
}

/**
 * 获取当前节点所在的编组
 */
export function findNodeGroup(nodeId: string, nodeGroups: NodeGroup[]): NodeGroup | null {
  return nodeGroups.find(group => group.nodeIds.includes(nodeId)) || null;
}

