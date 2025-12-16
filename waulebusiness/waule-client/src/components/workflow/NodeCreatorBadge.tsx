import React from 'react';
import { useWorkflowUsers } from '../../contexts/WorkflowUsersContext';

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
 * 优先使用 WorkflowUsersContext 中的最新用户信息（头像、昵称）
 */
const NodeCreatorBadge: React.FC<NodeCreatorBadgeProps> = ({ createdBy, isSharedWorkflow }) => {
  const { getUserInfo } = useWorkflowUsers();
  
  // 只在共享工作流且有创建者信息时显示
  if (!isSharedWorkflow || !createdBy || typeof createdBy === 'string') {
    return null;
  }

  // 优先从 context 获取最新的用户信息，回退到节点中存储的信息
  const latestUserInfo = getUserInfo(createdBy.id);
  const nickname = latestUserInfo?.nickname || createdBy.nickname;
  const avatar = latestUserInfo?.avatar || createdBy.avatar;

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
