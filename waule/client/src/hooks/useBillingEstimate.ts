import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';

interface EstimateParams {
  aiModelId?: string;
  nodeType?: string;
  moduleType?: string;
  quantity?: number;
  duration?: number;
  resolution?: string;
  mode?: string;
  operationType?: string;
  characterCount?: number;
}

interface EstimateResult {
  credits: number | null;
  loading: boolean;
  isFreeUsage: boolean;
  freeUsageRemaining: number;
  refetch: () => void;
}

export const useBillingEstimate = (params: EstimateParams): EstimateResult => {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFreeUsage, setIsFreeUsage] = useState(false);
  const [freeUsageRemaining, setFreeUsageRemaining] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refetch = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  useEffect(() => {
    const estimate = async () => {
      // 如果没有必要参数，不估算
      if (!params.aiModelId && !params.nodeType && !params.moduleType) {
        setCredits(null);
        setIsFreeUsage(false);
        setFreeUsageRemaining(0);
        return;
      }

      try {
        setLoading(true);
        const response = await apiClient.post('/billing/estimate', params);
        const rawData = response.data;
        const result = rawData?.data ?? rawData;
        
        // 免费使用时 credits 为 0，用 originalCredits 作为显示价格
        const displayCredits = result?.originalCredits ?? result?.credits ?? 0;
        setCredits(displayCredits);
        setIsFreeUsage(result?.isFreeUsage ?? false);
        setFreeUsageRemaining(result?.freeUsageRemaining ?? 0);
      } catch (error) {
        console.error('Failed to estimate credits:', error);
        setCredits(null);
        setIsFreeUsage(false);
        setFreeUsageRemaining(0);
      } finally {
        setLoading(false);
      }
    };

    estimate();
  }, [
    params.aiModelId,
    params.nodeType,
    params.moduleType,
    params.quantity,
    params.duration,
    params.resolution,
    params.mode,
    params.operationType,
    params.characterCount,
    refreshTrigger,
  ]);

  return { credits, loading, isFreeUsage, freeUsageRemaining, refetch };
};
