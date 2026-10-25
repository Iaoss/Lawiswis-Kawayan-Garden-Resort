import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import HeroSlider, { HERO_SLIDES } from './HeroSlider';

describe('HeroSlider', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('changes photo on its own every 4 seconds, even with the mouse over it', () => {
    render(<HeroSlider />);
    const region = screen.getByRole('region', { name: 'Resort photos' });
    fireEvent.mouseEnter(region);
    expect(screen.getByAltText(HERO_SLIDES[0].alt)).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(4000); });
    expect(screen.getByAltText(HERO_SLIDES[1].alt)).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(4000); });
    expect(screen.getByAltText(HERO_SLIDES[2].alt)).toBeInTheDocument();
  });

  test('has no side arrows, and pause stops it', () => {
    render(<HeroSlider />);
    expect(screen.queryByLabelText('Next photo')).toBeNull();
    fireEvent.click(screen.getByLabelText('Pause slideshow'));
    act(() => { jest.advanceTimersByTime(12000); });
    expect(screen.queryByAltText(HERO_SLIDES[1].alt)).toBeNull();
  });
});
