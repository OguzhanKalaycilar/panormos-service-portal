import React from 'react';

interface AnchorLogoProps {
  className?: string;
  large?: boolean;
}

const AnchorLogo: React.FC<AnchorLogoProps> = ({ className = "w-6 h-6", large = false }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Premium Gold Gradient */}
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FBBF24" /> {/* amber-400 */}
          <stop offset="50%" stopColor="#CA8A04" /> {/* yellow-600 */}
          <stop offset="100%" stopColor="#92400E" /> {/* amber-800 */}
        </linearGradient>

        {/* Emboss Filter for 3D Relief Effect */}
        <filter id="goldEmboss" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="blur"/>
          <feSpecularLighting in="blur" surfaceScale="2" specularConstant="1" specularExponent="18" lightingColor="#ffffff" result="spec">
            <fePointLight x="-50" y="-100" z="200"/>
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specOut"/>
          <feComposite in="SourceGraphic" in2="specOut" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litPaint"/>
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.5"/>
        </filter>
      </defs>

      <g filter={large ? "url(#goldEmboss)" : ""}>
        {/* Top Ring */}
        <circle cx="12" cy="4.5" r="2" stroke="url(#goldGradient)" strokeWidth="2" />
        
        {/* Crossbar (Stock) */}
        <path d="M6 8.5H18" stroke="url(#goldGradient)" strokeWidth="2.5" strokeLinecap="round" />
        
        {/* Vertical Shank */}
        <path d="M12 6.5V17" stroke="url(#goldGradient)" strokeWidth="2.5" />
        
        {/* Central Circular Element (Relief) */}
        <circle cx="12" cy="11.5" r="1.5" fill="#09090b" stroke="url(#goldGradient)" strokeWidth="1.5" />

        {/* Curved Arms (Crown) */}
        <path d="M5 15C5 15 8 20.5 12 20.5C16 20.5 19 15 19 15" stroke="url(#goldGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Flukes (Arrowheads) */}
        <path d="M5 15L2.5 17.5" stroke="url(#goldGradient)" strokeWidth="2" strokeLinecap="round" />
        <path d="M19 15L21.5 17.5" stroke="url(#goldGradient)" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
};

export default AnchorLogo;