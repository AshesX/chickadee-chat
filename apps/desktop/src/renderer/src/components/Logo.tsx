import logoUrl from '../assets/chickadee-logo.svg';

interface LogoProps {
  size?: number;
  className?: string;
}

/** The Chickadee Chat brand logo. */
export function Logo({ size = 24, className }: LogoProps): React.JSX.Element {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt="Chickadee Chat"
      draggable={false}
      className={className}
    />
  );
}
