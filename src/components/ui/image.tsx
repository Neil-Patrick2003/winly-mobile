import { Image as ExpoImage } from 'expo-image';
import { withUniwind } from 'uniwind';

/**
 * expo-image with `className` support. Uniwind only wires up React Native's
 * own components by default; third-party ones have to be registered.
 */
export const Image = withUniwind(ExpoImage);
