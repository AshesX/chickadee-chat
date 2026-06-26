import { useEffect, useRef } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

// Center of Left and Right Eyes in the SVG coordinates
const EYE_LEFT = { cx: 98.15, cy: 170.59 };
const EYE_RIGHT = { cx: 252.37, cy: 170.59 };

// Radius of the path the pupil centers rotate along
const ROTATION_RADIUS = 25.107053; // Math.sqrt(18.29^2 + 17.2^2)

// Original angle (top left: dx = -18.29, dy = -17.2)
const BASE_ANGLE = Math.atan2(-17.2, -18.29);

/** The Chickadee Chat brand logo. */
export function Logo({ size = 24, className }: LogoProps): React.JSX.Element {
  // Refs to determine screen positioning and manipulate pupils directly
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilLeftRef = useRef<SVGCircleElement>(null);
  const pupilRightRef = useRef<SVGCircleElement>(null);

  // Refs to store mutable values for the animation loop
  const stateRef = useRef({
    leftAngle: BASE_ANGLE,
    rightAngle: BASE_ANGLE,
    targetLeft: BASE_ANGLE,
    targetRight: BASE_ANGLE,

    // Mouse position tracking
    mouseActive: false,
    mouseX: 0,
    mouseY: 0,

    // Loop state
    loopRunning: false,
    frameId: 0,
  });

  useEffect(() => {
    const state = stateRef.current;
    let lastTime = performance.now();

    // Helper to update pupil coordinates in the DOM directly (no React state re-renders)
    const updatePupilAttributes = (leftAngle: number, rightAngle: number) => {
      if (pupilLeftRef.current) {
        const cx = EYE_LEFT.cx + ROTATION_RADIUS * Math.cos(leftAngle);
        const cy = EYE_LEFT.cy + ROTATION_RADIUS * Math.sin(leftAngle);
        pupilLeftRef.current.setAttribute('cx', String(cx));
        pupilLeftRef.current.setAttribute('cy', String(cy));
      }
      if (pupilRightRef.current) {
        const cx = EYE_RIGHT.cx + ROTATION_RADIUS * Math.cos(rightAngle);
        const cy = EYE_RIGHT.cy + ROTATION_RADIUS * Math.sin(rightAngle);
        pupilRightRef.current.setAttribute('cx', String(cx));
        pupilRightRef.current.setAttribute('cy', String(cy));
      }
    };

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000; // delta time in seconds
      lastTime = time;

      // Determine the target angle (mouse following or default top-left angle)
      let targetLeft = BASE_ANGLE;
      let targetRight = BASE_ANGLE;

      if (state.mouseActive && svgRef.current) {
        const svgRect = svgRef.current.getBoundingClientRect();
        if (svgRect && svgRect.width > 0) {
          const svgWidth = svgRect.width;
          const svgHeight = svgRect.height;

          // Compute left eye center coordinates relative to viewport
          const relativeXLeft = (98.15 + 20.42) / 390;
          const relativeYLeft = (170.59 + 0.27) / 390;
          const eyeLeftX = svgRect.left + relativeXLeft * svgWidth;
          const eyeLeftY = svgRect.top + relativeYLeft * svgHeight;

          // Compute right eye center coordinates relative to viewport
          const relativeXRight = (252.37 + 20.42) / 390;
          const relativeYRight = (170.59 + 0.27) / 390;
          const eyeRightX = svgRect.left + relativeXRight * svgWidth;
          const eyeRightY = svgRect.top + relativeYRight * svgHeight;

          // Calculate angles towards the cursor position
          const dxLeft = state.mouseX - eyeLeftX;
          const dyLeft = state.mouseY - eyeLeftY;
          // Only change target if cursor is not directly on center of the eye to avoid jitter
          if (dxLeft * dxLeft + dyLeft * dyLeft > 10) {
            targetLeft = Math.atan2(dyLeft, dxLeft);
          }

          const dxRight = state.mouseX - eyeRightX;
          const dyRight = state.mouseY - eyeRightY;
          if (dxRight * dxRight + dyRight * dyRight > 10) {
            targetRight = Math.atan2(dyRight, dxRight);
          }
        }
      }

      state.targetLeft = targetLeft;
      state.targetRight = targetRight;

      // Smoothly interpolate towards target (mouse location or resting BASE_ANGLE)
      const diffLeft =
        (((targetLeft - state.leftAngle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) %
          (2 * Math.PI) -
        Math.PI;
      const diffRight =
        (((targetRight - state.rightAngle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) %
          (2 * Math.PI) -
        Math.PI;

      const lerpSpeed = 6.0; // exponential decay factor (~0.2s response time)
      const stepLeft = diffLeft * (1 - Math.exp(-lerpSpeed * dt));
      const stepRight = diffRight * (1 - Math.exp(-lerpSpeed * dt));

      state.leftAngle += stepLeft;
      state.rightAngle += stepRight;

      // Update pupil attributes directly
      updatePupilAttributes(state.leftAngle, state.rightAngle);

      // Check if both eyes are close enough to their target angles to suspend the loop
      const diffLeftRemaining = Math.abs(
        (((targetLeft - state.leftAngle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) -
          Math.PI
      );
      const diffRightRemaining = Math.abs(
        (((targetRight - state.rightAngle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) %
          (2 * Math.PI) -
          Math.PI
      );

      if (diffLeftRemaining < 0.001 && diffRightRemaining < 0.001) {
        // Snap to target angles exactly, update DOM, and suspend loop
        state.leftAngle = targetLeft;
        state.rightAngle = targetRight;
        updatePupilAttributes(state.leftAngle, state.rightAngle);
        state.loopRunning = false;
      } else {
        state.frameId = requestAnimationFrame(animate);
      }
    };

    const startLoopIfNeeded = () => {
      if (!state.loopRunning) {
        state.loopRunning = true;
        lastTime = performance.now();
        state.frameId = requestAnimationFrame(animate);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      state.mouseActive = true;
      state.mouseX = e.clientX;
      state.mouseY = e.clientY;
      startLoopIfNeeded();
    };

    const handleMouseLeave = () => {
      state.mouseActive = false;
      startLoopIfNeeded(); // Run loop to transition back to resting state
    };

    const handleBlur = () => {
      // Snapping immediately to resting position to guarantee 0% resource usage
      state.mouseActive = false;
      state.leftAngle = BASE_ANGLE;
      state.rightAngle = BASE_ANGLE;
      updatePupilAttributes(BASE_ANGLE, BASE_ANGLE);
      if (state.loopRunning) {
        cancelAnimationFrame(state.frameId);
        state.loopRunning = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleBlur();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial render setup
    updatePupilAttributes(state.leftAngle, state.rightAngle);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (state.frameId) {
        cancelAnimationFrame(state.frameId);
      }
    };
  }, []);

  // Compute initial static coordinates based on BASE_ANGLE
  const initialLeftCx = EYE_LEFT.cx + ROTATION_RADIUS * Math.cos(BASE_ANGLE);
  const initialLeftCy = EYE_LEFT.cy + ROTATION_RADIUS * Math.sin(BASE_ANGLE);

  const initialRightCx = EYE_RIGHT.cx + ROTATION_RADIUS * Math.cos(BASE_ANGLE);
  const initialRightCy = EYE_RIGHT.cy + ROTATION_RADIUS * Math.sin(BASE_ANGLE);

  return (
    <svg
      id="chickadee-chat-logo"
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-20.42 -0.27 390 390"
      className={className}
      style={{ display: 'inline-block' }}
    >
      <circle id="eye-left" fill="var(--logo-fill, #e9e9e9)" cx={EYE_LEFT.cx} cy={EYE_LEFT.cy} r="34.4" />
      <circle id="eye-right" fill="var(--logo-fill, #e9e9e9)" cx={EYE_RIGHT.cx} cy={EYE_RIGHT.cy} r="34.4" />
      <circle
        id="pupil-left"
        ref={pupilLeftRef}
        fill="var(--bg)"
        cx={initialLeftCx}
        cy={initialLeftCy}
        r="17.2"
      />
      <circle
        id="pupil-right"
        ref={pupilRightRef}
        fill="var(--bg)"
        cx={initialRightCx}
        cy={initialRightCy}
        r="17.2"
      />
      <path
        id="chickadee-body"
        fill="var(--logo-fill, #e9e9e9)"
        d="M347.08,185c-8.2-50.24-38.39-98.08-94.31-127.85-18.94-10.24-21.4-25.94,7.47-33.48-20.43-5.57-41.2,1.87-58.98,17.8C199.47,23.87,231.86.23,231.86.23,149.23-5.08,32.33,83.93,8.16,163.1c-47.18,153.9,125.64,223.16,125.64,223.16-.43-13.21,13.74-28.15,13.74-28.15-22.39-2.33-38.22-13.33-38.22-13.33,6.22-25.22,32.06-37.72,32.06-37.72-89.11.44-110.13-83.72-110.13-83.72-8.79-37.19,4.68-82.48,38.34-102.06,43.14-27.13,90.76,14.61,91.65,68.97l-12.45,12.75c-12.49,12.79-13.6,32.84-2.61,46.93,0,0,8.76,11.32,16.82,21.66,6.34,8.13,18.64,8.1,24.94-.06,8.05-10.43,16.81-21.86,16.81-21.86,10.87-14.07,9.74-34-2.66-46.74-4.55-4.67-9.04-9.22-12.58-12.68,0,0,0,0,0,0,.46-53.65,45.55-95.9,90.24-69.35,33.66,19.58,47.5,63.7,38.71,100.89,0,0-18.49,87.87-133.48,85.38-24.85-.54-50.72,9.42-62.89,32.14,18.51,10.32,47.87,12.39,68.67,7.47-20.81,4.92-43.39,17.67-47.3,41.09,41.72,8.98,85.43-21.32,108.51-53.47-10.36,15.87-24.14,37.52-19.62,53.57,55.33-1.33,130.31-119.62,114.73-202.96ZM192.9,238.25c2.76-.56,4.73,2.6,3.04,4.85-21.64,28.78-19.5,28.65-41.25.03-1.71-2.25.27-5.43,3.03-4.86l17.59,9.93,17.59-9.95Z"
      />
    </svg>
  );
}
