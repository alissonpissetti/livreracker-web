import {
  DEFAULT_DEVICE_ICON,
  DEVICE_ICON_OPTIONS,
  type DeviceIcon,
} from '../constants/deviceIcons';
import { DeviceIconGlyph } from './DeviceIcon';

type DeviceIconPickerProps = {
  value: DeviceIcon;
  onChange: (icon: DeviceIcon) => void;
  disabled?: boolean;
};

export function DeviceIconPicker({
  value,
  onChange,
  disabled = false,
}: DeviceIconPickerProps) {
  return (
    <div className="device-icon-picker" role="radiogroup" aria-label="Tipo de veículo">
      {DEVICE_ICON_OPTIONS.map((option) => {
        const selected = (value || DEFAULT_DEVICE_ICON) === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={`device-icon-option${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            disabled={disabled}
            onClick={() => onChange(option.id)}
          >
            <DeviceIconGlyph icon={option.id} size={22} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
