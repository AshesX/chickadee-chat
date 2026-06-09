import { useEffect, useState, useRef } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

// Center of Left and Right Eyes in the SVG coordinates
const EYE_LEFT = { cx: 98.24, cy: 170.59 };
const EYE_RIGHT = { cx: 252.46, cy: 170.59 };

// Radius of the path the pupil centers rotate along
const ROTATION_RADIUS = 24.324389; // Math.sqrt(17.2^2 + 17.2^2)

// Original angle (top right: dx = 17.2, dy = -17.2)
const BASE_ANGLE = -Math.PI / 4;

/** The Chickadee Chat brand logo. */
export function Logo({ size = 24, className }: LogoProps): React.JSX.Element {
  // We track the current angles of the left and right eyes
  const [angles, setAngles] = useState({ left: BASE_ANGLE, right: BASE_ANGLE });

  // Refs to store mutable values for the animation loop
  const stateRef = useRef({
    phase: 'idle' as 'idle' | 'googly' | 'returning',
    phaseTimer: 15000 + Math.random() * 5000, // Duration of current phase in ms
    
    // Left eye state
    leftAngle: BASE_ANGLE,
    leftVelocity: 0,
    leftVelocityTimer: 0, // Time left until next velocity change in ms
    leftStartReturnAngle: BASE_ANGLE,
    
    // Right eye state
    rightAngle: BASE_ANGLE,
    rightVelocity: 0,
    rightVelocityTimer: 0,
    rightStartReturnAngle: BASE_ANGLE,
    
    // Returning phase variables
    returnElapsed: 0,
    returnDuration: 800, // 0.8 seconds to return to base
  });

  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;

    const animate = (time: number) => {
      const dt = (time - lastTime) / 1000; // delta time in seconds
      lastTime = time;

      const state = stateRef.current;
      state.phaseTimer -= dt * 1000;

      // State machine logic
      if (state.phase === 'idle') {
        if (state.phaseTimer <= 0) {
          // Transition to googly phase
          state.phase = 'googly';
          state.phaseTimer = 5000 + Math.random() * 5000; // 5-10 seconds of googly eyes

          // Initialize velocities for the googly phase
          state.leftVelocity = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2.5);
          state.leftVelocityTimer = 1000 + Math.random() * 2000;

          state.rightVelocity = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2.5);
          state.rightVelocityTimer = 1000 + Math.random() * 2000;
        } else {
          // Stationary in base angle
          state.leftAngle = BASE_ANGLE;
          state.rightAngle = BASE_ANGLE;
        }
      } else if (state.phase === 'googly') {
        if (state.phaseTimer <= 0) {
          // Transition to returning phase
          state.phase = 'returning';
          state.phaseTimer = state.returnDuration;
          state.returnElapsed = 0;
          state.leftStartReturnAngle = state.leftAngle;
          state.rightStartReturnAngle = state.rightAngle;
        } else {
          // Update Left Eye
          state.leftVelocityTimer -= dt * 1000;
          if (state.leftVelocityTimer <= 0) {
            state.leftVelocity = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2.5);
            state.leftVelocityTimer = 1000 + Math.random() * 2000;
          }
          state.leftAngle += state.leftVelocity * dt;

          // Update Right Eye
          state.rightVelocityTimer -= dt * 1000;
          if (state.rightVelocityTimer <= 0) {
            state.rightVelocity = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 2.5);
            state.rightVelocityTimer = 1000 + Math.random() * 2000;
          }
          state.rightAngle += state.rightVelocity * dt;
        }
      } else if (state.phase === 'returning') {
        state.returnElapsed += dt * 1000;
        const progress = Math.min(state.returnElapsed / state.returnDuration, 1);
        
        // Cubic ease-out: f(t) = 1 - (1-t)^3
        const ease = 1 - Math.pow(1 - progress, 3);

        // Find shortest path to BASE_ANGLE for left eye
        const diffLeft = (((state.leftStartReturnAngle - BASE_ANGLE + Math.PI) % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI) - Math.PI;
        state.leftAngle = BASE_ANGLE + diffLeft * (1 - ease);

        // Find shortest path to BASE_ANGLE for right eye
        const diffRight = (((state.rightStartReturnAngle - BASE_ANGLE + Math.PI) % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI) - Math.PI;
        state.rightAngle = BASE_ANGLE + diffRight * (1 - ease);

        if (progress >= 1) {
          // Transition back to idle phase
          state.phase = 'idle';
          state.phaseTimer = 15000 + Math.random() * 5000; // 15-20 seconds of normal eyes
          state.leftAngle = BASE_ANGLE;
          state.rightAngle = BASE_ANGLE;
        }
      }

      // Update state for rendering
      setAngles({
        left: state.leftAngle,
        right: state.rightAngle,
      });

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Calculate coordinates for pupils based on angles
  const pupilLeftCx = EYE_LEFT.cx + ROTATION_RADIUS * Math.cos(angles.left);
  const pupilLeftCy = EYE_LEFT.cy + ROTATION_RADIUS * Math.sin(angles.left);

  const pupilRightCx = EYE_RIGHT.cx + ROTATION_RADIUS * Math.cos(angles.right);
  const pupilRightCy = EYE_RIGHT.cy + ROTATION_RADIUS * Math.sin(angles.right);

  return (
    <svg
      id="chickadee-chat-logo"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="-20.255 0 390 390"
      className={className}
      style={{ display: 'inline-block' }}
    >
      <circle id="eye-left" fill="#e8e8f0" cx={EYE_LEFT.cx} cy={EYE_LEFT.cy} r="34.4" />
      <circle id="eye-right" fill="#e8e8f0" cx={EYE_RIGHT.cx} cy={EYE_RIGHT.cy} r="34.4" />
      <circle
        id="pupil-left"
        fill="var(--bg)"
        cx={pupilLeftCx}
        cy={pupilLeftCy}
        r="17.2"
      />
      <circle
        id="pupil-right"
        fill="var(--bg)"
        cx={pupilRightCx}
        cy={pupilRightCy}
        r="17.2"
      />
      <path
        id="chickadee-body"
        fill="#e8e8f0"
        d="M252.86,57.15c-18.94-10.24-21.4-25.94,7.47-33.48-20.43-5.57-41.2,1.87-58.98,17.8C199.57,23.87,231.95.23,231.95.23,149.32-5.08,32.42,83.93,8.25,163.1c-12.93,36.69-10.09,79.35,4.51,116.67,15.47,31.07,54.97,2.45,35.22-24.17-29.54-39.51-23.69-100.8,16.6-130.79,44.39-33.97,97.85,13.31,98.64,61.77l-10.68,10.93c-10.71,10.97-11.67,28.16-2.24,40.25,0,0,7.51,9.7,14.43,18.57,5.43,6.97,15.98,6.94,21.38-.05,6.9-8.94,14.42-18.74,14.42-18.74,9.32-12.07,8.35-29.16-2.28-40.09-3.9-4.01-7.75-7.91-10.79-10.88,0,0,0,0,0,0,.39-46.01,47.68-92.25,92.37-65.7,33.66,19.58,47.5,63.7,38.71,100.89-15.08,59.71-82.47,88.83-139.66,89.34-67.18.61-87.04,82.43-9.12,78.76,188.65,2.14,248.71-244.57,83.09-332.73ZM190.38,227.76c2.36-.48,4.06,2.23,2.61,4.16-18.56,24.68-16.73,24.57-35.38.03-1.46-1.93.23-4.65,2.6-4.17,9.95,2.02,20.22,2.02,30.17-.02Z"
      />
    </svg>
  );
}
