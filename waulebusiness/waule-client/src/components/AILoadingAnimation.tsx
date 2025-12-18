import React from 'react';

const AILoadingAnimation: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }

        @keyframes type {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(3px); }
        }

        @keyframes tail-wag {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }

        @keyframes symbol-float {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(-30px) scale(1.2); opacity: 0; }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        .cat-body {
          animation: float 3s ease-in-out infinite;
        }

        .eye-left, .eye-right {
          transform-origin: center;
          animation: blink 4s infinite;
        }

        .paw-left {
          animation: type 0.3s ease-in-out infinite alternate;
        }

        .paw-right {
          animation: type 0.3s ease-in-out infinite alternate-reverse;
        }

        .tail {
          transform-origin: bottom center;
          animation: tail-wag 2s ease-in-out infinite;
        }

        .symbol-1 { animation: symbol-float 2s infinite 0s; }
        .symbol-2 { animation: symbol-float 2s infinite 0.7s; }
        .symbol-3 { animation: symbol-float 2s infinite 1.4s; }
      `}</style>

      <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="catGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#818cf8', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#6366f1', stopOpacity: 1 }} />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 浮动的灵感符号 */}
        <g transform="translate(100, 60)" style={{ fontSize: '20px', fill: '#fbbf24' }}>
          <text x="-40" y="0" className="symbol-1">✨</text>
          <text x="0" y="-10" className="symbol-2">📝</text>
          <text x="40" y="0" className="symbol-3">💡</text>
        </g>

        <g className="cat-body">
          {/* 尾巴 */}
          <path className="tail" d="M130,150 Q150,140 150,120 Q150,100 130,110" 
                stroke="#818cf8" strokeWidth="8" fill="none" strokeLinecap="round" />

          {/* 身体 */}
          <ellipse cx="100" cy="140" rx="40" ry="35" fill="url(#catGradient)" />
          <path d="M75,140 Q100,160 125,140" fill="#e0e7ff" opacity="0.3" />

          {/* 脑袋 */}
          <circle cx="100" cy="95" r="35" fill="url(#catGradient)" />
          
          {/* 耳朵 */}
          <path d="M75,75 L65,55 L90,70 Z" fill="url(#catGradient)" />
          <path d="M125,75 L135,55 L110,70 Z" fill="url(#catGradient)" />
          <path d="M75,75 L68,60 L85,72 Z" fill="#c7d2fe" />
          <path d="M125,75 L132,60 L115,72 Z" fill="#c7d2fe" />

          {/* 脸部 */}
          <ellipse className="eye-left" cx="88" cy="95" rx="4" ry="6" fill="#1e293b" />
          <ellipse className="eye-right" cx="112" cy="95" rx="4" ry="6" fill="#1e293b" />
          <circle cx="89" cy="93" r="1.5" fill="white" />
          <circle cx="113" cy="93" r="1.5" fill="white" />
          
          <path d="M96,102 Q100,105 104,102" stroke="#1e293b" strokeWidth="2" fill="none" />
          <ellipse cx="85" cy="105" rx="3" ry="1.5" fill="#fbbf24" opacity="0.5" />
          <ellipse cx="115" cy="105" rx="3" ry="1.5" fill="#fbbf24" opacity="0.5" />

          {/* 眼镜 */}
          <g stroke="#fbbf24" strokeWidth="2" fill="none" opacity="0.8">
            <circle cx="88" cy="95" r="9" />
            <circle cx="112" cy="95" r="9" />
            <line x1="97" y1="95" x2="103" y2="95" />
          </g>

          {/* 手/爪子 */}
          <circle className="paw-left" cx="80" cy="150" r="8" fill="#c7d2fe" />
          <circle className="paw-right" cx="120" cy="150" r="8" fill="#c7d2fe" />
        </g>

        {/* 笔记本电脑 */}
        <g transform="translate(60, 155)">
          <path d="M10,0 L70,0 L65,-40 L15,-40 Z" fill="#475569" />
          <circle cx="40" cy="-20" r="5" fill="#818cf8" filter="url(#glow)" />
          <path d="M0,0 L80,0 L85,10 L-5,10 Z" fill="#334155" />
        </g>
      </svg>

      <div className="mt-6 text-lg text-text-light-secondary dark:text-text-dark-secondary font-medium animate-pulse">
        AI 正在疯狂码字中...
      </div>
      <p className="mt-2 text-sm text-text-light-tertiary dark:text-text-dark-tertiary">
        剧本生成通常需要 1-3 分钟，请耐心等待
      </p>
    </div>
  );
};

export default AILoadingAnimation;
