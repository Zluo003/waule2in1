import { memo } from 'react';
import AIVideoNode from './AIVideoNode';

const AIVideoReferenceNode = (props: any) => {
  const data = props?.data || {};
  const cfg = data.config || {};
  return (
    <AIVideoNode
      {...props}
      data={{
        ...data,
        config: {
          ...cfg,
          generationType: cfg?.lockedGenerationType || cfg?.generationType || '参考图',
          lockedGenerationType: cfg?.lockedGenerationType || '参考图',
          hideGenerationTypeSelector: true,
          acceptedInputs: (cfg?.lockedGenerationType === '视频换人' || cfg?.generationType === '视频换人') 
            ? ['TEXT', 'IMAGE', 'VIDEO'] 
            : ['TEXT', 'IMAGE'],
        },
      }}
    />
  );
};

export default memo(AIVideoReferenceNode);