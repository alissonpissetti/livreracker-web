import type { DeviceIcon } from '../constants/deviceIcons';

type DeviceIconProps = {
  icon: DeviceIcon;
  size?: number;
  className?: string;
};

function IconPath({ icon }: { icon: DeviceIcon }) {
  switch (icon) {
    case 'car':
      return (
        <>
          <path d="M4 14h16l-1.5-5.5a2 2 0 0 0-1.9-1.5H7.4a2 2 0 0 0-1.9 1.5L4 14Z" />
          <circle cx="8" cy="17" r="1.5" />
          <circle cx="16" cy="17" r="1.5" />
          <path d="M4 14h16" />
        </>
      );
    case 'bicycle':
      return (
        <>
          <circle cx="6" cy="16" r="2.5" />
          <circle cx="18" cy="16" r="2.5" />
          <path d="M8.5 16 12 8h3l2 4" />
          <path d="M12 8h4l-2 4" />
        </>
      );
    case 'truck':
      return (
        <>
          <path d="M3 14h11V8h6l3 4v2h-2" />
          <circle cx="7" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
          <path d="M14 8v6" />
        </>
      );
    case 'boat':
      return (
        <>
          <path d="M4 15h16l-2-4H6l-2 4Z" />
          <path d="M12 6v5" />
          <path d="M9 8h6" />
          <path d="M3 18c2 1 4 1.5 9 1.5s7-.5 9-1.5" />
        </>
      );
    case 'plane':
      return (
        <path d="m4 12 7-2 3-5 2 5 7 2-7 2-3 5-2-5-7-2 7-2 3-5 2 5Z" />
      );
    case 'scooter':
      return (
        <>
          <circle cx="7" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
          <path d="M8.5 17H15" />
          <path d="M12 8v4" />
          <path d="M12 8h4l-1 3h-3" />
          <path d="M9 12h6" />
        </>
      );
    case 'backpack':
      return (
        <>
          <path d="M8 8V6a4 4 0 0 1 8 0v2" />
          <path d="M6 8h12l-1 12H7L6 8Z" />
          <path d="M10 12h4" />
        </>
      );
    case 'vehicle':
    default:
      return (
        <>
          <circle cx="7" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
          <path d="M5 14h14l-1.5-5H6.5L5 14Z" />
          <path d="M8 9h8" />
        </>
      );
  }
}

export function DeviceIconGlyph({
  icon,
  size = 24,
  className,
}: DeviceIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <IconPath icon={icon} />
    </svg>
  );
}
