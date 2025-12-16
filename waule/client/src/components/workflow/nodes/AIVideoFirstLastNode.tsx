import { memo } from 'react';
import AIVideoNode from './AIVideoNode';

const AIVideoFirstLastNode = (props: any) => {
  const { data } = props;
  return (
    <AIVideoNode
      {...props}
      data={{
        ...data,
        config: {
          ...data?.config,
          lockedGenerationType: '首尾帧',
          hideGenerationTypeSelector: true,
          generationType: '首尾帧',
        },
      }}
    />
  );
};

export default memo(AIVideoFirstLastNode);