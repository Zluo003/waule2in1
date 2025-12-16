import { memo } from 'react';
import AIVideoNode from './AIVideoNode';

const AIVideoI2VFirstNode = (props: any) => {
  const { data } = props;
  return (
    <AIVideoNode
      {...props}
      data={{
        ...data,
        config: {
          ...data?.config,
          lockedGenerationType: '首帧',
          hideGenerationTypeSelector: true,
          generationType: '首帧',
        },
      }}
    />
  );
};

export default memo(AIVideoI2VFirstNode);