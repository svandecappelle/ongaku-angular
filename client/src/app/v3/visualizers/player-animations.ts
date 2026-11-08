import { PlayerAnimation } from '../../services/theme.service';

/** The animations of the full-screen player, as offered in its header and in Appearance */
export const PLAYER_ANIMATION_CHOICES: readonly { id: PlayerAnimation; label: string; icon: string }[] = [
  { id: 'none', label: 'Cover only', icon: 'crop_square' },
  { id: 'glow', label: 'Breathing cover', icon: 'brightness_7' },
  { id: 'spectrum', label: 'Spectrum', icon: 'graphic_eq' },
  { id: 'ambient', label: 'Ambient backdrop', icon: 'blur_on' },
  { id: 'disc', label: 'Spinning disc', icon: 'album' },
];
