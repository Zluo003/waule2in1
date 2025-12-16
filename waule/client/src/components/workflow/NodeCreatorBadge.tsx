import React from 'react';

interface NodeCreatorBadgeProps {
  createdBy?: {
    id: string;
    nickname?: string;
    avatar?: string;
  } | string; // 兼容旧格式
  isSharedWorkflow?: boolean;
}

/**
 * 节点创建者头像徽章
 * 在共享工作流中显示在节点顶部，1/4重叠，标识节点创建者
 */
const NodeCreatorBadge: React.FC<NodeCreatorBadgeProps> = ({ createdBy, isSharedWorkflow }) => {
  // 只在共享工作流且有创建者信息时显示
  if (!isSharedWorkflow || !createdBy || typeof createdBy === 'string') {
    return null;
  }

  const { nickname, avatar } = createdBy;

  return (
    <div 
      className="absolute -top-6 left-1/2 -translate-x-1/2 z-10"
      title={nickname || '未知用户'}
    >
      {avatar ? (
        <img 
          src={avatar} 
          alt={nickname || ''} 
          className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-md"
        />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg font-medium border-2 border-white dark:border-slate-700 shadow-md">
          {(nickname || '?')[0].toUpperCase()}
        </div>
      )}
    </div>
  );
};

export default NodeCreatorBadge;
