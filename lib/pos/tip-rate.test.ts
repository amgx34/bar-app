import { describe, it, expect } from 'vitest';
import { tipsPerHour } from './tip-rate';

describe('tipsPerHour', () => {
  it('divides the night\'s tips by the hours that earned them', () => {
    expect(tipsPerHour(200, 400, 20)).toBe(30);
  });

  it('is null when no hours were recorded', () => {
    // Not Infinity, and not the tip total dressed up as a rate.
    expect(tipsPerHour(200, 400, 0)).toBeNull();
  });

  it('is null when the hours figure is not a usable number', () => {
    expect(tipsPerHour(200, 400, Number.NaN)).toBeNull();
    expect(tipsPerHour(200, 400, -5)).toBeNull();
  });

  it('is null when no tips were recorded at all', () => {
    // An unentered jar count, far more often than a room that tipped nothing.
    expect(tipsPerHour(0, 0, 20)).toBeNull();
  });

  it('treats a null column as nothing rather than abandoning the other half', () => {
    expect(tipsPerHour(null, 400, 20)).toBe(20);
    expect(tipsPerHour(200, null, 20)).toBe(10);
  });

  it('rounds to the cent, so the figure can be printed as money', () => {
    expect(tipsPerHour(100, 0, 3)).toBe(33.33);
  });
});
