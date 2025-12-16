import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * 用户信息接口
 */
interface UserInfo {
  id: string;
  nickname?: string;
  avatar?: string;
}

/**
 * 工作流用户上下文接口
 */
interface WorkflowUsersContextType {
  /** 用户信息 Map: userId -> UserInfo */
  userInfoMap: Map<string, UserInfo>;
  /** 更新用户信息 */
  updateUserInfo: (userId: string, info: Partial<UserInfo>) => void;
  /** 批量设置用户信息 */
  setUsers: (users: UserInfo[]) => void;
  /** 获取用户信息 */
  getUserInfo: (userId: string) => UserInfo | undefined;
}

const WorkflowUsersContext = createContext<WorkflowUsersContextType | null>(null);

/**
 * 工作流用户信息 Provider
 * 用于在共享工作流中缓存和共享用户信息（头像、昵称等）
 */
export const WorkflowUsersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userInfoMap, setUserInfoMap] = useState<Map<string, UserInfo>>(new Map());

  const updateUserInfo = useCallback((userId: string, info: Partial<UserInfo>) => {
    setUserInfoMap(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(userId) || { id: userId };
      newMap.set(userId, { ...existing, ...info });
      return newMap;
    });
  }, []);

  const setUsers = useCallback((users: UserInfo[]) => {
    setUserInfoMap(prev => {
      const newMap = new Map(prev);
      users.forEach(user => {
        newMap.set(user.id, user);
      });
      return newMap;
    });
  }, []);

  const getUserInfo = useCallback((userId: string): UserInfo | undefined => {
    return userInfoMap.get(userId);
  }, [userInfoMap]);

  const value = useMemo(() => ({
    userInfoMap,
    updateUserInfo,
    setUsers,
    getUserInfo,
  }), [userInfoMap, updateUserInfo, setUsers, getUserInfo]);

  return (
    <WorkflowUsersContext.Provider value={value}>
      {children}
    </WorkflowUsersContext.Provider>
  );
};

/**
 * 使用工作流用户信息的 Hook
 */
export const useWorkflowUsers = (): WorkflowUsersContextType => {
  const context = useContext(WorkflowUsersContext);
  if (!context) {
    // 在 context 外部使用时返回空实现
    return {
      userInfoMap: new Map(),
      updateUserInfo: () => {},
      setUsers: () => {},
      getUserInfo: () => undefined,
    };
  }
  return context;
};

export default WorkflowUsersContext;

