import { memo } from 'react';
import AIVideoNode from './AIVideoNode';

const AIVideoI2VLastNode = (props: any) => {
  const { data } = props;
  return (
    <AIVideoNode
      {...props}
      data={{
        ...data,
        config: {
          ...data?.config,
          lockedGenerationType: '尾帧',
          hideGenerationTypeSelector: true,
          generationType: '尾帧',
        },
      }}
    />
  );
};

export default memo(AIVideoI2VLastNode);