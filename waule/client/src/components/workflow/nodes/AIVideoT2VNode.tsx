import { memo } from 'react';
import AIVideoNode from './AIVideoNode';

const AIVideoT2VNode = (props: any) => {
  const { data } = props;
  return (
    <AIVideoNode
      {...props}
      data={{
        ...data,
        config: {
          ...data?.config,
          lockedGenerationType: '文生视频',
          hideGenerationTypeSelector: true,
          generationType: '文生视频',
        },
      }}
    />
  );
};

export default memo(AIVideoT2VNode);