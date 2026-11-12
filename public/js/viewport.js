export const MIN_VIEWPORT_WIDTH = 240;
export const MAX_VIEWPORT_WIDTH = 7680;
export const VIEWPORT_PRESETS = [390, 768, 1024, 1440, 1920, 2560, 3840, 5120, 7680];

export function validateViewportWidth(value) {
  const width = Number(value);
  if (!Number.isInteger(width) || width < MIN_VIEWPORT_WIDTH || width > MAX_VIEWPORT_WIDTH) {
    throw new Error(`Chiều rộng phải là số nguyên từ ${MIN_VIEWPORT_WIDTH} đến ${MAX_VIEWPORT_WIDTH}px.`);
  }
  return width;
}
